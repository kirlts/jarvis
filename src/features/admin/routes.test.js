import { test, describe, mock, beforeEach } from 'node:test';
import assert from 'node:assert';
import Fastify from 'fastify';
import { registerAdminRoutes } from './routes.js';
import pool from '../../db.js';

describe('Admin Routes', () => {
  let app;
  let mockClient;

  beforeEach(async () => {
    app = Fastify();
    
    // Mock authentication hooks
    app.decorate('adminAuthenticate', async (request, reply) => {
      // Simulate auth
      const auth = request.headers.authorization;
      if (!auth || auth !== 'Bearer valid_token') {
        throw new Error('Unauthorized'); // Fastify handles this
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

  test('GET /admin/tenants returns 403 if not super_admin', async () => {
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

  test('GET /admin/tenants returns 200 and data', async () => {
    mockClient.query.mock.mockImplementation(async (q) => {
      if (q.includes('SELECT')) return { rows: [{ id: '1', name: 'Tenant 1' }] };
      return { rows: [] };
    });

    const response = await app.inject({
      method: 'GET',
      url: '/admin/tenants',
      headers: { authorization: 'Bearer valid_token' },
    });
    assert.strictEqual(response.statusCode, 200);
    assert.deepStrictEqual(response.json(), [{ id: '1', name: 'Tenant 1' }]);
    assert.strictEqual(mockClient.release.mock.callCount(), 1);
  });

  test('DELETE /admin/tenants/:id requires confirm=true query', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: '/admin/tenants/123',
      headers: { authorization: 'Bearer valid_token' },
    });
    assert.strictEqual(response.statusCode, 400);
  });

  test('DELETE /admin/tenants/:id returns 404 if not found', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: '/admin/tenants/123?confirm=true',
      headers: { authorization: 'Bearer valid_token' },
    });
    assert.strictEqual(response.statusCode, 404);
  });

  test('DELETE /admin/tenants/:id returns 200 on success', async () => {
    mockClient.query.mock.mockImplementation(async (q) => {
      if (q.includes('DELETE')) return { rowCount: 1 };
      return {};
    });

    const response = await app.inject({
      method: 'DELETE',
      url: '/admin/tenants/123?confirm=true',
      headers: { authorization: 'Bearer valid_token' },
    });
    assert.strictEqual(response.statusCode, 200);
    assert.deepStrictEqual(response.json(), { status: 'deleted', id: '123' });
  });
  
  test('Rollback is called on error', async () => {
    mockClient.query.mock.mockImplementation(async (q) => {
      if (q.includes('SELECT')) throw new Error('DB Error');
      return {};
    });
    const response = await app.inject({
      method: 'GET',
      url: '/admin/jobs',
      headers: { authorization: 'Bearer valid_token' },
    });
    assert.strictEqual(response.statusCode, 500);
    const rollbackCall = mockClient.query.mock.calls.find(c => c.arguments[0] === 'ROLLBACK');
    assert.ok(rollbackCall);
  });
});
