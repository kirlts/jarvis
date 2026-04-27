// WhatsApp Baileys Worker
// Constraint: §4.3 Isolated Docker Container, no HTTP blocking

import { makeWASocket, DisconnectReason, fetchLatestBaileysVersion, downloadMediaMessage, extractMessageContent, getContentType } from '@whiskeysockets/baileys';
import { v7 as uuidv7 } from 'uuid';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { s3 } from '../../features/storage/s3-client.js';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import { PgBoss } from 'pg-boss';
import pool from '../../db.js';
import config from '../../config.js';
import { usePgAuthState } from './auth-state.js';

const log = pino({ level: 'info' });

// We require tenantId and sessionId from env vars in Docker
const TENANT_ID = process.env.WAPP_TENANT_ID;
const SESSION_ID = process.env.WAPP_SESSION_ID;

if (!TENANT_ID || !SESSION_ID) {
  log.fatal('WAPP_TENANT_ID and WAPP_SESSION_ID are required');
  process.exit(1);
}

async function updateSessionStatus(status) {
  await pool.query(
    `UPDATE wapp_sessions SET status = $1, updated_at = now() WHERE id = $2 AND tenant_id = $3`,
    [status, SESSION_ID, TENANT_ID]
  );
}

async function startSock() {
  // Initialize pg-boss before socket so it's ready for incoming messages
  const boss = new PgBoss(config.boss.connectionString);
  boss.on('error', (err) => log.error({ err: err.message }, 'pg-boss error in baileys worker'));
  await boss.start();
  await boss.createQueue('wapp-send-process', { retryBackoff: true, retryLimit: 5 });
  await boss.createQueue('sync-inbox-process', { retryBackoff: true, retryLimit: 5 });

  const { state, saveCreds } = await usePgAuthState(TENANT_ID, SESSION_ID);
  const { version, isLatest } = await fetchLatestBaileysVersion();
  
  log.info(`Using WA v${version.join('.')}, isLatest: ${isLatest}`);

  const sock = makeWASocket({
    version,
    logger: log,
    printQRInTerminal: false, // We'll print it manually to update DB
    auth: state,
    markOnlineOnConnect: false, // Prevents presence update hang
    browser: ['Ubuntu', 'Chrome', '120.0.0.0'], // Prevents generic throttling
    syncFullHistory: false, // Don't hang on massive history syncs
    generateHighQualityLinkPreview: false,
    getMessage: async (key) => {
      // WAPP.CR.02.LLM: Fallback if Baileys needs to verify a message hash
      return { conversation: 'hello' };
    }
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      log.info('QR Code generated. Scan it with WhatsApp.');
      qrcode.generate(qr, { small: true });
      await updateSessionStatus('qr_pending');
    }

    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
      log.warn({ reason: lastDisconnect?.error }, 'Connection closed');
      
      if (shouldReconnect) {
        log.info('Reconnecting...');
        startSock();
      } else {
        log.info('Logged out. Disconnected. Clearing session.');
        await updateSessionStatus('disconnected');
        await pool.query('DELETE FROM wapp_sessions WHERE id = $1 AND tenant_id = $2', [SESSION_ID, TENANT_ID]);
        // Clear credentials? Or let the user handle it
      }
    } else if (connection === 'open') {
      log.info('Connection opened successfully');
      await updateSessionStatus('connected');
    }
  });

  sock.ev.on('messages.upsert', async (m) => {
    if (m.type === 'notify') {
      for (const msg of m.messages) {
        log.info({
          fromMe: msg.key.fromMe,
          remoteJid: msg.key.remoteJid,
          id: msg.key.id,
          types: msg.message ? Object.keys(msg.message) : []
        }, 'Raw message intercepted');

        if (!msg.key.fromMe) {
          const from = msg.key.remoteJid;
          
          // WAPP.CR.03.LLM: Descarte silencioso de grupos o malformados (soporta LID)
          if (!from || from.endsWith('@g.us') || from.includes('@broadcast') || from.includes('@newsletter')) {
            log.info({ from }, 'Silently discarding group/broadcast/malformed message');
            continue;
          }

          log.info({ from }, 'Received message');
          
          // Insert into wapp_incoming (using isolated transaction or SET LOCAL if we want RLS strictly,
          // though the worker is trusted and already scoped to TENANT_ID).
          // WAPP.FN.02 / WAPP.CR.01: Store incoming messages
          try {
            // Hoist msgId so it's accessible in the media intercept block below
            const msgId = uuidv7();

            const client = await pool.connect();
            try {
              await client.query('BEGIN');
              await client.query(`SELECT set_config('request.jwt.claims.tenant_id', $1, true)`, [TENANT_ID]);

              await client.query(
                `INSERT INTO wapp_incoming (id, tenant_id, sender, message) VALUES ($1, $2, $3, $4)`,
                [msgId, TENANT_ID, msg.key.remoteJid, msg]
              );
              await client.query('COMMIT');
            } catch (err) {
              await client.query('ROLLBACK');
              throw err;
            } finally {
              client.release();
            }
            
            // Media intercept for STUB pipeline
            const content = extractMessageContent(msg.message);
            const type = content ? getContentType(content) : null;
            
            const isAudio = type === 'audioMessage';
            const isImage = type === 'imageMessage';
            
            if (isAudio || isImage) {
              const mediaType = isAudio ? 'audio' : 'image';
              log.info({ from, mediaType, type }, 'Media message detected, processing for stub...');
              try {
                const buffer = await downloadMediaMessage(msg, 'buffer', {}, { logger: log, reuploadRequest: sock.updateMediaMessage });
                const key = `inbox/${TENANT_ID}/${msgId}.${isAudio ? 'ogg' : 'jpg'}`;
                await s3.send(new PutObjectCommand({
                  Bucket: 'jarvis-private',
                  Key: key,
                  Body: buffer,
                  ContentType: isAudio ? 'audio/ogg' : 'image/jpeg'
                }));
                const s3Url = `minio://jarvis-private/${key}`;
                log.info({ s3Url }, 'Media uploaded to S3, enqueuing to pg-boss');
                
                await boss.send('sync-inbox-process', {
                  inboxId: msgId,
                  tenantId: TENANT_ID,
                  payload: {
                    type: mediaType,
                    s3_url: s3Url,
                    sender: from
                  }
                });
              } catch (mediaErr) {
                log.error({ err: mediaErr.message }, 'Failed to process media message');
              }
            }
            
          } catch (err) {
            log.error({ err: err.message }, 'Failed to save incoming message');
          }
        }
      }
    }
  });

  log.info('pg-boss started in baileys worker, subscribing to wapp-send-process');
  // WAPP.RS.04.LLM: Backoff dinámico
  const workOptions = { teamSize: 5, teamConcurrency: 5, newJobCheckInterval: 2000 };
  await boss.work('wapp-send-process', workOptions, async (jobs) => {
    for (const job of jobs) {
      const { to, text, tenantId } = job.data;
      if (tenantId !== TENANT_ID) {
        log.warn({ jobId: job.id, tenantId }, 'Job tenant does not match worker tenant, skipping');
        throw new Error('Tenant mismatch');
      }

      log.info({ jobId: job.id, to }, 'Sending outgoing WhatsApp message');
      try {
        await sock.sendMessage(to, { text });
      } catch (err) {
        log.error({ err: err.message, to }, 'Failed to send WhatsApp message');
        // Lanzar error permite a pg-boss reintentar con backoff configurado a nivel de cola
        throw err;
      }
    }
  });

}

startSock().catch(err => {
  log.fatal({ err }, 'Worker failed to start');
  process.exit(1);
});
