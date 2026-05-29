// WhatsApp Baileys Worker (Dynamic Sandbox Orchestrator)
// Constraint: §4.3 Isolated Docker Container, no HTTP blocking

import { makeWASocket, DisconnectReason, fetchLatestBaileysVersion, downloadMediaMessage, extractMessageContent, getContentType } from '@whiskeysockets/baileys';
import { createHash } from 'node:crypto';
import { v7 as uuidv7 } from 'uuid';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { s3 } from '../../features/storage/s3-client.js';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import { PgBoss } from 'pg-boss';
import pool from '../../db.js';
import config from '../../config.js';
import { usePgAuthState, clearAuthCache } from './auth-state.js';

const log = pino({ level: 'info' }).child({ module: 'baileys-orchestrator' });

export const deps = {
  makeWASocket,
  fetchLatestBaileysVersion,
};

// Active sessions map: tenantId -> { sock, sessionId, log, qrAttempts, hadCredentials }
export const activeSessions = new Map();

// Shared pg-boss instance for lifecycle event publishing
export let sharedBoss = null;

export async function startSession(tenantId, sessionId) {
  const sessionLog = pino({ level: 'info' }).child({ tenantId, sessionId });
  sessionLog.info('Starting WhatsApp socket session...');

  async function updateSessionStatus(status) {
    await pool.query(
      `UPDATE wapp_sessions SET status = $1, updated_at = now() WHERE id = $2 AND tenant_id = $3`,
      [status, sessionId, tenantId]
    );
  }

  try {
    let { state, saveCreds } = await usePgAuthState(tenantId, sessionId);
    const { version, isLatest } = await deps.fetchLatestBaileysVersion();
    
    sessionLog.info(`Using WA v${version.join('.')}, isLatest: ${isLatest}`);

    const sock = deps.makeWASocket({
      version,
      logger: sessionLog,
      printQRInTerminal: false, // We update DB instead
      auth: state,
      markOnlineOnConnect: false, // Prevents presence update hang
      browser: ['Ubuntu', 'Chrome', '120.0.0.0'], // Prevents generic throttling
      syncFullHistory: false, // Don't hang on massive history syncs
      generateHighQualityLinkPreview: false,
      getMessage: async () => {
        return { conversation: 'hello' };
      }
    });

    sock.ev.on('creds.update', saveCreds);

    // Track credential state dynamically: starts as initial check, updates when creds are saved
    let hadCredentials = state.creds?.me?.id ? true : false;
    // Track QR attempt count per session to detect expiry
    let qrAttemptCount = 0;
    // Track whether pairing was configured (QR scanned, creds exchanged)
    let pairingConfigured = false;

    // Update credential tracking on every creds save (captures post-pairing state)
    const originalSaveCreds = saveCreds;
    saveCreds = async (update) => {
      if (update) {
        Object.assign(state.creds, update);
      }
      await originalSaveCreds();
      hadCredentials = true;
    };
    sock.ev.removeAllListeners('creds.update');
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      // Detect pairing event (Baileys emits this after QR scan, before stream restart)
      if (update.me) {
        pairingConfigured = true;
        Object.assign(state.creds, { me: update.me });
        await saveCreds();
        sessionLog.info({ me: update.me }, 'Pairing configured, stream restart expected.');
      }

      if (qr) {
        qrAttemptCount++;
        sessionLog.info({ attempt: qrAttemptCount }, 'QR Code generated. Scan it with WhatsApp.');
        qrcode.generate(qr, { small: true });
        try {
          const res = await pool.query(
            `UPDATE wapp_sessions
             SET status = 'qr_pending', qr_code = $1, qr_generated_at = now(), updated_at = now()
             WHERE id = $2 AND tenant_id = $3`,
            [qr, sessionId, tenantId]
          );
          sessionLog.info({ rowCount: res.rowCount, attempt: qrAttemptCount }, 'QR code stored in DB');
        } catch (dbErr) {
          sessionLog.error({ err: dbErr.message }, 'Failed to update qr_code in DB');
        }
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error)?.output?.statusCode;
        const isLoggedOut = statusCode === DisconnectReason.loggedOut;
        const isTimedOut = statusCode === DisconnectReason.timedOut || statusCode === 408;
        const isStreamRestart = statusCode === 515;
        sessionLog.warn({ statusCode, hadCredentials, pairingConfigured }, 'Connection closed');

        // Emit lifecycle job for visibility in Job Queues
        try {
          if (sharedBoss) {
            await sharedBoss.send('wapp-lifecycle', {
              event: 'connection_closed',
              tenantId,
              sessionId,
              statusCode,
              isLoggedOut,
              hadCredentials,
              pairingConfigured,
              qrAttemptCount,
            });
          }
        } catch (e) { sessionLog.error({ err: e.message }, 'Failed to emit lifecycle job'); }

        if (isLoggedOut) {
          // User logged out from phone: clear everything
          sessionLog.info('Logged out. Disconnected. Clearing session.');
          await updateSessionStatus('disconnected');
          await pool.query(
            `UPDATE wapp_sessions 
             SET deleted_at = now(), status = 'disconnected', qr_code = NULL, credentials = '{}' 
             WHERE id = $1 AND tenant_id = $2`,
            [sessionId, tenantId]
          );
          stopSession(tenantId);
        } else if (isStreamRestart || pairingConfigured) {
          // 515 = Baileys stream restart after pairing or protocol negotiation.
          // This is the EXPECTED flow after QR scan. Always reconnect.
          sessionLog.info({ statusCode }, 'Stream restart required (expected after pairing). Reconnecting...');
          stopSession(tenantId);
          await startSession(tenantId, sessionId);
        } else if (hadCredentials) {
          // Had real credentials but lost connection (network, server restart): auto-reconnect
          sessionLog.info('Had credentials, auto-reconnecting...');
          stopSession(tenantId);
          await startSession(tenantId, sessionId);
        } else if (isTimedOut && qrAttemptCount > 0) {
          // QR expired without being scanned: mark as expired, do NOT auto-reconnect
          sessionLog.info('QR timed out without scan. Marking session as qr_expired.');
          await pool.query(
            `UPDATE wapp_sessions
             SET status = 'qr_expired', qr_code = NULL, updated_at = now()
             WHERE id = $1 AND tenant_id = $2`,
            [sessionId, tenantId]
          );
          stopSession(tenantId);
        } else {
          // Unknown scenario: stop but don't auto-reconnect to avoid loops
          sessionLog.warn({ statusCode, hadCredentials, pairingConfigured, qrAttemptCount }, 'Connection closed in unhandled state. Stopping session.');
          await updateSessionStatus('disconnected');
          stopSession(tenantId);
        }
      } else if (connection === 'open') {
        sessionLog.info('Connection opened successfully');
        await pool.query(
          `UPDATE wapp_sessions
           SET status = 'connected', qr_code = NULL, qr_scanned_at = now(), qr_scanned_by = 'user', updated_at = now()
           WHERE id = $1 AND tenant_id = $2`,
          [sessionId, tenantId]
        );
        // Emit lifecycle job for connection established
        try {
          if (sharedBoss) {
            await sharedBoss.send('wapp-lifecycle', {
              event: 'connection_opened',
              tenantId,
              sessionId,
            });
          }
        } catch (e) { sessionLog.error({ err: e.message }, 'Failed to emit lifecycle job'); }
      }
    });

    sock.ev.on('messages.upsert', async (m) => {
      if (m.type === 'notify') {
        for (const msg of m.messages) {
          sessionLog.info({
            fromMe: msg.key.fromMe,
            remoteJid: msg.key.remoteJid,
            id: msg.key.id,
            types: msg.message ? Object.keys(msg.message) : []
          }, 'Raw message intercepted');

          {
            const isFromMe = !!msg.key.fromMe;
            const from = msg.key.remoteJidAlt || msg.key.remoteJid;
            
            if (!from || from.endsWith('@g.us') || from.includes('@broadcast') || from.includes('@newsletter')) {
              sessionLog.info({ from }, 'Silently discarding group/broadcast/malformed message');
              continue;
            }

            const content = msg.message ? extractMessageContent(msg.message) : null;
            const type = content ? getContentType(content) : null;
            
            // Ignore system/protocol messages (e.g. End-to-End encryption syncs) to avoid spamming 
            // the activity log when the host connects via QR.
            if (!content || type === 'protocolMessage' || type === 'senderKeyDistributionMessage') {
              sessionLog.info({ from, type }, 'Silently discarding system/protocol message');
              continue;
            }

            sessionLog.info({ from, type, isFromMe }, 'Received valid message');
            
            try {
              const msgId = uuidv7();
              const textContent = content?.conversation || 
                                  content?.extendedTextMessage?.text || 
                                  content?.imageMessage?.caption || 
                                  content?.videoMessage?.caption || 
                                  content?.documentMessage?.caption || 
                                  content?.documentWithCaptionMessage?.message?.documentMessage?.caption || 
                                  '';

              if (!isFromMe) {
                const client = await pool.connect();
                try {
                  await client.query('BEGIN');
                  await client.query(`SELECT set_config('request.jwt.claims.tenant_id', $1, true)`, [tenantId]);

                  await client.query(
                    `INSERT INTO wapp_incoming (id, tenant_id, sender, message) VALUES ($1, $2, $3, $4)`,
                    [msgId, tenantId, from, msg]
                  );
                  await client.query('COMMIT');
                } catch (err) {
                  await client.query('ROLLBACK');
                  throw err;
                } finally {
                  client.release();
                }
              }

              // Emit lifecycle job for incoming/outgoing message visibility in Job Queues
              try {
                if (sharedBoss) {
                  await sharedBoss.send('wapp-lifecycle', {
                    event: 'message_received',
                    tenantId,
                    sessionId,
                    sender: from,
                    messageId: msgId,
                    isFromMe,
                    pushName: msg.pushName,
                    type,
                    textContent,
                    message: msg
                  });
                }
              } catch (e) { sessionLog.error({ err: e.message }, 'Failed to emit message lifecycle job'); }
              
              if (!isFromMe) {
                // ── Universal Media Handling ─────────────────────────────────
                // MASTER-SPEC §7.5: All media types are intercepted, stored in S3,
                // and tracked in storage_objects with SHA-256 deduplication.
                const MEDIA_TYPE_MAP = {
                  audioMessage:    { category: 'audio',    ext: 'ogg',  mime: 'audio/ogg' },
                  imageMessage:    { category: 'image',    ext: 'jpg',  mime: 'image/jpeg' },
                  videoMessage:    { category: 'video',    ext: 'mp4',  mime: 'video/mp4' },
                  stickerMessage:  { category: 'image',    ext: 'webp', mime: 'image/webp' },
                  documentMessage: { category: 'document', ext: null,   mime: null }, // ext/mime from payload
                  documentWithCaptionMessage: { category: 'document', ext: null, mime: null },
                };
                const mediaMeta = MEDIA_TYPE_MAP[type];
                
                if (mediaMeta) {
                  // For documents, extract actual mimetype and extension from the payload
                  let ext = mediaMeta.ext;
                  let mimeType = mediaMeta.mime;
                  if (mediaMeta.category === 'document') {
                    const docPayload = content?.documentMessage || content?.documentWithCaptionMessage?.message?.documentMessage;
                    mimeType = docPayload?.mimetype || 'application/octet-stream';
                    const docFileName = docPayload?.fileName || '';
                    const dotIdx = docFileName.lastIndexOf('.');
                    ext = dotIdx > 0 ? docFileName.substring(dotIdx + 1).toLowerCase() : 'bin';
                  }

                  sessionLog.info({ from, category: mediaMeta.category, type, ext }, 'Media message detected, downloading...');
                  try {
                    const buffer = await downloadMediaMessage(msg, 'buffer', {}, { logger: sessionLog, reuploadRequest: sock.updateMediaMessage });
                    
                    // SHA-256 dedup: skip upload if identical content already exists for this tenant
                    const sha256 = createHash('sha256').update(buffer).digest('hex');
                    const client = await pool.connect();
                    try {
                      const dupCheck = await client.query(
                        `SELECT id, file_name, storage_key FROM storage_objects WHERE tenant_id = $1 AND sha256 = $2 AND deleted_at IS NULL`,
                        [tenantId, sha256]
                      );
                      if (dupCheck.rows.length > 0) {
                        sessionLog.info({ sha256, existingFile: dupCheck.rows[0].file_name }, 'Duplicate content detected, skipping S3 upload');
                        const s3Url = `minio://jarvis-private/${dupCheck.rows[0].storage_key}`;
                        await client.query('BEGIN');
                        await client.query(`SELECT set_config('request.jwt.claims.tenant_id', $1, true)`, [tenantId]);
                        await client.query(
                          `INSERT INTO sync_inbox (id, tenant_id, payload, status)
                           VALUES ($1, $2, $3, 'pending')
                           ON CONFLICT (id) DO NOTHING`,
                          [msgId, tenantId, JSON.stringify({ type: mediaMeta.category, s3_url: s3Url, sender: from, message: textContent })]
                        );
                        await client.query('COMMIT');
                        client.release();
                        // Still emit sync-inbox-process with the existing s3_url
                        const boss = new PgBoss(config.boss.connectionString);
                        await boss.start();
                        await boss.send('sync-inbox-process', {
                          inboxId: msgId, tenantId,
                          payload: { type: mediaMeta.category, s3_url: s3Url, sender: from, message: textContent }
                        });
                        await boss.stop();
                      } else {
                        // Upload to S3 and register in storage_objects
                        const key = `inbox/${tenantId}/${msgId}.${ext}`;
                        await s3.send(new PutObjectCommand({
                          Bucket: 'jarvis-private',
                          Key: key,
                          Body: buffer,
                          ContentType: mimeType
                        }));
                        
                        const fileId = uuidv7();
                        const fileName = `${msgId}.${ext}`;
                        
                        await client.query('BEGIN');
                        await client.query(`SELECT set_config('request.jwt.claims.tenant_id', $1, true)`, [tenantId]);
                        await client.query(
                          `INSERT INTO storage_objects (id, tenant_id, file_name, size, mime_type, storage_key, status, sha256)
                           VALUES ($1, $2, $3, $4, $5, $6, 'uploaded', $7)`,
                          [fileId, tenantId, fileName, buffer.length, mimeType, key, sha256]
                        );
                        const s3Url = `minio://jarvis-private/${key}`;
                        await client.query(
                          `INSERT INTO sync_inbox (id, tenant_id, payload, status)
                           VALUES ($1, $2, $3, 'pending')
                           ON CONFLICT (id) DO NOTHING`,
                          [msgId, tenantId, JSON.stringify({ type: mediaMeta.category, s3_url: s3Url, sender: from, message: textContent })]
                        );
                        await client.query('COMMIT');
                        client.release();
                        sessionLog.info({ s3Url, fileId, sha256, category: mediaMeta.category }, 'Media uploaded to S3 with dedup tracking');
                        
                        const boss = new PgBoss(config.boss.connectionString);
                        await boss.start();
                        await boss.send('sync-inbox-process', {
                          inboxId: msgId, tenantId,
                          payload: { type: mediaMeta.category, s3_url: s3Url, sender: from, message: textContent }
                        });
                        await boss.stop();
                      }
                    } catch (err) {
                      await client.query('ROLLBACK').catch(() => {});
                      client.release();
                      throw err;
                    }
                  } catch (mediaErr) {
                    sessionLog.error({ err: mediaErr.message, type }, 'Failed to process media message');
                  }
                }
              }
              
            } catch (err) {
              sessionLog.error({ err: err.message }, 'Failed to save incoming message');
            }
          }
        }
      }
    });

    activeSessions.set(tenantId, { sock, sessionId, log: sessionLog, qrAttempts: qrAttemptCount, hadCredentials });
  } catch (err) {
    sessionLog.error({ err: err.message }, 'Failed to initialize session socket');
  }
}

export function stopSession(tenantId) {
  const session = activeSessions.get(tenantId);
  if (session) {
    session.log.info('Stopping WhatsApp session...');
    try {
      session.sock.end();
    } catch (e) {
      // Ignore socket end errors
    }
    activeSessions.delete(tenantId);
  }
}

export async function runOrchestrator() {
  log.info('Starting Asynchronous Event-Driven Baileys Worker...');

  const boss = new PgBoss(config.boss.connectionString);
  boss.on('error', (err) => log.error({ err: err.message }, 'pg-boss error in baileys worker'));
  await boss.start();
  sharedBoss = boss;
  
  // Explicitly register queues with retry policies
  await boss.createQueue('wapp-send-process', { retryBackoff: true, retryLimit: 5 });
  await boss.createQueue('wapp-session-control', { retryBackoff: true, retryLimit: 5 });
  await boss.createQueue('wapp-lifecycle', { retryBackoff: false, retryLimit: 0 });

  // Sink worker: auto-completes lifecycle jobs so they show as 'completed' in Job Queues.
  // These jobs exist purely for observability — no processing logic needed.
  await boss.work('wapp-lifecycle', { teamSize: 5, teamConcurrency: 5 }, async () => {});

  // 1. Startup Bootstrap (Single Run): Recover previously active sessions
  try {
    const { rows } = await pool.query(
      "SELECT id, tenant_id FROM wapp_sessions WHERE deleted_at IS NULL AND status IN ('connected', 'qr_pending')"
    );
    log.info({ count: rows.length }, 'Restoring active WhatsApp sessions on startup...');
    for (const row of rows) {
      await startSession(row.tenant_id, row.id);
    }
  } catch (err) {
    log.error({ err: err.message }, 'Failed to restore active sessions on startup bootstrap');
  }

  // 2. Consume Outgoing WhatsApp Messages queue
  const sendOptions = { teamSize: 5, teamConcurrency: 5, newJobCheckInterval: 2000 };
  await boss.work('wapp-send-process', sendOptions, async (jobs) => {
    for (const job of jobs) {
      const { to, text, tenantId } = job.data;
      const session = activeSessions.get(tenantId);
      if (!session) {
        log.warn({ jobId: job.id, tenantId }, 'No active WhatsApp session found for this tenant, skipping');
        throw new Error('No active connection');
      }

      session.log.info({ jobId: job.id, to }, 'Sending outgoing WhatsApp message');
      try {
        await session.sock.sendMessage(to, { text });
      } catch (err) {
        session.log.error({ err: err.message, to }, 'Failed to send WhatsApp message');
        throw err;
      }
    }
  });

  // 3. Consume Session Control Event Queue (Event-Driven Onboarding/Teardown)
  const controlOptions = { teamSize: 5, teamConcurrency: 5, newJobCheckInterval: 1000 };
  await boss.work('wapp-session-control', controlOptions, async (jobs) => {
    for (const job of jobs) {
      const { action, tenantId, sessionId } = job.data;
      log.info({ action, tenantId, sessionId }, 'Processing WhatsApp session control job');

      if (action === 'reconnect') {
        log.info({ tenantId }, 'Triggering reconnection / credentials reset via pg-boss...');
        stopSession(tenantId);
        await pool.query(
          "UPDATE wapp_sessions SET credentials = '{}', status = 'waiting_qr', qr_code = NULL WHERE id = $1 AND tenant_id = $2",
          [sessionId, tenantId]
        );
        clearAuthCache(sessionId);
        await startSession(tenantId, sessionId);
      } else if (action === 'disconnect') {
        log.info({ tenantId }, 'Triggering soft-delete and socket termination via pg-boss...');
        stopSession(tenantId);
        await pool.query(
          `UPDATE wapp_sessions 
           SET deleted_at = now(), status = 'disconnected', qr_code = NULL, credentials = '{}' 
           WHERE id = $1 AND tenant_id = $2`,
          [sessionId, tenantId]
        );
      }
    }
  });
}

if (process.env.NODE_ENV !== 'test') {
  runOrchestrator().catch(err => {
    log.fatal({ err }, 'Asynchronous orchestrator failed to start');
    process.exit(1);
  });
}
