// WhatsApp Baileys Worker (Dynamic Sandbox Orchestrator)
// Constraint: §4.3 Isolated Docker Container, no HTTP blocking
// Constraint: MASTER-SPEC §2 — All adapter→Core payloads MUST use CloudEvent spec 1.0

import { wrapPayload, isCloudEvent, CE_TYPES } from '../../lib/cloudevent.js';

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

// Active sessions map: channelId -> { sock, sessionId, tenantId, log, qrAttempts, hadCredentials }
export const activeSessions = new Map();

// Shared pg-boss instance for lifecycle event publishing
export let sharedBoss = null;

export async function startSession(channelId, tenantId, sessionId) {
  const sessionLog = pino({ level: 'info' }).child({ tenantId, sessionId });
  sessionLog.info('Starting WhatsApp socket session...');

  async function updateSessionStatus(status) {
    await pool.query(
      `UPDATE wapp_sessions SET status = $1, updated_at = now() WHERE id = $2 AND tenant_id = $3`,
      [status, sessionId, tenantId]
    );
    if (channelId) {
      await pool.query(
        `UPDATE wapp_channels SET status = $1 WHERE id = $2 AND tenant_id = $3`,
        [status, channelId, tenantId]
      );
    }
  }

  try {
    let channelConfig = {};
    if (channelId) {
      const configRes = await pool.query('SELECT config FROM wapp_channels WHERE id = $1 AND tenant_id = $2', [channelId, tenantId]);
      if (configRes.rows.length > 0 && configRes.rows[0].config) {
        channelConfig = configRes.rows[0].config;
      }
    }

    let { state, saveCreds } = await usePgAuthState(tenantId, sessionId);
    const { version, isLatest } = await deps.fetchLatestBaileysVersion();
    
    sessionLog.info(`Using WA v${version.join('.')}, isLatest: ${isLatest}`);

    const sock = deps.makeWASocket({
      version,
      logger: sessionLog,
      printQRInTerminal: false, // We update DB instead
      auth: state,
      markOnlineOnConnect: channelConfig.markOnlineOnConnect !== false, 
      browser: ['Ubuntu', 'Chrome', '120.0.0.0'], // Prevents generic throttling
      syncFullHistory: channelConfig.syncHistory === true, 
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

      // Extract phone number from creds.me dynamically and update the channel phone_number
      if (state.creds?.me?.id && channelId) {
        const match = state.creds.me.id.match(/^(\d+)/);
        if (match) {
          const phoneNumber = match[1];
          try {
            await pool.query(
              `UPDATE wapp_channels
               SET phone_number = $1
               WHERE id = $2 AND tenant_id = $3 AND phone_number IS DISTINCT FROM $1`,
              [phoneNumber, channelId, tenantId]
            );
          } catch (err) {
            sessionLog.error({ err: err.message }, 'Failed to update phone_number in creds.update');
          }
        }
      }
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
          if (channelId) {
            await pool.query(
              `UPDATE wapp_channels SET status = 'qr_pending' WHERE id = $1 AND tenant_id = $2`,
              [channelId, tenantId]
            );
          }
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
            await sharedBoss.send('wapp-lifecycle', wrapPayload(
              CE_TYPES.CHANNEL_WHATSAPP_LIFECYCLE, 'adapter/baileys',
              { event: 'connection_closed', tenantId, sessionId, statusCode, isLoggedOut, hadCredentials, pairingConfigured, qrAttemptCount, channelId },
              { tenantid: tenantId, channelid: channelId }
            ));
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
          if (channelId) {
            await pool.query(
              `UPDATE wapp_channels SET status = 'disconnected' WHERE id = $1 AND tenant_id = $2`,
              [channelId, tenantId]
            );
          }
          stopSession(channelId);
        } else if (isStreamRestart || pairingConfigured) {
          // 515 = Baileys stream restart after pairing or protocol negotiation.
          // This is the EXPECTED flow after QR scan. Always reconnect.
          sessionLog.info({ statusCode }, 'Stream restart required (expected after pairing). Reconnecting...');
          stopSession(channelId);
          await startSession(channelId, tenantId, sessionId);
        } else if (hadCredentials) {
          // Had real credentials but lost connection (network, server restart): auto-reconnect
          sessionLog.info('Had credentials, auto-reconnecting...');
          stopSession(channelId);
          await startSession(channelId, tenantId, sessionId);
        } else if (isTimedOut && qrAttemptCount > 0) {
          // QR expired without being scanned: mark as expired, do NOT auto-reconnect
          sessionLog.info('QR timed out without scan. Marking session as qr_expired.');
          await pool.query(
            `UPDATE wapp_sessions
             SET status = 'qr_expired', qr_code = NULL, updated_at = now()
             WHERE id = $1 AND tenant_id = $2`,
            [sessionId, tenantId]
          );
          if (channelId) {
            await pool.query(
              `UPDATE wapp_channels SET status = 'qr_expired' WHERE id = $1 AND tenant_id = $2`,
              [channelId, tenantId]
            );
          }
          stopSession(channelId);
        } else if (qrAttemptCount === 0) {
          // Connection failed/timed out BEFORE any QR code was generated (e.g. 408 on initial connect).
          // We should retry connecting so the user actually gets a QR code.
          sessionLog.info({ statusCode }, 'Connection closed before generating QR, retrying...');
          stopSession(channelId);
          // Small delay before retrying
          setTimeout(() => startSession(channelId, tenantId, sessionId), 2000);
        } else {
          // Unknown scenario: stop but don't auto-reconnect to avoid loops
          sessionLog.warn({ statusCode, hadCredentials, pairingConfigured, qrAttemptCount }, 'Connection closed in unhandled state. Stopping session.');
          await updateSessionStatus('disconnected');
          stopSession(channelId);
        }
      } else if (connection === 'open') {
        sessionLog.info('Connection opened successfully');
        let phoneNumber = null;
        if (sock.user && sock.user.id) {
          const match = sock.user.id.match(/^(\d+)/);
          if (match) {
            phoneNumber = match[1];
          }
        }
        await pool.query(
          `UPDATE wapp_sessions
           SET status = 'connected', qr_code = NULL, qr_scanned_at = now(), qr_scanned_by = 'user', updated_at = now()
           WHERE id = $1 AND tenant_id = $2`,
          [sessionId, tenantId]
        );
        if (channelId) {
          await pool.query(
            `UPDATE wapp_channels
             SET status = 'connected', phone_number = COALESCE($1, phone_number)
             WHERE id = $2 AND tenant_id = $3`,
            [phoneNumber, channelId, tenantId]
          );
        }
        // Emit lifecycle job for connection established
        try {
          if (sharedBoss) {
            await sharedBoss.send('wapp-lifecycle', wrapPayload(
              CE_TYPES.CHANNEL_WHATSAPP_LIFECYCLE, 'adapter/baileys',
              { event: 'connection_opened', tenantId, sessionId, channelId },
              { tenantid: tenantId, channelid: channelId }
            ));
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
            
            if (!isFromMe && channelConfig.readReceipts !== false) {
              try {
                await sock.readMessages([msg.key]);
              } catch (e) {
                sessionLog.warn({ err: e.message }, 'Failed to send read receipt');
              }
            }
            
            try {
              const msgId = uuidv7();
              const textContent = content?.conversation || 
                                  content?.extendedTextMessage?.text || 
                                  content?.imageMessage?.caption || 
                                  content?.videoMessage?.caption || 
                                  content?.documentMessage?.caption || 
                                  content?.documentWithCaptionMessage?.message?.documentMessage?.caption || 
                                  '';

              const MEDIA_TYPE_MAP = {
                audioMessage:    { category: 'audio',    ext: 'ogg',  mime: 'audio/ogg' },
                imageMessage:    { category: 'image',    ext: 'jpg',  mime: 'image/jpeg' },
                videoMessage:    { category: 'video',    ext: 'mp4',  mime: 'video/mp4' },
                stickerMessage:  { category: 'image',    ext: 'webp', mime: 'image/webp' },
                documentMessage: { category: 'document', ext: null,   mime: null },
                documentWithCaptionMessage: { category: 'document', ext: null, mime: null },
              };
              const mediaMeta = MEDIA_TYPE_MAP[type];
              const isMedia = !!mediaMeta;

              if (!isMedia) {
                // ── EPIC-004: Contact directory lookup result holders ──────
                // Declared at if-block scope so they remain accessible after
                // the inner try/catch that performs the DB transaction.
                let contactId = null;
                let contactMetadata = {};
                let contactDisplayName = null;

                const client = await pool.connect();
                try {
                  await client.query('BEGIN');
                  await client.query(`SELECT set_config('request.jwt.claims.tenant_id', $1, true)`, [tenantId]);

                  // ── EPIC-004: Channel direction + visibility checks ──────
                  const visibility = channelConfig.visibility || 'public';
                  const direction = channelConfig.direction || 'bidirectional';

                  // Direction guard: skip inbound processing for outbound-only channels
                  if (direction === 'outbound_only' && !isFromMe) {
                    sessionLog.info({ from, direction }, 'Discarding inbound message on outbound-only channel');
                    await client.query('ROLLBACK');
                    client.release();
                    continue;
                  }

                  // ── EPIC-004: Contact directory lookup for private channels ──

                  if (!isFromMe && visibility === 'private') {
                    // Extract phone number from JID (e.g. "56912345678@s.whatsapp.net" → "56912345678")
                    const senderPhone = from.replace(/@.*$/, '');
                    const contactRes = await client.query(
                      `SELECT ca.contact_id, tc.display_name, tc.metadata
                       FROM contact_addresses ca
                       JOIN tenant_contacts tc ON tc.id = ca.contact_id
                       WHERE ca.tenant_id = $1 AND ca.channel_type = 'phone' AND ca.address = $2
                         AND tc.deleted_at IS NULL
                       LIMIT 1`,
                      [tenantId, senderPhone]
                    );

                    if (contactRes.rows.length === 0) {
                      // Unregistered sender on private channel: send fallback and skip
                      const fallbackMsg = channelConfig.fallback_message || null;
                      if (fallbackMsg && sharedBoss) {
                        await sharedBoss.send('wapp-send-process', wrapPayload(
                          CE_TYPES.CHANNEL_WHATSAPP_MESSAGE_OUTBOUND, 'adapter/baileys',
                          { to: from, text: fallbackMsg, tenantId, channelId },
                          { tenantid: tenantId, channelid: channelId }
                        ));
                      }
                      sessionLog.info({ from, visibility }, 'Unregistered sender on private channel, fallback sent');
                      await client.query('ROLLBACK');
                      client.release();
                      continue;
                    }

                    contactId = contactRes.rows[0].contact_id;
                    contactDisplayName = contactRes.rows[0].display_name;
                    contactMetadata = contactRes.rows[0].metadata || {};
                  } else if (!isFromMe && visibility === 'public') {
                    // Public channel: try to enrich with contact data if available
                    const senderPhone = from.replace(/@.*$/, '');
                    const contactRes = await client.query(
                      `SELECT ca.contact_id, tc.display_name, tc.metadata
                       FROM contact_addresses ca
                       JOIN tenant_contacts tc ON tc.id = ca.contact_id
                       WHERE ca.tenant_id = $1 AND ca.channel_type = 'phone' AND ca.address = $2
                         AND tc.deleted_at IS NULL
                       LIMIT 1`,
                      [tenantId, senderPhone]
                    );
                    if (contactRes.rows.length > 0) {
                      contactId = contactRes.rows[0].contact_id;
                      contactDisplayName = contactRes.rows[0].display_name;
                      contactMetadata = contactRes.rows[0].metadata || {};
                    }
                  }

                  const status = isFromMe ? 'done' : 'pending';
                  const processedAt = isFromMe ? new Date() : null;

                  await client.query(
                    `INSERT INTO sync_inbox (id, tenant_id, payload, status, processed_at)
                     VALUES ($1, $2, $3, $4, $5)
                     ON CONFLICT (id) DO NOTHING`,
                    [
                      msgId,
                      tenantId,
                      JSON.stringify({
                        type: 'text',
                        sender: from,
                        message: textContent,
                        channelId,
                        isFromMe,
                        contact_id: contactId,
                        contact_display_name: contactDisplayName,
                        contact_metadata: contactMetadata,
                      }),
                      status,
                      processedAt
                    ]
                  );
                  await client.query('COMMIT');
                } catch (err) {
                  await client.query('ROLLBACK');
                  throw err;
                } finally {
                  client.release();
                }

                if (!isFromMe && sharedBoss) {
                  await sharedBoss.send('sync-inbox-process', wrapPayload(
                    CE_TYPES.CHANNEL_WHATSAPP_MESSAGE_INBOUND, 'adapter/baileys',
                    { inboxId: msgId, tenantId, payload: {
                      type: 'text', sender: from, message: textContent, channelId,
                      contact_id: contactId, contact_metadata: contactMetadata,
                    }},
                    { tenantid: tenantId, channelid: channelId, contactid: contactId }
                  ));
                }
              }

              // Emit lifecycle job for incoming/outgoing message visibility in Job Queues
              try {
                if (sharedBoss) {
                  await sharedBoss.send('wapp-lifecycle', wrapPayload(
                    CE_TYPES.CHANNEL_WHATSAPP_LIFECYCLE, 'adapter/baileys',
                    { event: 'message_received', tenantId, sessionId, sender: from, messageId: msgId, isFromMe, pushName: msg.pushName, type, textContent, message: msg, channelId },
                    { tenantid: tenantId, channelid: channelId }
                  ));
                }
              } catch (e) { sessionLog.error({ err: e.message }, 'Failed to emit message lifecycle job'); }
              
              if (isMedia) {
                // ── Universal Media Handling ─────────────────────────────────
                // MASTER-SPEC §7.5: All media types are intercepted, stored in S3,
                // and tracked in storage_objects with SHA-256 deduplication.

                // ── Direction + visibility guards (parity with text path) ────
                const visibility = channelConfig.visibility || 'public';
                const direction = channelConfig.direction || 'bidirectional';

                if (direction === 'outbound_only' && !isFromMe) {
                  sessionLog.info({ from, direction, type }, 'Discarding inbound media on outbound-only channel');
                  continue;
                }

                // Contact directory lookup (same logic as text path)
                let contactId = null;
                let contactMetadata = {};

                if (!isFromMe) {
                  const senderPhone = from.replace(/@.*$/, '');
                  const lookupClient = await pool.connect();
                  try {
                    await lookupClient.query('BEGIN');
                    await lookupClient.query(`SELECT set_config('request.jwt.claims.tenant_id', $1, true)`, [tenantId]);
                    const contactRes = await lookupClient.query(
                      `SELECT ca.contact_id, tc.display_name, tc.metadata
                       FROM contact_addresses ca
                       JOIN tenant_contacts tc ON tc.id = ca.contact_id
                       WHERE ca.tenant_id = $1 AND ca.channel_type = 'phone' AND ca.address = $2
                         AND tc.deleted_at IS NULL
                       LIMIT 1`,
                      [tenantId, senderPhone]
                    );
                    await lookupClient.query('COMMIT');

                    if (visibility === 'private' && contactRes.rows.length === 0) {
                      const fallbackMsg = channelConfig.fallback_message || null;
                      if (fallbackMsg && sharedBoss) {
                        await sharedBoss.send('wapp-send-process', wrapPayload(
                          CE_TYPES.CHANNEL_WHATSAPP_MESSAGE_OUTBOUND, 'adapter/baileys',
                          { to: from, text: fallbackMsg, tenantId, channelId },
                          { tenantid: tenantId, channelid: channelId }
                        ));
                      }
                      sessionLog.info({ from, visibility, type }, 'Unregistered sender media on private channel, fallback sent');
                      continue;
                    }

                    if (contactRes.rows.length > 0) {
                      contactId = contactRes.rows[0].contact_id;
                      contactMetadata = contactRes.rows[0].metadata || {};
                    }
                  } finally {
                    lookupClient.release();
                  }
                }

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

                    const status = isFromMe ? 'done' : 'pending';
                    const processedAt = isFromMe ? new Date() : null;

                    // Build consistent payload with contact data
                    const buildMediaPayload = (s3Url) => ({
                      type: mediaMeta.category,
                      s3_url: s3Url,
                      sender: from,
                      message: textContent,
                      channelId,
                      isFromMe,
                      contact_id: contactId,
                      contact_display_name: contactDisplayName,
                      contact_metadata: contactMetadata,
                    });

                    if (dupCheck.rows.length > 0) {
                      sessionLog.info({ sha256, existingFile: dupCheck.rows[0].file_name }, 'Duplicate content detected, skipping S3 upload');
                      const s3Url = `minio://jarvis-private/${dupCheck.rows[0].storage_key}`;
                      await client.query('BEGIN');
                      await client.query(`SELECT set_config('request.jwt.claims.tenant_id', $1, true)`, [tenantId]);
                      await client.query(
                        `INSERT INTO sync_inbox (id, tenant_id, payload, status, processed_at)
                         VALUES ($1, $2, $3, $4, $5)
                         ON CONFLICT (id) DO NOTHING`,
                        [msgId, tenantId, JSON.stringify(buildMediaPayload(s3Url)), status, processedAt]
                      );
                      await client.query('COMMIT');
                      client.release();

                      if (!isFromMe && sharedBoss) {
                        await sharedBoss.send('sync-inbox-process', wrapPayload(
                          CE_TYPES.CHANNEL_WHATSAPP_MESSAGE_INBOUND, 'adapter/baileys',
                          { inboxId: msgId, tenantId, payload: buildMediaPayload(s3Url) },
                          { tenantid: tenantId, channelid: channelId, contactid: contactId }
                        ));
                      }
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
                      const s3Url = `minio://jarvis-private/${key}`;
                      
                      await client.query('BEGIN');
                      await client.query(`SELECT set_config('request.jwt.claims.tenant_id', $1, true)`, [tenantId]);
                      await client.query(
                        `INSERT INTO storage_objects (id, tenant_id, file_name, size, mime_type, storage_key, status, sha256)
                         VALUES ($1, $2, $3, $4, $5, $6, 'uploaded', $7)`,
                        [fileId, tenantId, fileName, buffer.length, mimeType, key, sha256]
                      );
                      await client.query(
                        `INSERT INTO sync_inbox (id, tenant_id, payload, status, processed_at)
                         VALUES ($1, $2, $3, $4, $5)
                         ON CONFLICT (id) DO NOTHING`,
                        [msgId, tenantId, JSON.stringify(buildMediaPayload(s3Url)), status, processedAt]
                      );
                      await client.query('COMMIT');
                      client.release();
                      sessionLog.info({ s3Url, fileId, sha256, category: mediaMeta.category }, 'Media uploaded to S3 with dedup tracking');
                      
                      if (!isFromMe && sharedBoss) {
                        await sharedBoss.send('sync-inbox-process', wrapPayload(
                          CE_TYPES.CHANNEL_WHATSAPP_MESSAGE_INBOUND, 'adapter/baileys',
                          { inboxId: msgId, tenantId, payload: buildMediaPayload(s3Url) },
                          { tenantid: tenantId, channelid: channelId, contactid: contactId }
                        ));
                      }
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
              
            } catch (err) {
              sessionLog.error({ err: err.message }, 'Failed to save message');
            }
          }
        }
      }
    });

    activeSessions.set(channelId, { sock, sessionId, tenantId, log: sessionLog, qrAttempts: qrAttemptCount, hadCredentials, config: channelConfig });
  } catch (err) {
    sessionLog.error({ err: err.message }, 'Failed to initialize session socket');
  }
}

export function stopSession(channelId) {
  const session = activeSessions.get(channelId);
  if (session) {
    session.log.info('Stopping WhatsApp session...');
    try {
      session.sock.end();
    } catch (e) {
      // Ignore socket end errors
    }
    activeSessions.delete(channelId);
  }
}

export async function runOrchestrator() {
  log.info('Starting Asynchronous Event-Driven Baileys Worker...');

  const boss = new PgBoss({
    connectionString: config.boss.connectionString,
    newJobCheckIntervalSeconds: config.boss.newJobCheckIntervalSeconds,
  });
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
      `SELECT s.id, s.tenant_id, s.channel_id
       FROM wapp_sessions s
       JOIN wapp_channels c ON c.id = s.channel_id
       WHERE s.deleted_at IS NULL AND c.deleted_at IS NULL
         AND s.status IN ('connected', 'qr_pending')`
    );
    log.info({ count: rows.length }, 'Restoring active WhatsApp sessions on startup...');
    for (const row of rows) {
      await startSession(row.channel_id, row.tenant_id, row.id);
    }
  } catch (err) {
    log.error({ err: err.message }, 'Failed to restore active sessions on startup bootstrap');
  }

  // 2. Consume Outgoing WhatsApp Messages queue
  const sendOptions = { teamSize: 5, teamConcurrency: 5, newJobCheckInterval: config.boss.newJobCheckIntervalSeconds * 1000 };
  await boss.work('wapp-send-process', sendOptions, async (jobs) => {
    for (const job of jobs) {
      const jobData = isCloudEvent(job.data) ? job.data.data : job.data;
      const { to, text, tenantId, channelId } = jobData;
      // Resolve session by channelId if provided, fallback to tenantId scan for backward compat
      let session = channelId ? activeSessions.get(channelId) : null;
      if (!session && tenantId) {
        // Legacy fallback: find any active session for this tenant
        for (const [, s] of activeSessions) {
          if (s.tenantId === tenantId) { session = s; break; }
        }
      }
      if (!session) {
        log.warn({ jobId: job.id, tenantId, channelId }, 'No active WhatsApp session found, skipping');
        throw new Error('No active connection');
      }

      session.log.info({ jobId: job.id, to }, 'Sending outgoing WhatsApp message');
      try {
        const config = session.config || {};
        const useTyping = config.typingIndicator !== false;
        const delay = config.delayMs !== undefined ? parseInt(config.delayMs) : 1000;

        if (useTyping) {
          await session.sock.sendPresenceUpdate('composing', to);
        }
        if (delay > 0) {
          await new Promise(r => setTimeout(r, delay));
        }
        if (useTyping) {
          await session.sock.sendPresenceUpdate('paused', to);
        }

        await session.sock.sendMessage(to, { text });
      } catch (err) {
        session.log.error({ err: err.message, to }, 'Failed to send WhatsApp message');
        throw err;
      }
    }
  });

  // 3. Consume Session Control Event Queue (Event-Driven Onboarding/Teardown)
  const controlOptions = { teamSize: 5, teamConcurrency: 5, newJobCheckInterval: config.boss.newJobCheckIntervalSeconds * 1000 };
  await boss.work('wapp-session-control', controlOptions, async (jobs) => {
    for (const job of jobs) {
      const jobData = isCloudEvent(job.data) ? job.data.data : job.data;
      const { action, tenantId, sessionId, channelId } = jobData;
      log.info({ action, tenantId, sessionId, channelId }, 'Processing WhatsApp session control job');

      // Resolve the channelId: use explicit value, or look it up from the session row
      let resolvedChannelId = channelId;
      if (!resolvedChannelId && sessionId) {
        const lookup = await pool.query('SELECT channel_id FROM wapp_sessions WHERE id = $1', [sessionId]);
        resolvedChannelId = lookup.rows[0]?.channel_id;
      }

      if (action === 'reconnect') {
        log.info({ channelId: resolvedChannelId, tenantId }, 'Triggering reconnection / credentials reset via pg-boss...');
        if (resolvedChannelId) stopSession(resolvedChannelId);
        await pool.query(
          "UPDATE wapp_sessions SET credentials = '{}', status = 'waiting_qr', qr_code = NULL WHERE id = $1 AND tenant_id = $2",
          [sessionId, tenantId]
        );
        clearAuthCache(sessionId);
        await startSession(resolvedChannelId || tenantId, tenantId, sessionId);
      } else if (action === 'disconnect') {
        log.info({ channelId: resolvedChannelId, tenantId }, 'Triggering soft-delete and socket termination via pg-boss...');
        if (resolvedChannelId) stopSession(resolvedChannelId);
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
