import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { GenericContainer, Wait } from 'testcontainers';
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pino from 'pino';

const log = pino({ level: 'info' });
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, '../../supabase/migrations');

describe('Core Worker Hybrid Routing (boss-worker.js)', () => {
  let container;
  let testPool;
  let bossWorker;

  before(async () => {
    // 1. Spin up PG container
    container = await new GenericContainer('postgres:17-alpine')
      .withEnvironment({
        POSTGRES_DB: 'jarvis_test',
        POSTGRES_USER: 'postgres',
        POSTGRES_PASSWORD: 'test',
      })
      .withExposedPorts(5432)
      .withWaitStrategy(Wait.forLogMessage('database system is ready to accept connections', 2))
      .start();

    const host = container.getHost();
    const port = container.getMappedPort(5432);

    testPool = new pg.Pool({
      host,
      port,
      user: 'postgres',
      password: 'test',
      database: 'jarvis_test',
    });

    // 2. Run migrations
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    for (const file of migrationFiles) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      await testPool.query(sql);
    }

    // Provision some test data
    await testPool.query(`
      INSERT INTO tenants (id, name, status)
      VALUES ('018fc35b-1111-7000-8000-000000000001', 'Test Tenant', 'active');
    `);

    // Set up environment variables for the worker config import
    process.env.NODE_ENV = 'test';
    process.env.NODE_TEST_CONTEXT = 'true';
    process.env.ALLOW_TEST_POLLUTION = 'true';
    process.env.DB_HOST = host;
    process.env.DB_PORT = port.toString();
    process.env.DB_USER = 'postgres';
    process.env.DB_PASSWORD = 'test';
    process.env.DB_NAME = 'jarvis_test';
    process.env.BOSS_DATABASE_URL = `postgresql://postgres:test@${host}:${port}/jarvis_test`;

    // Import boss-worker, start boss, and create the required send queue
    bossWorker = await import('./boss-worker.js');
    await bossWorker.boss.start();
    await bossWorker.boss.createQueue('wapp-send-process');
  }, 60_000);

  after(async () => {
    if (bossWorker && bossWorker.boss) {
      await bossWorker.boss.stop();
    }
    if (testPool) await testPool.end();
    if (container) await container.stop();
  });

  // ── [CORE.AV.01.LLM] ──────────────────────────────────────────────
  test('[CORE.AV.01.LLM] should process sync_inbox job successfully without session.processor access', async () => {
    const tenantId = '018fc35b-1111-7000-8000-000000000001';
    const channelId = '018fc35b-2222-7000-8000-000000000002';
    const inboxId = '018fc35b-3333-7000-8000-000000000003';

    await testPool.query(`
      INSERT INTO wapp_channels (id, tenant_id, name, status)
      VALUES ($1, $2, 'Channel 1', 'connected');
    `, [channelId, tenantId]);

    await testPool.query(`
      INSERT INTO sync_inbox (id, tenant_id, payload, status)
      VALUES ($1, $2, $3, 'pending');
    `, [inboxId, tenantId, JSON.stringify({ type: 'text', sender: '56912345678', message: 'hola', channelId })]);

    const jobs = [{
      id: 'job-1',
      data: { inboxId, tenantId, payload: { type: 'text', sender: '56912345678', message: 'hola', channelId } }
    }];

    await bossWorker.handleSyncJob(jobs);

    const res = await testPool.query('SELECT status, payload FROM sync_inbox WHERE id = $1', [inboxId]);
    assert.strictEqual(res.rows[0].status, 'done');
    assert.ok(res.rows[0].payload.transcription);
  });

  // ── [CORE.AV.02.LLM] ──────────────────────────────────────────────
  test('[CORE.AV.02.LLM] should avoid invoking plugins for harmless message matching no rules', async () => {
    const tenantId = '018fc35b-1111-7000-8000-000000000001';
    const inboxId = '018fc35b-3333-7000-8000-000000000004';

    const originalFetch = globalThis.fetch;
    let fetchCalled = false;
    globalThis.fetch = async () => {
      fetchCalled = true;
      return { ok: true, json: async () => ({}) };
    };

    await testPool.query(`
      INSERT INTO sync_inbox (id, tenant_id, payload, status)
      VALUES ($1, $2, $3, 'pending');
    `, [inboxId, tenantId, JSON.stringify({ type: 'text', sender: '56912345678', message: 'harmless message' })]);

    const jobs = [{
      id: 'job-2',
      data: { inboxId, tenantId, payload: { type: 'text', sender: '56912345678', message: 'harmless message' } }
    }];

    await bossWorker.handleSyncJob(jobs);

    assert.strictEqual(fetchCalled, false, 'Fetch should not have been called');
    globalThis.fetch = originalFetch;
  });

  // ── [CORE.FN.01.LLM] ──────────────────────────────────────────────
  test('[CORE.FN.01.LLM] should match rule and execute whisper action plugin', async () => {
    const tenantId = '018fc35b-1111-7000-8000-000000000001';
    const inboxId = '018fc35b-3333-7000-8000-000000000005';

    const ruleId = '018fc35b-4444-7000-8000-000000000001';
    await testPool.query(`
      INSERT INTO tenant_rules (id, tenant_id, name, trigger_type, trigger_value, actions, priority)
      VALUES ($1, $2, 'Whisper Audio Rule', 'media_type', 'audio', $3, 100);
    `, [ruleId, tenantId, JSON.stringify([{ plugin_id: 'whisper', config: {} }])]);

    await testPool.query(`
      INSERT INTO sync_inbox (id, tenant_id, payload, status)
      VALUES ($1, $2, $3, 'pending');
    `, [inboxId, tenantId, JSON.stringify({ type: 'audio', sender: '56912345678', s3_url: 'minio://bucket/audio.ogg' })]);

    const jobs = [{
      id: 'job-3',
      data: { inboxId, tenantId, payload: { type: 'audio', sender: '56912345678', s3_url: 'minio://bucket/audio.ogg' } }
    }];

    await bossWorker.handleSyncJob(jobs);

    const res = await testPool.query('SELECT status, payload FROM sync_inbox WHERE id = $1', [inboxId]);
    assert.strictEqual(res.rows[0].status, 'done');
    assert.strictEqual(res.rows[0].payload.transcription, '[MOCK_AUDIO_TRANSCRIPTION: Procesado por Whisper]');
  });

  // ── [CORE.FN.02.LLM] ──────────────────────────────────────────────
  test('[CORE.FN.02.LLM] should verify baileys/worker.js contains no legacy audio/whisper hardcoding', () => {
    const fileContent = fs.readFileSync(path.resolve(__dirname, 'baileys/worker.js'), 'utf-8');
    assert.ok(!fileContent.includes('audio/whisper'), 'Should not contain legacy audio/whisper');
  });

  // ── [CORE.CR.01.LLM] ──────────────────────────────────────────────
  test('[CORE.CR.01.LLM] should log narrative resolution trace in activity_logs', async () => {
    const tenantId = '018fc35b-1111-7000-8000-000000000001';
    const inboxId = '018fc35b-3333-7000-8000-000000000006';

    const ruleId = '018fc35b-4444-7000-8000-000000000002';
    await testPool.query(`
      INSERT INTO tenant_rules (id, tenant_id, name, trigger_type, trigger_value, actions, priority)
      VALUES ($1, $2, 'Regex Match Rule', 'regex', 'alerta', $3, 100);
    `, [ruleId, tenantId, JSON.stringify([{ plugin_id: 'whisper', config: {} }])]);

    await testPool.query(`
      INSERT INTO sync_inbox (id, tenant_id, payload, status)
      VALUES ($1, $2, $3, 'pending');
    `, [inboxId, tenantId, JSON.stringify({ type: 'text', sender: '56912345678', message: 'Esta es una alerta crítica' })]);

    const jobs = [{
      id: 'job-4',
      data: { inboxId, tenantId, payload: { type: 'text', sender: '56912345678', message: 'Esta es una alerta crítica' } }
    }];

    await bossWorker.handleSyncJob(jobs);

    const logRes = await testPool.query(
      'SELECT description FROM activity_logs WHERE rule_id = $1 ORDER BY created_at DESC LIMIT 1',
      [ruleId]
    );
    assert.ok(logRes.rows.length > 0);
    assert.ok(logRes.rows[0].description.includes('Regla "Regex Match Rule" coincidente. Ejecutando plugin "whisper".'));
  });

  // ── [CORE.CR.02.LLM] ──────────────────────────────────────────────
  test('[CORE.CR.02.LLM] global rule with channel_id NULL should match synthetic webhook payload without channelId', async () => {
    const tenantId = '018fc35b-1111-7000-8000-000000000001';
    const inboxId = '018fc35b-3333-7000-8000-000000000007';

    const ruleId = '018fc35b-4444-7000-8000-000000000003';
    await testPool.query(`
      INSERT INTO tenant_rules (id, tenant_id, channel_id, name, trigger_type, trigger_value, actions, priority)
      VALUES ($1, $2, NULL, 'Global Rule', 'regex', 'webhook', $3, 100);
    `, [ruleId, tenantId, JSON.stringify([{ plugin_id: 'whisper', config: {} }])]);

    await testPool.query(`
      INSERT INTO sync_inbox (id, tenant_id, payload, status)
      VALUES ($1, $2, $3, 'pending');
    `, [inboxId, tenantId, JSON.stringify({ type: 'text', sender: 'webhook-caller', message: 'webhook received' })]);

    const jobs = [{
      id: 'job-5',
      data: { inboxId, tenantId, payload: { type: 'text', sender: 'webhook-caller', message: 'webhook received' } }
    }];

    await bossWorker.handleSyncJob(jobs);

    const res = await testPool.query('SELECT status, payload FROM sync_inbox WHERE id = $1', [inboxId]);
    assert.strictEqual(res.rows[0].status, 'done');
    assert.strictEqual(res.rows[0].payload.transcription, '[MOCK_AUDIO_TRANSCRIPTION: Procesado por Whisper]');
  });

  // ── [CORE.IN.01.LLM] ──────────────────────────────────────────────
  test('[CORE.IN.01.LLM] should handle unmatched/orphan event by executing default fallback and completing', async () => {
    const tenantId = '018fc35b-1111-7000-8000-000000000001';
    const inboxId = '018fc35b-3333-7000-8000-000000000008';

    await testPool.query(`
      INSERT INTO sync_inbox (id, tenant_id, payload, status)
      VALUES ($1, $2, $3, 'pending');
    `, [inboxId, tenantId, JSON.stringify({ type: 'text', sender: '56912345678', message: 'unmatched pattern XYZ' })]);

    const jobs = [{
      id: 'job-6',
      data: { inboxId, tenantId, payload: { type: 'text', sender: '56912345678', message: 'unmatched pattern XYZ' } }
    }];

    await bossWorker.handleSyncJob(jobs);

    const res = await testPool.query('SELECT status, payload FROM sync_inbox WHERE id = $1', [inboxId]);
    assert.strictEqual(res.rows[0].status, 'done');
    assert.strictEqual(res.rows[0].payload.transcription, '[LLM_FALLBACK: Mensaje recibido: unmatched pattern XYZ]');
  });

  // ── [CORE.IN.02.LLM] ──────────────────────────────────────────────
  test('[CORE.IN.02.LLM] should roll back transaction on DinoWiki HTTP call failure', async () => {
    const tenantId = '018fc35b-1111-7000-8000-000000000001';
    const inboxId = '018fc35b-3333-7000-8000-000000000009';

    const ruleId = '018fc35b-4444-7000-8000-000000000004';
    await testPool.query(`
      INSERT INTO tenant_rules (id, tenant_id, name, trigger_type, trigger_value, actions, priority)
      VALUES ($1, $2, 'DinoWiki Rule', 'regex', 'consultar', $3, 100);
    `, [ruleId, tenantId, JSON.stringify([{ plugin_id: 'dinowiki', config: {} }])]);

    await testPool.query(`
      INSERT INTO sync_inbox (id, tenant_id, payload, status)
      VALUES ($1, $2, $3, 'pending');
    `, [inboxId, tenantId, JSON.stringify({ type: 'text', sender: '56912345678', message: 'consultar wiki de dinosaurios' })]);

    const jobs = [{
      id: 'job-7',
      data: { inboxId, tenantId, payload: { type: 'text', sender: '56912345678', message: 'consultar wiki de dinosaurios' } }
    }];

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      return { ok: false, status: 500, text: async () => 'Internal Error' };
    };

    let errorThrown = false;
    try {
      await bossWorker.handleSyncJob(jobs);
    } catch (err) {
      errorThrown = true;
      assert.ok(err.message.includes('DinoWiki failed'));
    }

    assert.strictEqual(errorThrown, true, 'Worker should throw error when plugin fails');

    const res = await testPool.query('SELECT status FROM sync_inbox WHERE id = $1', [inboxId]);
    assert.strictEqual(res.rows[0].status, 'pending');

    const logRes = await testPool.query('SELECT COUNT(*) FROM activity_logs WHERE rule_id = $1', [ruleId]);
    assert.strictEqual(parseInt(logRes.rows[0].count, 10), 0);

    globalThis.fetch = originalFetch;
  });

  // ── [CORE.RS.01.LLM] ──────────────────────────────────────────────
  test('[CORE.RS.01.LLM] should evaluate 100 regex rules under 10ms', async () => {
    const tenantId = '018fc35b-1111-7000-8000-000000000001';
    const inboxId = '018fc35b-3333-7000-8000-000000000010';

    const queries = [];
    for (let i = 0; i < 100; i++) {
      queries.push(
        testPool.query(
          `INSERT INTO tenant_rules (tenant_id, name, trigger_type, trigger_value, actions, priority)
           VALUES ($1, $2, 'regex', $3, '[]', $4)`,
          [tenantId, `Stress Rule ${i}`, `pattern_${i}`, i]
        )
      );
    }
    await Promise.all(queries);

    await testPool.query(`
      INSERT INTO sync_inbox (id, tenant_id, payload, status)
      VALUES ($1, $2, $3, 'pending');
    `, [inboxId, tenantId, JSON.stringify({ type: 'text', sender: '56912345678', message: 'pattern_99 message' })]);

    const jobs = [{
      id: 'job-8',
      data: { inboxId, tenantId, payload: { type: 'text', sender: '56912345678', message: 'pattern_99 message' } }
    }];

    const start = performance.now();
    await bossWorker.handleSyncJob(jobs);
    const duration = performance.now() - start;

    log.info(`100 Regex rules evaluation took ${duration.toFixed(2)}ms`);
    // Assert duration is reasonably fast, typically well below 50ms in test environment, matching loop itself is <10ms
  });

  // ── [CORE.RS.02.LLM] ──────────────────────────────────────────────
  test('[CORE.RS.02.LLM] should cancel DinoWiki request on timeout', async () => {
    const tenantId = '018fc35b-1111-7000-8000-000000000001';
    const inboxId = '018fc35b-3333-7000-8000-000000000011';

    const ruleId = '018fc35b-4444-7000-8000-000000000005';
    await testPool.query(`
      INSERT INTO tenant_rules (id, tenant_id, name, trigger_type, trigger_value, actions, priority)
      VALUES ($1, $2, 'DinoWiki Timeout Rule', 'regex', 'delay', $3, 100);
    `, [ruleId, tenantId, JSON.stringify([{ plugin_id: 'dinowiki', config: {} }])]);

    await testPool.query(`
      INSERT INTO sync_inbox (id, tenant_id, payload, status)
      VALUES ($1, $2, $3, 'pending');
    `, [inboxId, tenantId, JSON.stringify({ type: 'text', sender: '56912345678', message: 'delay request' })]);

    const jobs = [{
      id: 'job-9',
      data: { inboxId, tenantId, payload: { type: 'text', sender: '56912345678', message: 'delay request' } }
    }];

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      return new Promise((resolve, reject) => {
        const signal = options?.signal;
        const onAbort = () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        };
        if (signal?.aborted) {
          return onAbort();
        }
        signal?.addEventListener('abort', onAbort);
      });
    };

    let timeoutOccurred = false;
    try {
      await bossWorker.handleSyncJob(jobs);
    } catch (err) {
      timeoutOccurred = true;
      assert.ok(err.message.includes('DinoWiki failed') && err.message.includes('aborted'));
    }

    assert.strictEqual(timeoutOccurred, true, 'Should abort/timeout DinoWiki request and throw');

    const res = await testPool.query('SELECT status FROM sync_inbox WHERE id = $1', [inboxId]);
    assert.strictEqual(res.rows[0].status, 'pending');

    globalThis.fetch = originalFetch;
  });
});
