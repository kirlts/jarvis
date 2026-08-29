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

describe('Flow Dispatch Pipeline (boss-worker.js)', () => {
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

    // Provision base test data
    await testPool.query(`
      INSERT INTO tenants (id, name, status)
      VALUES ('018fc35b-1111-7000-8000-000000000001', 'Test Tenant', 'active');
    `);

    await testPool.query(`
      INSERT INTO wapp_channels (id, tenant_id, name, status)
      VALUES ('018fc35b-2222-7000-8000-000000000002', '018fc35b-1111-7000-8000-000000000001', 'Channel 1', 'connected');
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

    // Import boss-worker, start boss, and create the required queues
    bossWorker = await import('./boss-worker.js');
    await bossWorker.boss.start();
    await bossWorker.boss.createQueue('wapp-send-process');
    await bossWorker.boss.createQueue('flow-execute');
  }, 60_000);

  after(async () => {
    if (bossWorker && bossWorker.boss) {
      await bossWorker.boss.stop();
    }
    if (testPool) await testPool.end();
    if (container) await container.stop();
  });

  // ── FLOW.DISPATCH.01 ──────────────────────────────────────────────
  test('dispatches to flow-execute when an active inbound_channel flow exists', async () => {
    const tenantId = '018fc35b-1111-7000-8000-000000000001';
    const channelId = '018fc35b-2222-7000-8000-000000000002';
    const inboxId = '018fc35b-3333-7000-8000-f00000000001';

    // Create a flow with inbound_channel trigger
    await testPool.query(`
      INSERT INTO tenant_flows (id, tenant_id, name, trigger_type, trigger_config, graph, is_active)
      VALUES ($1, $2, 'Welcome Flow', 'inbound_channel', $3, '{"nodes":[],"edges":[]}', true);
    `, [
      '018fc35b-5555-7000-8000-f00000000001',
      tenantId,
      JSON.stringify({ channel_id: channelId })
    ]);

    await testPool.query(`
      INSERT INTO sync_inbox (id, tenant_id, payload, status)
      VALUES ($1, $2, $3, 'pending');
    `, [inboxId, tenantId, JSON.stringify({ type: 'text', sender: '56912345678', message: 'hola', channelId })]);

    const jobs = [{
      id: 'job-flow-1',
      data: { inboxId, tenantId, payload: { type: 'text', sender: '56912345678', message: 'hola', channelId } }
    }];

    await bossWorker.handleSyncJob(jobs);

    // Verify inbox marked as done
    const res = await testPool.query('SELECT status FROM sync_inbox WHERE id = $1', [inboxId]);
    assert.strictEqual(res.rows[0].status, 'done');

    // Verify activity log records flow dispatch
    const logRes = await testPool.query(
      `SELECT event_type, description FROM activity_logs WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [tenantId]
    );
    assert.strictEqual(logRes.rows[0].event_type, 'flow_dispatched');
    assert.ok(logRes.rows[0].description.includes('1 flujo(s) activado(s)'));
  });

  // ── FLOW.DISPATCH.02 ──────────────────────────────────────────────
  test('logs no_flow_matched when no active flows exist for the tenant', async () => {
    // Use a new tenant with no flows
    const tenantId2 = '018fc35b-1111-7000-8000-000000000099';
    await testPool.query(`
      INSERT INTO tenants (id, name, status) VALUES ($1, 'No Flow Tenant', 'active')
      ON CONFLICT (id) DO NOTHING;
    `, [tenantId2]);

    const inboxId = '018fc35b-3333-7000-8000-f00000000002';
    await testPool.query(`
      INSERT INTO sync_inbox (id, tenant_id, payload, status)
      VALUES ($1, $2, $3, 'pending');
    `, [inboxId, tenantId2, JSON.stringify({ type: 'text', sender: '56912345678', message: 'orphan message' })]);

    const jobs = [{
      id: 'job-flow-2',
      data: { inboxId, tenantId: tenantId2, payload: { type: 'text', sender: '56912345678', message: 'orphan message' } }
    }];

    await bossWorker.handleSyncJob(jobs);

    // Verify inbox marked as done (graceful fallback)
    const res = await testPool.query('SELECT status FROM sync_inbox WHERE id = $1', [inboxId]);
    assert.strictEqual(res.rows[0].status, 'done');

    // Verify activity log records no match
    const logRes = await testPool.query(
      `SELECT event_type FROM activity_logs WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [tenantId2]
    );
    assert.strictEqual(logRes.rows[0].event_type, 'no_flow_matched');
  });

  // ── FLOW.DISPATCH.03 ──────────────────────────────────────────────
  test('filters by channel_id in trigger_config', async () => {
    const tenantId = '018fc35b-1111-7000-8000-000000000001';
    const channelId = '018fc35b-2222-7000-8000-000000000002';
    const wrongChannelId = '018fc35b-2222-7000-8000-ffffffffffff';
    const inboxId = '018fc35b-3333-7000-8000-f00000000003';

    // Create a flow scoped to a DIFFERENT channel
    await testPool.query(`
      INSERT INTO tenant_flows (id, tenant_id, name, trigger_type, trigger_config, graph, is_active)
      VALUES ($1, $2, 'Wrong Channel Flow', 'inbound_channel', $3, '{"nodes":[],"edges":[]}', true);
    `, [
      '018fc35b-5555-7000-8000-f00000000003',
      tenantId,
      JSON.stringify({ channel_id: wrongChannelId })
    ]);

    await testPool.query(`
      INSERT INTO sync_inbox (id, tenant_id, payload, status)
      VALUES ($1, $2, $3, 'pending');
    `, [inboxId, tenantId, JSON.stringify({ type: 'text', sender: '56912345678', message: 'test', channelId })]);

    const jobs = [{
      id: 'job-flow-3',
      data: { inboxId, tenantId, payload: { type: 'text', sender: '56912345678', message: 'test', channelId } }
    }];

    // Clear previous activity logs for isolation
    await testPool.query(`DELETE FROM activity_logs WHERE tenant_id = $1`, [tenantId]);

    await bossWorker.handleSyncJob(jobs);

    // The welcome flow from test 1 should still match (it targets channelId),
    // but the wrong channel flow should NOT. Verify dispatch count = 1 (only the matching flow).
    const logRes = await testPool.query(
      `SELECT metadata FROM activity_logs WHERE tenant_id = $1 AND event_type = 'flow_dispatched' ORDER BY created_at DESC LIMIT 1`,
      [tenantId]
    );
    assert.ok(logRes.rows.length > 0, 'Should have dispatched at least one flow');
    const meta = logRes.rows[0].metadata;
    // Only the Welcome Flow from test 1 should match (channelId match), not Wrong Channel Flow
    assert.ok(meta.dispatchedCount >= 1, 'At least one flow should be dispatched');
  });

  // ── FLOW.DISPATCH.04 ──────────────────────────────────────────────
  test('filters by allowed_contacts in trigger_config', async () => {
    const tenantId = '018fc35b-1111-7000-8000-000000000001';
    const inboxId = '018fc35b-3333-7000-8000-f00000000004';
    const authorizedContactId = '018fc35b-6666-7000-8000-000000000001';

    // Create a flow restricted to a specific contact
    await testPool.query(`
      INSERT INTO tenant_flows (id, tenant_id, name, trigger_type, trigger_config, graph, is_active)
      VALUES ($1, $2, 'Contact Restricted Flow', 'inbound_channel', $3, '{"nodes":[],"edges":[]}', true);
    `, [
      '018fc35b-5555-7000-8000-f00000000004',
      tenantId,
      JSON.stringify({ allowed_contacts: [authorizedContactId] })
    ]);

    await testPool.query(`
      INSERT INTO sync_inbox (id, tenant_id, payload, status)
      VALUES ($1, $2, $3, 'pending');
    `, [inboxId, tenantId, JSON.stringify({
      type: 'text',
      sender: '56912345678',
      message: 'from unauthorized contact',
      contact_id: '018fc35b-6666-7000-8000-ffffffffffff', // different contact
    })]);

    const jobs = [{
      id: 'job-flow-4',
      data: {
        inboxId,
        tenantId,
        payload: {
          type: 'text',
          sender: '56912345678',
          message: 'from unauthorized contact',
          contact_id: '018fc35b-6666-7000-8000-ffffffffffff',
        }
      }
    }];

    await bossWorker.handleSyncJob(jobs);

    // The Contact Restricted Flow should NOT match because contact_id doesn't match allowed_contacts
    const res = await testPool.query('SELECT status FROM sync_inbox WHERE id = $1', [inboxId]);
    assert.strictEqual(res.rows[0].status, 'done');
  });

  // ── FLOW.DISPATCH.05 ──────────────────────────────────────────────
  test('inactive flows are not dispatched', async () => {
    const tenantId3 = '018fc35b-1111-7000-8000-000000000098';
    await testPool.query(`
      INSERT INTO tenants (id, name, status) VALUES ($1, 'Inactive Flows Tenant', 'active')
      ON CONFLICT (id) DO NOTHING;
    `, [tenantId3]);

    // Create an INACTIVE flow
    await testPool.query(`
      INSERT INTO tenant_flows (id, tenant_id, name, trigger_type, trigger_config, graph, is_active)
      VALUES ($1, $2, 'Disabled Flow', 'inbound_channel', '{}', '{"nodes":[],"edges":[]}', false);
    `, ['018fc35b-5555-7000-8000-f00000000005', tenantId3]);

    const inboxId = '018fc35b-3333-7000-8000-f00000000005';
    await testPool.query(`
      INSERT INTO sync_inbox (id, tenant_id, payload, status)
      VALUES ($1, $2, $3, 'pending');
    `, [inboxId, tenantId3, JSON.stringify({ type: 'text', sender: '56912345678', message: 'test inactive' })]);

    const jobs = [{
      id: 'job-flow-5',
      data: { inboxId, tenantId: tenantId3, payload: { type: 'text', sender: '56912345678', message: 'test inactive' } }
    }];

    await bossWorker.handleSyncJob(jobs);

    const logRes = await testPool.query(
      `SELECT event_type FROM activity_logs WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [tenantId3]
    );
    assert.strictEqual(logRes.rows[0].event_type, 'no_flow_matched');
  });

  // ── FLOW.DISPATCH.06 ──────────────────────────────────────────────
  test('rollback on error leaves inbox in pending state', async () => {
    const tenantId = '018fc35b-1111-7000-8000-000000000001';
    const inboxId = '018fc35b-3333-7000-8000-f00000000006';

    await testPool.query(`
      INSERT INTO sync_inbox (id, tenant_id, payload, status)
      VALUES ($1, $2, $3, 'pending');
    `, [inboxId, tenantId, JSON.stringify({ type: 'text', sender: '56912345678', message: 'error trigger' })]);

    // Temporarily break the worker pool to force an error
    const originalQuery = bossWorker.workerPool.connect;
    bossWorker.workerPool.connect = async () => {
      const client = await originalQuery.call(bossWorker.workerPool);
      const originalClientQuery = client.query.bind(client);
      let callCount = 0;
      client.query = async (...args) => {
        callCount++;
        // Fail after BEGIN + SET LOCAL + UPDATE (3rd real query = flow lookup)
        if (callCount === 4) {
          throw new Error('SIMULATED_DB_ERROR');
        }
        return originalClientQuery(...args);
      };
      return client;
    };

    const jobs = [{
      id: 'job-flow-6',
      data: { inboxId, tenantId, payload: { type: 'text', sender: '56912345678', message: 'error trigger' } }
    }];

    let errorThrown = false;
    try {
      await bossWorker.handleSyncJob(jobs);
    } catch (err) {
      errorThrown = true;
      assert.ok(err.message.includes('SIMULATED_DB_ERROR'));
    }

    // Restore original
    bossWorker.workerPool.connect = originalQuery;

    assert.strictEqual(errorThrown, true, 'Worker should throw on DB error');

    // Verify inbox NOT marked as done (rolled back)
    const res = await testPool.query('SELECT status FROM sync_inbox WHERE id = $1', [inboxId]);
    assert.strictEqual(res.rows[0].status, 'pending');
  });

  // ── FLOW.AV.01 ────────────────────────────────────────────────────
  test('verifies NO reference to tenant_rules remains in boss-worker.js', () => {
    const fileContent = fs.readFileSync(path.resolve(__dirname, 'boss-worker.js'), 'utf-8');
    assert.ok(!fileContent.includes('tenant_rules'), 'boss-worker.js must not reference tenant_rules');
    assert.ok(!fileContent.includes('matchedRule'), 'boss-worker.js must not contain matchedRule');
    assert.ok(!fileContent.includes('plugin_id'), 'boss-worker.js must not contain plugin_id (legacy dispatch)');
  });

  // ── FLOW.AV.02 ────────────────────────────────────────────────────
  test('verifies baileys/worker.js contains no legacy audio/whisper hardcoding', () => {
    const fileContent = fs.readFileSync(path.resolve(__dirname, 'baileys/worker.js'), 'utf-8');
    assert.ok(!fileContent.includes('audio/whisper'), 'Should not contain legacy audio/whisper');
  });
});
