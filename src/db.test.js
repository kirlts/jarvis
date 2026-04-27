import { test, describe, after } from 'node:test';
import assert from 'node:assert';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import pkg from 'pg';
const { Client } = pkg;

describe('Testcontainers: PostgreSQL 17', () => {
  let container;
  let client;

  test('should start PG 17 and connect successfully', async () => {
    container = await new PostgreSqlContainer('postgres:17-alpine')
      .withDatabase('jarvis_test')
      .withUsername('postgres')
      .withPassword('test_pass')
      .start();

    client = new Client({
      host: container.getHost(),
      port: container.getPort(),
      database: container.getDatabase(),
      user: container.getUsername(),
      password: container.getPassword(),
    });

    await client.connect();
    const res = await client.query('SELECT 1 + 1 AS result');
    assert.strictEqual(res.rows[0].result, 2);
  });

  after(async () => {
    if (client) await client.end();
    if (container) await container.stop();
  });
});
