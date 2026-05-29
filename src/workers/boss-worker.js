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
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const archiver = require('archiver');
import stream from 'stream';
import { v7 as uuidv7 } from 'uuid';
import { s3 } from '../features/storage/s3-client.js';
import config from '../config.js';

const log = pino({
  transport: {
    target: 'pino-pretty',
    options: { colorize: true },
  },
});

const QUEUE_NAME = 'sync-inbox-process';

const isTestEnv = process.env.NODE_ENV === 'test' || !!process.env.NODE_TEST_CONTEXT;
if (isTestEnv) {
  const isDefaultSandbox =
    (config.db.host === 'localhost' || config.db.host === '127.0.0.1' || config.db.host === '0.0.0.0') &&
    config.db.database === 'jarvis' &&
    !process.env.ALLOW_TEST_POLLUTION;

  if (isDefaultSandbox) {
    throw new Error(
      `[SECURITY/ISOLATION] Connection blocked: Attempted to connect to the active development/sandbox database ('jarvis' on localhost) during test execution. ` +
      `To prevent test pollution, tests must exclusively run against isolated ephemeral containers (Testcontainers) or an explicitly isolated test database (e.g. 'jarvis_test').`
    );
  }
}

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
      } else if (payload?.type === 'video') {
        log.info({ inboxId, tenantId, url: payload.s3_url }, 'Executing Video Stub (Transducer)');
        finalPayload = { ...payload, transcription: `[MOCK_VIDEO: Video recibido y almacenado]` };
      } else if (payload?.type === 'document') {
        log.info({ inboxId, tenantId, url: payload.s3_url }, 'Executing Document Stub (Transducer)');
        finalPayload = { ...payload, transcription: `[MOCK_DOCUMENT: Documento recibido y almacenado]` };
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

/**
 * Handle admin lifecycle events (like tenant deletion cleanup).
 */
async function handleAdminLifecycleJob(jobs) {
  for (const job of jobs) {
    const { event, tenantId } = job.data;
    if (event === 'tenant_deleted') {
      log.info({ tenantId }, 'Processing tenant_deleted lifecycle event: cleaning up physical storage objects');
      
      const client = await workerPool.connect();
      try {
        await client.query('BEGIN');
        
        // Retrieve storage objects for this tenant
        const res = await client.query(
          `SELECT id, storage_key FROM storage_objects WHERE tenant_id = $1`,
          [tenantId]
        );
        
        log.info({ tenantId, count: res.rows.length }, 'Found storage objects to clean up physically');
        
        for (const row of res.rows) {
          try {
            log.info({ key: row.storage_key }, 'Physically deleting storage object from MinIO');
            await s3.send(new DeleteObjectCommand({
              Bucket: row.storage_key.startsWith('inbox/') ? 'jarvis-private' : config.storage.bucket,
              Key: row.storage_key
            }));
          } catch (s3Err) {
            log.error({ key: row.storage_key, err: s3Err.message }, 'Failed to delete physical object from MinIO');
          }
        }
        
        // Update storage objects to deleted status in the database
        await client.query(
          `UPDATE storage_objects SET status = 'deleted', deleted_at = now() WHERE tenant_id = $1`,
          [tenantId]
        );
        
        await client.query('COMMIT');
        log.info({ tenantId, count: res.rows.length }, 'Completed physical storage cleanup for deleted tenant');
      } catch (err) {
        await client.query('ROLLBACK');
        log.error({ tenantId, err: err.message }, 'Failed to clean up storage objects for deleted tenant');
        throw err;
      } finally {
        client.release();
      }
    }
  }
}

async function handleStoragePurgeJob(jobs) {
  for (const job of jobs) {
    const { tenantId, storageKey, requestedBy } = job.data;
    log.info({ jobId: job.id, tenantId, key: storageKey }, 'Processing storage-purge job');
    try {
      await s3.send(new DeleteObjectCommand({
        Bucket: storageKey.startsWith('inbox/') ? 'jarvis-private' : config.storage.bucket,
        Key: storageKey
      }));
      log.info({ key: storageKey }, 'Successfully purged physical object from MinIO');
    } catch (err) {
      log.error({ key: storageKey, err: err.message }, 'Failed to purge physical object');
      throw err;
    }
  }
}

async function handleStorageZipJob(jobs) {
  for (const job of jobs) {
    const { ids, requestedBy } = job.data;
    log.info({ jobId: job.id, idsCount: ids.length }, 'Processing storage-zip job');
    
    const client = await workerPool.connect();
    try {
      const res = await client.query(
        'SELECT storage_key, file_name FROM storage_objects WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL',
        [ids]
      );
      const files = res.rows;
      if (files.length === 0) continue;

      const zipKey = `admin-exports/zip-${uuidv7()}.zip`;
      
      const pass = new stream.PassThrough();
      const uploadPromise = s3.send(new PutObjectCommand({
        Bucket: config.storage.bucket,
        Key: zipKey,
        Body: pass,
        ContentType: 'application/zip'
      }));

      const archive = archiver('zip', { zlib: { level: 9 } });
      archive.pipe(pass);

      for (const file of files) {
        try {
          const s3Obj = await s3.send(new GetObjectCommand({
            Bucket: file.storage_key.startsWith('inbox/') ? 'jarvis-private' : config.storage.bucket,
            Key: file.storage_key
          }));
          if (s3Obj.Body) {
            archive.append(s3Obj.Body, { name: file.file_name });
          }
        } catch (s3Err) {
          log.warn({ key: file.storage_key, err: s3Err.message }, 'Failed to append file to zip');
        }
      }

      await archive.finalize();
      await uploadPromise;

      // Complete job with zipKey so the frontend can retrieve it via API
      await boss.complete(job.id, { zipKey });
      log.info({ jobId: job.id, zipKey }, 'Successfully completed storage-zip job');
    } catch (err) {
      log.error({ jobId: job.id, err: err.message }, 'Failed storage-zip job');
      throw err;
    } finally {
      client.release();
    }
  }
}

async function start() {
  log.info({ connectionTarget: 'PG direct :5432' }, 'Starting pg-boss worker');

  // Verify direct connection (No transaction pooler / PgBouncer)
  // Under PgBouncer transaction mode, session-level advisory locks do not persist or are unsupported.
  const testPool = new pg.Pool({ connectionString: config.boss.connectionString, max: 2 });
  try {
    const client = await testPool.connect();
    const lockId = 987654;
    try {
      await client.query('SELECT pg_advisory_unlock($1)', [lockId]);
      await client.query('SELECT pg_advisory_lock($1)', [lockId]);

      // Keep client checked out (holding the lock) and check with client2 in parallel
      const client2 = await testPool.connect();
      try {
        const res = await client2.query('SELECT pg_try_advisory_lock($1) AS locked', [lockId]);
        const locked = res.rows[0].locked;
        if (locked === true) {
          throw new Error('Connection multiplexing detected: session-level advisory locks do not persist. pg-boss must connect directly to PostgreSQL (:5432) without PgBouncer transaction pooling.');
        }
        // Release lock on client2 if it was somehow acquired (failsafe)
        await client2.query('SELECT pg_advisory_unlock($1)', [lockId]);
      } finally {
        client2.release();
      }
    } finally {
      client.release();
    }
  } catch (err) {
    if (err.message.includes('multiplexing detected')) {
      log.fatal(err.message);
      process.exit(1);
      return;
    }
    if (err.message.includes('advisory lock') || err.code === '42809') {
      log.fatal('pg-boss connection check failed: Advisory locks are disabled or unsupported by the connection target. Verify you are not pointing pg-boss to PgBouncer.');
      process.exit(1);
      return;
    }
    log.warn({ err: err.message }, 'Non-fatal pg-boss pre-flight check warning');
  } finally {
    await testPool.end();
  }

  boss.on('error', (err) => {
    log.error({ err: err.message }, 'pg-boss error');
  });

  await boss.start();
  await boss.createQueue(QUEUE_NAME, { retryBackoff: true, retryLimit: 5 });
  await boss.createQueue('admin-lifecycle', { retryBackoff: true, retryLimit: 5 });
  await boss.createQueue('storage-purge', { retryBackoff: true, retryLimit: 5 });
  await boss.createQueue('storage-zip', { retryBackoff: true, retryLimit: 3 });

  log.info('pg-boss started, subscribing to queues');

  // BOSS.CR.02: Retry with backoff. BOSS.RS.02: max retries before archive.
  await boss.work(QUEUE_NAME, {
    teamSize: 5,            // Concurrent job processing
    teamConcurrency: 5,
  }, handleSyncJob);

  await boss.work('admin-lifecycle', {
    teamSize: 5,
    teamConcurrency: 5,
  }, handleAdminLifecycleJob);

  await boss.work('storage-purge', { teamSize: 5, teamConcurrency: 5 }, handleStoragePurgeJob);
  await boss.work('storage-zip', { teamSize: 2, teamConcurrency: 2 }, handleStorageZipJob);

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

if (process.env.NODE_ENV !== 'test') {
  start().catch((err) => {
    log.fatal({ err: err.message }, 'Worker failed to start');
    process.exit(1);
  });
}

export { handleSyncJob, handleAdminLifecycleJob, workerPool, boss, start };
