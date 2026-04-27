// Jarvis – PostgreSQL Connection Pool
// Uses the pooler (PgBouncer/Supavisor) for all application queries.
// Constraint: §4.5 Transaction Pooling mandatory.

import pg from 'pg';
import config from './config.js';

const { Pool } = pg;

const pool = new Pool({
  ...config.pooler,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

// Verify connectivity on first use
pool.on('error', (err) => {
  console.error('[DB] Unexpected pool error:', err.message);
});

/**
 * Execute a query within a tenant-isolated RLS context.
 * Sets the local session variable before executing the query.
 * Constraint: §4.5 – SET LOCAL for RLS injection.
 *
 * @param {string} tenantId - UUIDv7 of the tenant
 * @param {string} text - SQL query
 * @param {Array} params - Query parameters
 * @returns {Promise<pg.QueryResult>}
 */
export async function tenantQuery(tenantId, text, params = []) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `SET LOCAL "request.jwt.claims.tenant_id" = $1`,
      [tenantId]
    );
    const result = await client.query(text, params);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Raw query without tenant context (admin/system operations only).
 */
export async function query(text, params = []) {
  return pool.query(text, params);
}

export default pool;
