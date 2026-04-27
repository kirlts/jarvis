// pg-boss Worker – Independent Process
// Constraint: §4.7 pg-boss MUST connect directly to PG :5432
// Constraint: §4.5 Advisory locks require session continuity (no pooler)
//
// Covers: BOSS.AV.01, BOSS.FN.01-03, BOSS.CR.01-03, BOSS.IN.01-03,
//         BOSS.RS.01-03, DB.RS.02
//
// This file runs as a standalone Node process, completely decoupled
// from the Fastify HTTP Core. It consumes jobs from sync_inbox
// via pg-boss and processes them within tenant-isolated transactions.

import { PgBoss } from 'pg-boss';
import pg from 'pg';
import pino from 'pino';
import config from '../config.js';

const log = pino({
  transport: {
    target: 'pino-pretty',
    options: { colorize: true },
  },
});

const QUEUE_NAME = 'sync-inbox-process';

// BOSS.IN.02: Direct connection to PG :5432, NOT through pooler
const boss = new PgBoss(config.boss.connectionString);

// Worker-dedicated pool (BOSS.RS.03: max 10 connections)
const { Pool } = pg;
const workerPool = new Pool({
  ...config.db,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

workerPool.on('error', (err) => {
  log.error({ err: err.message }, 'Worker pool error');
});

/**
 * Process sync inbox jobs within tenant-isolated transactions.
 * BOSS.FN.02: Extracts tenant_id from payload and injects SET LOCAL.
 * BOSS.IN.01: Full rollback on handler error (0 relational inserts).
 *
 * @param {PgBoss.Job[]} jobs
 */
async function handleSyncJob(jobs) {
  for (const job of jobs) {
    const { inboxId, tenantId, payload } = job.data;

    log.info({ jobId: job.id, inboxId, tenantId }, 'Processing sync job');

    const client = await workerPool.connect();
    try {
      await client.query('BEGIN');

      // BOSS.FN.03: SET LOCAL for RLS context injection
      await client.query(
        `SELECT set_config('request.jwt.claims.tenant_id', $1, true)`,
        [tenantId]
      );

      // Mark inbox entry as processing
      await client.query(
        `UPDATE sync_inbox SET status = 'processing' WHERE id = $1`,
        [inboxId]
      );

      // The Stub (Simulated Transducer)
      let finalPayload = payload;
      if (payload?.type === 'audio') {
        log.info({ inboxId, tenantId, url: payload.s3_url }, 'Executing Audio Stub (Transducer)');
        finalPayload = { ...payload, transcription: `[MOCK_AUDIO_TRANSCRIPTION: Audio recibido]` };
      } else if (payload?.type === 'image') {
        log.info({ inboxId, tenantId, url: payload.s3_url }, 'Executing Image Stub (Transducer)');
        finalPayload = { ...payload, transcription: `[MOCK_IMAGE_OCR: Imagen analizada]` };
      }

      // Enqueue reply back to WhatsApp if we have a sender
      if (finalPayload.transcription && finalPayload.sender) {
        await boss.send('wapp-send-process', {
          to: finalPayload.sender,
          text: finalPayload.transcription,
          tenantId
        });
        log.info({ to: finalPayload.sender }, 'Enqueued transcription reply to WhatsApp');
      }

      // Mark as done
      await client.query(
        `UPDATE sync_inbox SET status = 'done', processed_at = now(), payload = $2 WHERE id = $1`,
        [inboxId, finalPayload]
      );

      await client.query('COMMIT');

      log.info({ jobId: job.id, inboxId }, 'Sync job completed');
    } catch (err) {
      // BOSS.IN.01: Strict transactional rollback
      await client.query('ROLLBACK');
      log.error({ jobId: job.id, inboxId, err: err.message }, 'Sync job failed, rolled back');
      throw err; // Let pg-boss handle retry logic for the batch
    } finally {
      client.release();
    }
  }
}

async function start() {
  log.info({ connectionTarget: 'PG direct :5432' }, 'Starting pg-boss worker');

  boss.on('error', (err) => {
    log.error({ err: err.message }, 'pg-boss error');
  });

  await boss.start();
  await boss.createQueue(QUEUE_NAME, { retryBackoff: true, retryLimit: 5 });

  log.info('pg-boss started, subscribing to queue: %s', QUEUE_NAME);

  // BOSS.CR.02: Retry with backoff. BOSS.RS.02: max retries before archive.
  await boss.work(QUEUE_NAME, {
    teamSize: 5,            // Concurrent job processing
    teamConcurrency: 5,
  }, handleSyncJob);

  log.info('Worker listening for jobs');
}

// BOSS.IN.03: Graceful shutdown and reconnection
process.on('SIGTERM', async () => {
  log.info('SIGTERM received, shutting down worker');
  await boss.stop({ graceful: true, timeout: 10_000 });
  await workerPool.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  log.info('SIGINT received, shutting down worker');
  await boss.stop({ graceful: true, timeout: 10_000 });
  await workerPool.end();
  process.exit(0);
});

start().catch((err) => {
  log.fatal({ err: err.message }, 'Worker failed to start');
  process.exit(1);
});
