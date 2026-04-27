import { test, describe, mock, beforeEach } from 'node:test';
import assert from 'node:assert';
import Fastify from 'fastify';
import { registerSyncInbox } from './routes.js';
import pool from '../../db.js';

describe('Sync Inbox Routes', () => {
  let app;

  beforeEach(async () => {
    app = Fastify();
    
    app.decorate('authenticate', async (request, reply) => {
      if (request.headers.authorization !== 'Bearer valid_token') {
        throw new Error('Unauthorized');
      }
      request.user = { tenant_id: '123', sub: 'user_1' };
    });

    app.decorate('boss', {
      send: mock.fn(async () => 'job_123')
    });

    await app.register(registerSyncInbox, { prefix: '/api/v1' });

    mock.method(pool, 'query', async (text) => {
      if (text.includes('INSERT')) return { rowCount: 1 };
      return { rowCount: 0 };
    });
  });

  test('POST /api/v1/sync/inbox returns 400 if invalid payload', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/sync/inbox',
      headers: { authorization: 'Bearer valid_token' },
      payload: { wrong: 'data' }
    });
    assert.strictEqual(response.statusCode, 400);
  });

  test('POST /api/v1/sync/inbox returns 202 on success', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/sync/inbox',
      headers: { authorization: 'Bearer valid_token' },
      payload: { id: '01905555-5555-7555-8555-555555555555', tenant_id: '01905555-5555-7555-8555-555555555556', payload: { foo: 'bar' } }
    });
    assert.strictEqual(response.statusCode, 202);
    assert.strictEqual(response.json().accepted, true);
  });

  test('Error throws 500', async () => {
    mock.method(pool, 'query', async () => {
      throw new Error('DB Error');
    });
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/sync/inbox',
      headers: { authorization: 'Bearer valid_token' },
      payload: { id: '01905555-5555-7555-8555-555555555555', tenant_id: '01905555-5555-7555-8555-555555555556', payload: { foo: 'bar' } }
    });
    assert.strictEqual(response.statusCode, 500);
  });
});
