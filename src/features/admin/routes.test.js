import { test, describe, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import Fastify from 'fastify';
import { registerAdminRoutes } from './routes.js';
import pool from '../../db.js';

describe('Admin Routes', () => {
  let app;
  let mockClient;

  beforeEach(async () => {
    app = Fastify({
      ajv: {
        customOptions: {
          removeAdditional: false,
          allErrors: true,
        },
      },
    });

    // Mock authentication hooks matching jwt.js behavior
    app.decorate('adminAuthenticate', async (request, reply) => {
      const auth = request.headers.authorization;
      if (!auth || auth !== 'Bearer valid_token') {
        return reply.status(401).send({ error: 'Unauthorized Admin' });
      }
      request.user = { role: request.headers['x-role'] || 'super_admin' };
    });

    await app.register(registerAdminRoutes, { prefix: '/admin' });

    mockClient = {
      query: mock.fn(async () => ({ rows: [], rowCount: 0 })),
      release: mock.fn(() => {}),
    };
    mock.method(pool, 'connect', async () => mockClient);
  });

  afterEach(() => {
    mock.restoreAll();
  });

  // ── Auth / Role checks (existing TASK-010 coverage) ─────────────────

  test('[ADMIN.CR.03] GET /admin/tenants returns 403 if not super_admin', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/admin/tenants',
      headers: {
        authorization: 'Bearer valid_token',
        'x-role': 'operator',
      },
    });
    assert.strictEqual(response.statusCode, 403);
  });

  // ── GET /admin/tenants (paginated) ──────────────────────────────────

  test('[ADMIN.FN.07] GET /admin/tenants?page=1&limit=10 returns paginated data with meta', async () => {
    mockClient.query.mock.mockImplementation(async (q) => {
      if (typeof q === 'string' && q.includes('COUNT')) return { rows: [{ total: 25 }] };
      if (typeof q === 'string' && q.includes('SELECT')) return { rows: [{ id: '1', name: 'T1' }] };
      return { rows: [] };
    });

    const response = await app.inject({
      method: 'GET',
      url: '/admin/tenants?page=1&limit=10',
      headers: { authorization: 'Bearer valid_token' },
    });
    assert.strictEqual(response.statusCode, 200);
    const body = response.json();
    assert.ok(body.data);
    assert.ok(body.meta);
    assert.strictEqual(body.meta.total, 25);
    assert.strictEqual(body.meta.page, 1);
    assert.strictEqual(body.meta.limit, 10);
  });

  test('GET /admin/tenants filters out soft-deleted tenants', async () => {
    const queries = [];
    mockClient.query.mock.mockImplementation(async (q) => {
      if (typeof q === 'string') queries.push(q);
      if (typeof q === 'string' && q.includes('COUNT')) return { rows: [{ total: 3 }] };
      if (typeof q === 'string' && q.includes('SELECT')) return { rows: [] };
      return { rows: [] };
    });

    await app.inject({
      method: 'GET',
      url: '/admin/tenants',
      headers: { authorization: 'Bearer valid_token' },
    });

    // Both the COUNT and the SELECT queries must include the soft-delete filter
    const countQuery = queries.find(q => q.includes('COUNT'));
    const selectQuery = queries.find(q => q.includes('SELECT') && q.includes('LIMIT'));
    assert.ok(countQuery.includes('deleted_at IS NULL'), 'COUNT must filter soft-deleted');
    assert.ok(selectQuery.includes('deleted_at IS NULL'), 'SELECT must filter soft-deleted');
  });

  test('[ADMIN.CR.12] GET /admin/tenants?page=-1 returns 400', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/admin/tenants?page=-1',
      headers: { authorization: 'Bearer valid_token' },
    });
    assert.strictEqual(response.statusCode, 400);
  });

  // ── POST /admin/tenants ─────────────────────────────────────────────

  test('[ADMIN.FN.04] POST /admin/tenants creates tenant and returns 201', async () => {
    mockClient.query.mock.mockImplementation(async (q, params) => {
      if (typeof q === 'string' && q.includes('INSERT')) {
        return {
          rows: [{ id: params[0], name: params[1], created_at: '2026-04-27T00:00:00Z' }],
          rowCount: 1,
        };
      }
      return { rows: [] };
    });

    const response = await app.inject({
      method: 'POST',
      url: '/admin/tenants',
      headers: { authorization: 'Bearer valid_token', 'content-type': 'application/json' },
      payload: { name: 'Acme Corp' },
    });
    assert.strictEqual(response.statusCode, 201);
    const body = response.json();
    assert.ok(body.id);
    assert.strictEqual(body.name, 'Acme Corp');
  });

  test('[ADMIN.CR.04] POST /admin/tenants with duplicate name returns 409', async () => {
    mockClient.query.mock.mockImplementation(async (q) => {
      if (typeof q === 'string' && q.includes('INSERT')) {
        const err = new Error('unique_violation');
        err.code = '23505';
        throw err;
      }
      return { rows: [] };
    });

    const response = await app.inject({
      method: 'POST',
      url: '/admin/tenants',
      headers: { authorization: 'Bearer valid_token', 'content-type': 'application/json' },
      payload: { name: 'Duplicate Corp' },
    });
    assert.strictEqual(response.statusCode, 409);
  });

  test('[ADMIN.CR.05] POST /admin/tenants without name returns 400', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/admin/tenants',
      headers: { authorization: 'Bearer valid_token', 'content-type': 'application/json' },
      payload: {},
    });
    assert.strictEqual(response.statusCode, 400);
  });

  test('[ADMIN.CR.06] POST /admin/tenants with additional fields returns 400', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/admin/tenants',
      headers: { authorization: 'Bearer valid_token', 'content-type': 'application/json' },
      payload: { name: 'Good', hackerField: 'injected' },
    });
    assert.strictEqual(response.statusCode, 400);
  });

  test('[ADMIN.IN.04] POST /admin/tenants with no auth returns 401', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/admin/tenants',
      headers: { 'content-type': 'application/json' },
      payload: { name: 'No Auth' },
    });
    assert.strictEqual(response.statusCode, 401);
  });

  // ── GET /admin/tenants/:id ──────────────────────────────────────────

  test('[ADMIN.FN.06] GET /admin/tenants/:id returns tenant detail', async () => {
    const tenantId = '01926d8c-5a00-7000-8000-000000000001';
    mockClient.query.mock.mockImplementation(async (q) => {
      if (typeof q === 'string' && q.includes('SELECT')) {
        return { rows: [{ id: tenantId, name: 'Test', created_at: '2026-01-01', deleted_at: null }] };
      }
      return { rows: [] };
    });

    const response = await app.inject({
      method: 'GET',
      url: `/admin/tenants/${tenantId}`,
      headers: { authorization: 'Bearer valid_token' },
    });
    assert.strictEqual(response.statusCode, 200);
    const body = response.json();
    assert.strictEqual(body.id, tenantId);
    assert.strictEqual(body.name, 'Test');
    assert.ok('deleted_at' in body, 'Response must include deleted_at field');
  });

  test('[ADMIN.CR.10] GET /admin/tenants/:id with non-existent UUID returns 404', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/admin/tenants/01926d8c-5a00-7000-8000-000000000099',
      headers: { authorization: 'Bearer valid_token' },
    });
    assert.strictEqual(response.statusCode, 404);
  });

  test('[ADMIN.CR.11] GET /admin/tenants/:id with malformed id returns 400', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/admin/tenants/not-a-uuid',
      headers: { authorization: 'Bearer valid_token' },
    });
    assert.strictEqual(response.statusCode, 400);
  });

  test('GET /admin/tenants/:id with UUID embedded in prefix returns 400 (anchor check)', async () => {
    // This test kills Stryker mutant: removal of ^ anchor from UUID_REGEX
    const response = await app.inject({
      method: 'GET',
      url: '/admin/tenants/prefix-01926d8c-5a00-7000-8000-000000000001',
      headers: { authorization: 'Bearer valid_token' },
    });
    assert.strictEqual(response.statusCode, 400);
  });

  // ── PATCH /admin/tenants/:id ────────────────────────────────────────

  test('[ADMIN.FN.05] PATCH /admin/tenants/:id updates tenant', async () => {
    const tenantId = '01926d8c-5a00-7000-8000-000000000001';
    mockClient.query.mock.mockImplementation(async (q) => {
      if (typeof q === 'string' && q.includes('UPDATE')) {
        return { rows: [{ id: tenantId, name: 'New Name', created_at: '2026-01-01', deleted_at: null }], rowCount: 1 };
      }
      return { rows: [] };
    });

    const response = await app.inject({
      method: 'PATCH',
      url: `/admin/tenants/${tenantId}`,
      headers: { authorization: 'Bearer valid_token', 'content-type': 'application/json' },
      payload: { name: 'New Name' },
    });
    assert.strictEqual(response.statusCode, 200);
    assert.strictEqual(response.json().name, 'New Name');
  });

  test('PATCH /admin/tenants/:id guards against modifying soft-deleted tenants', async () => {
    const queries = [];
    mockClient.query.mock.mockImplementation(async (q) => {
      if (typeof q === 'string') queries.push(q);
      // Simulate: UPDATE ... WHERE id = $1 AND deleted_at IS NULL → 0 rows (soft-deleted)
      if (typeof q === 'string' && q.includes('UPDATE')) return { rows: [], rowCount: 0 };
      return { rows: [] };
    });

    const response = await app.inject({
      method: 'PATCH',
      url: '/admin/tenants/01926d8c-5a00-7000-8000-000000000001',
      headers: { authorization: 'Bearer valid_token', 'content-type': 'application/json' },
      payload: { name: 'Resurrected' },
    });
    assert.strictEqual(response.statusCode, 404);
    // Verify the UPDATE query includes soft-delete guard
    const updateQuery = queries.find(q => q.includes('UPDATE'));
    assert.ok(updateQuery.includes('deleted_at IS NULL'), 'UPDATE must guard against soft-deleted');
  });

  test('[ADMIN.CR.07] PATCH /admin/tenants/:id with non-existent id returns 404', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/admin/tenants/01926d8c-5a00-7000-8000-000000000099',
      headers: { authorization: 'Bearer valid_token', 'content-type': 'application/json' },
      payload: { name: 'Ghost' },
    });
    assert.strictEqual(response.statusCode, 404);
  });

  test('[ADMIN.CR.08] PATCH /admin/tenants/:id with empty body returns 400', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/admin/tenants/01926d8c-5a00-7000-8000-000000000001',
      headers: { authorization: 'Bearer valid_token', 'content-type': 'application/json' },
      payload: {},
    });
    assert.strictEqual(response.statusCode, 400);
  });

  test('[ADMIN.CR.09] PATCH /admin/tenants/:id with duplicate name returns 409', async () => {
    mockClient.query.mock.mockImplementation(async (q) => {
      if (typeof q === 'string' && q.includes('UPDATE')) {
        const err = new Error('unique_violation');
        err.code = '23505';
        throw err;
      }
      return { rows: [] };
    });

    const response = await app.inject({
      method: 'PATCH',
      url: '/admin/tenants/01926d8c-5a00-7000-8000-000000000001',
      headers: { authorization: 'Bearer valid_token', 'content-type': 'application/json' },
      payload: { name: 'Taken Name' },
    });
    assert.strictEqual(response.statusCode, 409);
  });

  // ── DELETE /admin/tenants/:id (soft-delete) ─────────────────────────

  test('[ADMIN.IN.03] DELETE /admin/tenants/:id requires confirm=true query', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: '/admin/tenants/01926d8c-5a00-7000-8000-000000000001',
      headers: { authorization: 'Bearer valid_token' },
    });
    assert.strictEqual(response.statusCode, 400);
  });

  test('DELETE /admin/tenants/:id with malformed UUID returns 400', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: '/admin/tenants/not-a-uuid?confirm=true',
      headers: { authorization: 'Bearer valid_token' },
    });
    assert.strictEqual(response.statusCode, 400);
  });

  test('DELETE /admin/tenants/:id rejects extra query params (additionalProperties)', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: '/admin/tenants/01926d8c-5a00-7000-8000-000000000001?confirm=true&inject=evil',
      headers: { authorization: 'Bearer valid_token' },
    });
    assert.strictEqual(response.statusCode, 400);
  });

  test('DELETE /admin/tenants/:id returns 404 if not found or already deleted', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: '/admin/tenants/01926d8c-5a00-7000-8000-000000000099?confirm=true',
      headers: { authorization: 'Bearer valid_token' },
    });
    assert.strictEqual(response.statusCode, 404);
  });

  test('DELETE /admin/tenants/:id performs soft-delete (UPDATE deleted_at), not hard DELETE', async () => {
    const tenantId = '01926d8c-5a00-7000-8000-000000000001';
    const queries = [];
    mockClient.query.mock.mockImplementation(async (q) => {
      if (typeof q === 'string') queries.push(q);
      if (typeof q === 'string' && q.includes('UPDATE') && q.includes('deleted_at')) {
        return { rowCount: 1, rows: [{ id: tenantId }] };
      }
      return { rows: [] };
    });

    const response = await app.inject({
      method: 'DELETE',
      url: `/admin/tenants/${tenantId}?confirm=true`,
      headers: { authorization: 'Bearer valid_token' },
    });
    assert.strictEqual(response.statusCode, 200);
    assert.deepStrictEqual(response.json(), { status: 'deleted', id: tenantId });

    // Critical: verify no physical DELETE was attempted
    const deleteQueries = queries.filter(q => q.startsWith('DELETE'));
    assert.strictEqual(deleteQueries.length, 0, 'Must NOT use physical DELETE (trigger blocks it)');

    // Verify soft-delete UPDATE was used
    const updateQuery = queries.find(q => q.includes('UPDATE') && q.includes('deleted_at'));
    assert.ok(updateQuery, 'Must use UPDATE ... SET deleted_at = now()');
    assert.ok(updateQuery.includes('deleted_at IS NULL'), 'Must guard against double-delete');
  });

  test('DELETE /admin/tenants/:id is idempotent (already soft-deleted returns 404)', async () => {
    mockClient.query.mock.mockImplementation(async (q) => {
      if (typeof q === 'string' && q.includes('UPDATE')) return { rowCount: 0, rows: [] };
      return { rows: [] };
    });

    const response = await app.inject({
      method: 'DELETE',
      url: '/admin/tenants/01926d8c-5a00-7000-8000-000000000001?confirm=true',
      headers: { authorization: 'Bearer valid_token' },
    });
    assert.strictEqual(response.statusCode, 404);
  });

  // ── GET /admin/jobs (filtered) ──────────────────────────────────────

  test('[ADMIN.FN.08] GET /admin/jobs?state=failed filters by state', async () => {
    mockClient.query.mock.mockImplementation(async (q) => {
      if (typeof q === 'string' && q.includes('SELECT')) {
        assert.ok(q.includes('state'), 'Query should filter by state');
        return { rows: [{ id: '1', state: 'failed' }] };
      }
      return { rows: [] };
    });

    const response = await app.inject({
      method: 'GET',
      url: '/admin/jobs?state=failed',
      headers: { authorization: 'Bearer valid_token' },
    });
    assert.strictEqual(response.statusCode, 200);
  });

  test('[ADMIN.FN.09] GET /admin/jobs?tenant_id=X filters by tenant', async () => {
    const tid = '01926d8c-5a00-7000-8000-000000000001';
    mockClient.query.mock.mockImplementation(async (q) => {
      if (typeof q === 'string' && q.includes('SELECT')) {
        assert.ok(q.includes('tenant_id'), 'Query should filter by tenant_id');
        return { rows: [] };
      }
      return { rows: [] };
    });

    const response = await app.inject({
      method: 'GET',
      url: `/admin/jobs?tenant_id=${tid}`,
      headers: { authorization: 'Bearer valid_token' },
    });
    assert.strictEqual(response.statusCode, 200);
  });

  test('[ADMIN.CR.13] GET /admin/jobs?limit=9999 is capped at 100', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/admin/jobs?limit=9999',
      headers: { authorization: 'Bearer valid_token' },
    });
    // Schema validation rejects limit > 100
    assert.strictEqual(response.statusCode, 400);
  });

  // ── Resilience ──────────────────────────────────────────────────────

  test('Rollback is called on query error', async () => {
    mockClient.query.mock.mockImplementation(async (q) => {
      if (typeof q === 'string' && q.includes('COUNT')) throw new Error('DB Error');
      return { rows: [] };
    });
    const response = await app.inject({
      method: 'GET',
      url: '/admin/tenants',
      headers: { authorization: 'Bearer valid_token' },
    });
    assert.strictEqual(response.statusCode, 500);
    const rollbackCall = mockClient.query.mock.calls.find(c => c.arguments[0] === 'ROLLBACK');
    assert.ok(rollbackCall, 'ROLLBACK must be called on error');
  });

  test('withAdminClient survives ROLLBACK failure on dead connection', async () => {
    mockClient.query.mock.mockImplementation(async (q) => {
      if (typeof q === 'string' && q.includes('COUNT')) throw new Error('DB Error');
      if (q === 'ROLLBACK') throw new Error('Connection terminated');
      return { rows: [] };
    });
    const response = await app.inject({
      method: 'GET',
      url: '/admin/tenants',
      headers: { authorization: 'Bearer valid_token' },
    });
    // Must not crash — the 500 is from the original error, not the rollback
    assert.strictEqual(response.statusCode, 500);
    assert.strictEqual(mockClient.release.mock.callCount(), 1, 'Client must be released even if ROLLBACK fails');
  });

  test('[ADMIN.RS.04] POST during PG down returns 500 without duplicates', async () => {
    mock.method(pool, 'connect', async () => {
      throw new Error('Connection refused');
    });

    const response = await app.inject({
      method: 'POST',
      url: '/admin/tenants',
      headers: { authorization: 'Bearer valid_token', 'content-type': 'application/json' },
      payload: { name: 'Orphan' },
    });
    assert.strictEqual(response.statusCode, 500);
  });

  test('Client is always released after operations', async () => {
    mockClient.query.mock.mockImplementation(async (q) => {
      if (typeof q === 'string' && q.includes('COUNT')) return { rows: [{ total: 0 }] };
      if (typeof q === 'string' && q.includes('SELECT')) return { rows: [] };
      return { rows: [] };
    });

    await app.inject({
      method: 'GET',
      url: '/admin/tenants',
      headers: { authorization: 'Bearer valid_token' },
    });
    assert.strictEqual(mockClient.release.mock.callCount(), 1, 'Client must be released');
  });
});
