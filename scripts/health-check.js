#!/usr/bin/env node
// Los puertos salen del entorno, no escritos acá.
//
// Cuando Jarvis convive con otra plataforma en la misma máquina de desarrollo, sus puertos se corren
// para no chocar, y una comprobación contra un puerto fijo termina midiendo el sistema del
// vecino. Se cobró el 29-08: esta batería reportaba «database jarvis does not exist» porque
// estaba hablando con la base de la otra, que sí escucha en el 5432.
const P = {
  db: process.env.JARVIS_PUERTO_DB ?? '5432',
  pooler: process.env.JARVIS_PUERTO_POOLER ?? '6543',
  storage: process.env.JARVIS_PUERTO_STORAGE ?? '9000',
};

// Jarvis – Sandbox Infrastructure Health Check
// Validates: CORE.AV.01, DB.AV.01, STOR.AV.01
// Usage: npm run sandbox:health

import pg from 'pg';

const checks = [];

function report(name, ok, detail = '') {
  const icon = ok ? '✅' : '❌';
  checks.push({ name, ok, detail });
  console.log(`  ${icon} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function checkPostgres() {
  const client = new pg.Client({
    host: 'localhost',
    port: Number(P.db),
    user: 'postgres',
    password: 'postgres_sandbox',
    database: 'jarvis',
    connectionTimeoutMillis: 3000,
  });
  try {
    await client.connect();
    const res = await client.query('SELECT version()');
    report(`PostgreSQL (direct:${P.db})`, true, res.rows[0].version.split(',')[0]);
    await client.end();
  } catch (err) {
    report(`PostgreSQL (direct:${P.db})`, false, err.message);
  }
}

async function checkPooler() {
  const client = new pg.Client({
    host: 'localhost',
    port: Number(P.pooler),
    user: 'postgres',
    password: 'postgres_sandbox',
    database: 'jarvis',
    connectionTimeoutMillis: 3000,
  });
  try {
    await client.connect();
    await client.query('SELECT 1');
    report(`Pooler (pgbouncer:${P.pooler})`, true, 'transaction mode');
    await client.end();
  } catch (err) {
    report(`Pooler (pgbouncer:${P.pooler})`, false, err.message);
  }
}

async function checkStorage() {
  try {
    const res = await fetch(`http://localhost:${P.storage}/minio/health/live`, {
      signal: AbortSignal.timeout(3000),
    });
    report(`Storage S3 (minio:${P.storage})`, res.ok, `HTTP ${res.status}`);
  } catch (err) {
    report(`Storage S3 (minio:${P.storage})`, false, err.message);
  }
}

async function checkTables() {
  const client = new pg.Client({
    host: 'localhost',
    port: Number(P.db),
    user: 'postgres',
    password: 'postgres_sandbox',
    database: 'jarvis',
    connectionTimeoutMillis: 3000,
  });
  try {
    await client.connect();
    const res = await client.query(`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename
    `);
    const tables = res.rows.map(r => r.tablename);
    const required = ['tenants', 'sync_inbox', 'wapp_sessions', 'wapp_incoming'];
    const missing = required.filter(t => !tables.includes(t));
    if (missing.length === 0) {
      report('Schema tables', true, required.join(', '));
    } else {
      report('Schema tables', false, `missing: ${missing.join(', ')}`);
    }

    // Check RLS is enabled (DB.CR.01)
    const rlsRes = await client.query(`
      SELECT tablename, rowsecurity
      FROM pg_tables
      WHERE schemaname = 'public' AND tablename IN ('sync_inbox', 'wapp_sessions', 'wapp_incoming')
    `);
    const noRls = rlsRes.rows.filter(r => !r.rowsecurity);
    if (noRls.length === 0) {
      report('RLS enabled', true, 'all operational tables');
    } else {
      report('RLS enabled', false, `disabled on: ${noRls.map(r => r.tablename).join(', ')}`);
    }

    await client.end();
  } catch (err) {
    report('Schema tables', false, err.message);
  }
}

console.log('\n🔍 Jarvis Sandbox Health Check\n');

await checkPostgres();
await checkPooler();
await checkStorage();
await checkTables();

console.log('');
const failed = checks.filter(c => !c.ok);
if (failed.length > 0) {
  console.log(`⚠️  ${failed.length} check(s) failed. Fix before proceeding.\n`);
  process.exit(1);
} else {
  console.log(`✅ All ${checks.length} checks passed. Sandbox operational.\n`);
}
