process.env.NODE_ENV = 'test';
process.env.DB_NAME = 'jarvis_test';
process.env.BOSS_DATABASE_URL = 'postgresql://postgres:postgres_sandbox@localhost_test:5432/jarvis_test';

import test, { describe, mock, before, after, afterEach } from 'node:test';
import assert from 'node:assert';
import { EventEmitter } from 'node:events';
import { GenericContainer, Wait } from 'testcontainers';
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { deps, startSession, activeSessions, stopSession } from '../worker.js';
import { v7 as uuidv7 } from 'uuid';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, '../../../../supabase/migrations');

describe('Baileys Worker Integration - REG-014', () => {
  let container;
  let directPool;

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
    const poolModule = await import('../../../db.js');
    const originalConnect = poolModule.default.connect.bind(poolModule.default);
    poolModule.default.connect = () => directPool.connect();
    poolModule.default.query = (...args) => directPool.query(...args);
  }, { timeout: 60_000 });

  after(async () => {
    if (directPool) await directPool.end();
    if (container) await container.stop();
  });

  afterEach(() => {
    mock.restoreAll();
    // Clean up active sessions
    for (const [channelId] of activeSessions) {
      stopSession(channelId);
    }
  });

  test('[REG-014] startSession retries when connection times out (408) before QR generation', async (t) => {
    const tenantId = uuidv7();
    const channelId = uuidv7();
    const sessionId = uuidv7();

    await directPool.query('INSERT INTO tenants (id, name) VALUES ($1, $2)', [tenantId, 'Test Tenant']);
    await directPool.query('INSERT INTO wapp_channels (id, tenant_id, name, status) VALUES ($1, $2, $3, $4)', [channelId, tenantId, 'Test Channel', 'waiting_qr']);
    await directPool.query('INSERT INTO wapp_sessions (id, tenant_id, channel_id, credentials, status) VALUES ($1, $2, $3, $4, $5)', [sessionId, tenantId, channelId, '{}', 'waiting_qr']);

    // Mock fetchLatestBaileysVersion
    mock.method(deps, 'fetchLatestBaileysVersion', async () => {
      return { version: [2, 3000, 0], isLatest: true };
    });

    let startSessionCallCount = 0;
    const fakeEv = new EventEmitter();
    const mockSocket = {
      ev: fakeEv,
      authState: { creds: {}, keys: {} }
    };
    
    mock.method(deps, 'makeWASocket', () => {
      startSessionCallCount++;
      return mockSocket;
    });

    // Start session (this will not block because makeWASocket is fast)
    await startSession(channelId, tenantId, sessionId);

    // Initial check: it should have called makeWASocket once
    assert.strictEqual(startSessionCallCount, 1);

    // Emit a connection.update event with 408 timeout AND NO QR GENERATED (qrAttemptCount is 0)
    fakeEv.emit('connection.update', {
      connection: 'close',
      lastDisconnect: {
        error: { output: { statusCode: 408 } }
      }
    });

    // Wait a little bit more than 2 seconds (the timeout we added is 2000ms)
    await new Promise(resolve => setTimeout(resolve, 2500));

    // Assert that makeWASocket was called a second time (retried)
    assert.strictEqual(startSessionCallCount, 2, 'Should have retried startSession after 2 seconds due to 408 timeout');
  });
});
