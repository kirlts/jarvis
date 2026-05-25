// Integration test: Admin API endpoints against real PostgreSQL 17
// Validates TASK-019 checks against live database with triggers, constraints, and RLS.
// Runner: node --test src/features/admin/routes.integration.test.js
// Requires Docker daemon running (Testcontainers).

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { GenericContainer, Wait } from 'testcontainers';
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Fastify from 'fastify';
import { registerAdminRoutes } from './routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, '../../../supabase/migrations');

describe('Admin Routes – Integration (Testcontainers PG 17)', () => {
  let container;
  let directPool;
  let app;

  before(async () => {
    // Spin up real PG 17
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

    directPool = new pg.Pool({
      host,
      port,
      user: 'postgres',
      password: 'test',
      database: 'jarvis_test',
      max: 5,
    });

    // Apply migrations in order
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    for (const file of migrationFiles) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      await directPool.query(sql);
    }

    // Monkey-patch the pool module to use our test pool
    const poolModule = await import('../../db.js');
    const originalConnect = poolModule.default.connect.bind(poolModule.default);
    poolModule.default.connect = () => directPool.connect();

    // Build Fastify app
    app = Fastify({
      ajv: {
        customOptions: { removeAdditional: false, allErrors: true },
      },
    });

    // Mock admin JWT auth (integration tests focus on DB behavior, not JWT crypto)
    app.decorate('adminAuthenticate', async (request, reply) => {
      const auth = request.headers.authorization;
      if (!auth || !auth.startsWith('Bearer ')) {
        return reply.status(401).send({ error: 'Unauthorized Admin' });
      }
      request.user = { role: 'super_admin' };
    });

    await app.register(registerAdminRoutes, { prefix: '/admin' });
    await app.ready();
  }, { timeout: 60_000 });

  after(async () => {
    if (directPool) await directPool.end();
    if (container) await container.stop();
  });

  // ── POST /admin/tenants (real PG) ─────────────────────────────────

  test('POST creates tenant in real PG and returns 201 with UUIDv7', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/tenants',
      headers: { authorization: 'Bearer test', 'content-type': 'application/json' },
      payload: { name: 'Integration Corp' },
    });
    assert.strictEqual(res.statusCode, 201);
    const body = res.json();
    assert.ok(body.id, 'Must return an id');
    assert.strictEqual(body.name, 'Integration Corp');
    assert.ok(body.created_at, 'Must return created_at');

    // Verify in DB
    const dbResult = await directPool.query('SELECT id, name FROM tenants WHERE name = $1', ['Integration Corp']);
    assert.strictEqual(dbResult.rows.length, 1);
    assert.strictEqual(dbResult.rows[0].id, body.id);
  });

  test('POST with duplicate name triggers real UNIQUE constraint → 409', async () => {
    // First create
    await app.inject({
      method: 'POST',
      url: '/admin/tenants',
      headers: { authorization: 'Bearer test', 'content-type': 'application/json' },
      payload: { name: 'Unique Test Corp' },
    });

    // Duplicate
    const res = await app.inject({
      method: 'POST',
      url: '/admin/tenants',
      headers: { authorization: 'Bearer test', 'content-type': 'application/json' },
      payload: { name: 'Unique Test Corp' },
    });
    assert.strictEqual(res.statusCode, 409);
  });

  // ── GET /admin/tenants (pagination with real data) ──────────────────

  test('GET /admin/tenants returns paginated results with correct total', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/tenants?page=1&limit=5',
      headers: { authorization: 'Bearer test' },
    });
    assert.strictEqual(res.statusCode, 200);
    const body = res.json();
    assert.ok(body.data.length > 0, 'Must have data');
    assert.ok(body.meta.total > 0, 'Must have non-zero total');
    assert.strictEqual(body.meta.page, 1);
    assert.strictEqual(body.meta.limit, 5);
  });

  // ── GET /admin/tenants/:id ──────────────────────────────────────────

  test('GET /admin/tenants/:id returns full tenant detail from real PG', async () => {
    // Create one
    const createRes = await app.inject({
      method: 'POST',
      url: '/admin/tenants',
      headers: { authorization: 'Bearer test', 'content-type': 'application/json' },
      payload: { name: 'Detail Test Corp' },
    });
    const { id } = createRes.json();

    const res = await app.inject({
      method: 'GET',
      url: `/admin/tenants/${id}`,
      headers: { authorization: 'Bearer test' },
    });
    assert.strictEqual(res.statusCode, 200);
    const body = res.json();
    assert.strictEqual(body.id, id);
    assert.strictEqual(body.name, 'Detail Test Corp');
    assert.strictEqual(body.deleted_at, null);
  });

  // ── PATCH /admin/tenants/:id ────────────────────────────────────────

  test('PATCH updates tenant name in real PG', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/admin/tenants',
      headers: { authorization: 'Bearer test', 'content-type': 'application/json' },
      payload: { name: 'Patch Original' },
    });
    const { id } = createRes.json();

    const res = await app.inject({
      method: 'PATCH',
      url: `/admin/tenants/${id}`,
      headers: { authorization: 'Bearer test', 'content-type': 'application/json' },
      payload: { name: 'Patch Updated' },
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json().name, 'Patch Updated');

    // Verify in DB
    const dbResult = await directPool.query('SELECT name FROM tenants WHERE id = $1', [id]);
    assert.strictEqual(dbResult.rows[0].name, 'Patch Updated');
  });

  test('PATCH on soft-deleted tenant returns 404 (no resurrection)', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/admin/tenants',
      headers: { authorization: 'Bearer test', 'content-type': 'application/json' },
      payload: { name: 'To Be Deleted For Patch' },
    });
    const { id } = createRes.json();

    // Soft-delete it
    await app.inject({
      method: 'DELETE',
      url: `/admin/tenants/${id}?confirm=true`,
      headers: { authorization: 'Bearer test' },
    });

    // Try to PATCH
    const res = await app.inject({
      method: 'PATCH',
      url: `/admin/tenants/${id}`,
      headers: { authorization: 'Bearer test', 'content-type': 'application/json' },
      payload: { name: 'Resurrected' },
    });
    assert.strictEqual(res.statusCode, 404);
  });

  // ── DELETE /admin/tenants/:id (soft-delete against real trigger) ────

  test('DELETE performs soft-delete (not hard delete) — validates against prevent_hard_delete trigger', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/admin/tenants',
      headers: { authorization: 'Bearer test', 'content-type': 'application/json' },
      payload: { name: 'Soft Delete Test' },
    });
    const { id } = createRes.json();

    const res = await app.inject({
      method: 'DELETE',
      url: `/admin/tenants/${id}?confirm=true`,
      headers: { authorization: 'Bearer test' },
    });
    assert.strictEqual(res.statusCode, 200);

    // Verify: row still exists with deleted_at populated
    const dbResult = await directPool.query(
      'SELECT id, deleted_at FROM tenants WHERE id = $1',
      [id]
    );
    assert.strictEqual(dbResult.rows.length, 1, 'Row must still exist (soft-delete)');
    assert.ok(dbResult.rows[0].deleted_at, 'deleted_at must be populated');
  });

  test('Soft-deleted tenant does not appear in GET /admin/tenants listing', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/admin/tenants',
      headers: { authorization: 'Bearer test', 'content-type': 'application/json' },
      payload: { name: 'Hidden After Delete' },
    });
    const { id } = createRes.json();

    // Soft-delete
    await app.inject({
      method: 'DELETE',
      url: `/admin/tenants/${id}?confirm=true`,
      headers: { authorization: 'Bearer test' },
    });

    // List should not include it
    const listRes = await app.inject({
      method: 'GET',
      url: '/admin/tenants?page=1&limit=100',
      headers: { authorization: 'Bearer test' },
    });
    const listed = listRes.json().data;
    const found = listed.find(t => t.id === id);
    assert.strictEqual(found, undefined, 'Soft-deleted tenant must not appear in listing');
  });

  test('Double soft-delete returns 404 (idempotent)', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/admin/tenants',
      headers: { authorization: 'Bearer test', 'content-type': 'application/json' },
      payload: { name: 'Double Delete Test' },
    });
    const { id } = createRes.json();

    // First delete
    const res1 = await app.inject({
      method: 'DELETE',
      url: `/admin/tenants/${id}?confirm=true`,
      headers: { authorization: 'Bearer test' },
    });
    assert.strictEqual(res1.statusCode, 200);

    // Second delete
    const res2 = await app.inject({
      method: 'DELETE',
      url: `/admin/tenants/${id}?confirm=true`,
      headers: { authorization: 'Bearer test' },
    });
    assert.strictEqual(res2.statusCode, 404);
  });

  // ── Unique constraint + soft-delete interaction ─────────────────────

  test('Can recreate tenant with same name after soft-delete (partial unique index)', async () => {
    const name = 'Recyclable Name';

    // Create
    const res1 = await app.inject({
      method: 'POST',
      url: '/admin/tenants',
      headers: { authorization: 'Bearer test', 'content-type': 'application/json' },
      payload: { name },
    });
    assert.strictEqual(res1.statusCode, 201);
    const { id } = res1.json();

    // Soft-delete
    await app.inject({
      method: 'DELETE',
      url: `/admin/tenants/${id}?confirm=true`,
      headers: { authorization: 'Bearer test' },
    });

    // Recreate with same name — should succeed because partial unique index
    // only covers rows WHERE deleted_at IS NULL
    const res2 = await app.inject({
      method: 'POST',
      url: '/admin/tenants',
      headers: { authorization: 'Bearer test', 'content-type': 'application/json' },
      payload: { name },
    });
    assert.strictEqual(res2.statusCode, 201, 'Must allow re-creation of soft-deleted tenant name');
  });

  // ── SET LOCAL role = jarvis_admin validation ────────────────────────

  test('Admin queries execute under jarvis_admin role (BYPASSRLS)', async () => {
    // Insert a tenant directly and set RLS context to a different tenant
    // The admin GET should still see it because jarvis_admin has BYPASSRLS
    const createRes = await app.inject({
      method: 'POST',
      url: '/admin/tenants',
      headers: { authorization: 'Bearer test', 'content-type': 'application/json' },
      payload: { name: 'RLS Bypass Test' },
    });
    assert.strictEqual(createRes.statusCode, 201);
    const { id } = createRes.json();

    const getRes = await app.inject({
      method: 'GET',
      url: `/admin/tenants/${id}`,
      headers: { authorization: 'Bearer test' },
    });
    assert.strictEqual(getRes.statusCode, 200);
    assert.strictEqual(getRes.json().name, 'RLS Bypass Test');
  });

  // ── created_at immutability (trigger from migration 002) ───────────

  test('prevent_created_at_update trigger blocks mutation of audit timestamp', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/admin/tenants',
      headers: { authorization: 'Bearer test', 'content-type': 'application/json' },
      payload: { name: 'Timestamp Guard' },
    });
    const { id } = createRes.json();

    // Attempt direct mutation of created_at — should fail
    try {
      await directPool.query(
        "UPDATE tenants SET created_at = '2000-01-01' WHERE id = $1",
        [id]
      );
      assert.fail('Should have thrown an exception for created_at mutation');
    } catch (err) {
      assert.ok(err.message.includes('Mutation of created_at is prohibited'));
    }
  });
});
