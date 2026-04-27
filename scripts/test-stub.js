import pg from 'pg';
import { v7 as uuidv7 } from 'uuid';
import config from '../src/config.js';
import { PgBoss } from 'pg-boss';

const pool = new pg.Pool({ ...config.db, port: 6543 }); // Pooler port

async function runTest() {
  const tenantId = uuidv7();
  const audioId = uuidv7();
  const imageId = uuidv7();

  console.log(`Testing with tenantId: ${tenantId}`);

  // Insert tenant first
  await pool.query(`INSERT INTO tenants (id, name) VALUES ($1, $2)`, [tenantId, 'Test Tenant']);

  // Insert raw into inbox
  await pool.query(
    `INSERT INTO sync_inbox (id, tenant_id, payload) VALUES ($1, $2, $3)`,
    [audioId, tenantId, { type: 'audio', s3_url: 'minio://test/audio123.ogg' }]
  );

  await pool.query(
    `INSERT INTO sync_inbox (id, tenant_id, payload) VALUES ($1, $2, $3)`,
    [imageId, tenantId, { type: 'image', s3_url: 'minio://test/image456.jpg' }]
  );

  console.log('Inserted rows into sync_inbox.');

  const boss = new PgBoss(config.boss.connectionString);
  await boss.start();

  await boss.send('sync-inbox-process', {
    inboxId: audioId,
    tenantId,
    payload: { type: 'audio', s3_url: 'minio://test/audio123.ogg' }
  });

  await boss.send('sync-inbox-process', {
    inboxId: imageId,
    tenantId,
    payload: { type: 'image', s3_url: 'minio://test/image456.jpg' }
  });

  console.log('Enqueued in pg-boss. Waiting for worker to process...');
  await new Promise(r => setTimeout(r, 4000));

  const res = await pool.query(
    `SELECT id, status, payload FROM sync_inbox WHERE id IN ($1, $2) ORDER BY status`,
    [audioId, imageId]
  );
  
  console.log('Resulting payloads in DB:');
  console.log(JSON.stringify(res.rows, null, 2));

  await boss.stop();
  await pool.end();
}

runTest().catch(console.error);
