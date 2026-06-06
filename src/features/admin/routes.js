import pool from '../../db.js';
import config from '../../config.js';
import pg from 'pg';
import { v7 as uuidv7 } from 'uuid';
import { s3 } from '../storage/s3-client.js';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';

// Dedicated direct PG pool for SSE listeners (LISTEN/NOTIFY).
// Constraint: §4.7 — LISTEN requires session-level persistence,
// incompatible with transaction-mode PgBouncer (:6543).
// Same justification as pg-boss: connects directly to PG :5432.
const directPool = new pg.Pool({
  connectionString: config.boss.connectionString,
  max: 3, // Minimal: admin console typically has 1-2 concurrent SSE listeners
  idleTimeoutMillis: 60_000,
});

// Reusable: acquire client, SET LOCAL jarvis_admin, run fn, commit/rollback.
// The ROLLBACK is wrapped in its own try/catch to handle cases where the
// connection itself is dead (network partition, PG restart mid-query).
async function withAdminClient(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL role = 'jarvis_admin'");
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (_rollbackErr) {
      // Connection lost — nothing to rollback. PG auto-aborts the TX.
    }
    throw err;
  } finally {
    client.release();
  }
}

// Audit: log mutating admin operations to admin_audit_log (append-only).
// Runs inside the caller's transaction when possible, otherwise opens its own.
async function logAudit({ actor, action, resource, resourceId, details }) {
  const id = uuidv7();
  await withAdminClient(async (client) => {
    await client.query(
      `INSERT INTO admin_audit_log (id, actor, action, resource, resource_id, details)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, actor, action, resource, resourceId || null, details ? JSON.stringify(details) : null]
    );
  });
}

// Creates a presigned S3 URL that the browser can access directly.
// The signature MUST be computed against the same hostname the browser will use,
// otherwise MinIO rejects with SignatureDoesNotMatch.
// We dynamically determine the external hostname from the incoming request's Host header.
function getPresigningS3Client(request) {
  const hostHeader = request.headers.host || '';
  let externalHost;
  if (hostHeader.includes('jarvis.local')) {
    externalHost = `http://${hostHeader.split(':')[0]}:9000`;
  } else {
    externalHost = `http://localhost:9000`;
  }
  return new S3Client({
    region: 'us-east-1',
    endpoint: externalHost,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.storage.accessKey,
      secretAccessKey: config.storage.secretKey,
    },
  });
}

// UUID format validator (strict RFC 4122 / RFC 9562 hyphenated form)
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * @param {import('fastify').FastifyInstance} app
 */
export async function registerAdminRoutes(app) {
  // Enforce admin JWT
  app.addHook('onRequest', async (request, reply) => {
    // Bypass for dev login
    request.log.info({ url: request.url, env: process.env.NODE_ENV }, 'onRequest dev-login bypass check');
    if (request.url.includes('/dev-login') && process.env.NODE_ENV === 'development') {
      return;
    }
    // SSE endpoints (EventSource) can't set custom headers.
    // Accept token via query param and promote it to Authorization header.
    if (!request.headers.authorization && request.query?.token) {
      request.headers.authorization = `Bearer ${request.query.token}`;
    }
    await app.adminAuthenticate(request, reply);
  });

  // Enforce super_admin role
  app.addHook('preHandler', async (request, reply) => {
    if (request.url.includes('/dev-login') && process.env.NODE_ENV === 'development') {
      return;
    }
    if (!request.user || request.user.role !== 'super_admin') {
      return reply.status(403).send({ error: 'Forbidden' });
    }
  });

  // ── POST /admin/dev-login ──────────────────────────────────────────
  // Dev-only endpoint to bypass the terminal JWT generation step
  app.post('/dev-login', async (request, reply) => {
    if (process.env.NODE_ENV !== 'development') {
      return reply.status(404).send({ error: 'Not Found' });
    }
    const token = await app.jwt.admin.sign({ role: 'super_admin' });
    return { token };
  });

  // ── GET /admin/tenants (paginated) ──────────────────────────────────
  // Returns only active tenants (deleted_at IS NULL) by default.
  app.get('/tenants', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          page:   { type: 'integer', minimum: 1, default: 1 },
          limit:  { type: 'integer', minimum: 1, default: 20 },
          search: { type: 'string' },
          status: { type: 'string', enum: ['active', 'suspended', 'trial', 'deleted'] },
        },
        additionalProperties: false,
      },
    },
  }, async (request, _reply) => {
    const { page, limit, search, status } = request.query;
    const offset = (page - 1) * limit;

    return withAdminClient(async (client) => {
      const conditions = [];
      const params = [];
      let paramIdx = 1;

      if (status === 'deleted') {
        conditions.push('deleted_at IS NOT NULL');
      } else {
        conditions.push('deleted_at IS NULL');
        if (status) {
          conditions.push(`status = $${paramIdx++}`);
          params.push(status);
        }
      }

      if (search) {
        conditions.push(`name ILIKE $${paramIdx++}`);
        params.push(`%${search}%`);
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const countResult = await client.query(
        `SELECT COUNT(*)::int AS total FROM tenants ${where}`,
        params
      );
      const total = countResult.rows[0].total;

      params.push(limit, offset);
      const result = await client.query(
        `SELECT id, name, status, config, created_at, deleted_at FROM tenants ${where} ORDER BY created_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx}`,
        params
      );

      return { data: result.rows, meta: { total, page, limit } };
    });
  });

  // ── POST /admin/tenants ─────────────────────────────────────────────
  app.post('/tenants', {
    schema: {
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 255 },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const { name } = request.body;
    const id = uuidv7();

    try {
      const result = await withAdminClient(async (client) => {
        return client.query(
          'INSERT INTO tenants (id, name) VALUES ($1, $2) RETURNING id, name, created_at',
          [id, name]
        );
      });
      await logAudit({
        actor: request.user?.sub || 'system',
        action: 'create',
        resource: 'tenant',
        resourceId: id,
        details: { name },
      });
      await app.boss.send('admin-lifecycle', {
        event: 'tenant_created',
        tenantId: id,
        tenantName: name,
        actor: request.user?.sub || 'system',
      });
      return reply.status(201).send(result.rows[0]);
    } catch (err) {
      // PostgreSQL unique_violation = 23505
      if (err.code === '23505') {
        return reply.status(409).send({ error: 'Conflict', message: 'Tenant name already exists' });
      }
      throw err;
    }
  });

  // ── GET /admin/tenants/:id ──────────────────────────────────────────
  app.get('/tenants/:id', async (request, reply) => {
    const { id } = request.params;

    if (!UUID_REGEX.test(id)) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Invalid UUID format' });
    }

    const result = await withAdminClient(async (client) => {
      return client.query(
        'SELECT id, name, status, config, created_at, deleted_at FROM tenants WHERE id = $1',
        [id]
      );
    });

    if (result.rows.length === 0) {
      return reply.status(404).send({ error: 'Not Found' });
    }

    return result.rows[0];
  });

  // ── PATCH /admin/tenants/:id ────────────────────────────────────────
  // Only updates active tenants (deleted_at IS NULL). Prevents resurrection
  // of soft-deleted tenants through partial updates.
  // Supports: name, config, status
  app.patch('/tenants/:id', {
    schema: {
      body: {
        type: 'object',
        properties: {
          name:   { type: 'string', minLength: 1, maxLength: 255 },
          config: { type: 'object' },
          status: { type: 'string', enum: ['active', 'suspended', 'trial'] },
        },
        additionalProperties: false,
        minProperties: 1,
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;

    if (!UUID_REGEX.test(id)) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Invalid UUID format' });
    }

    const { name, config, status } = request.body;

    // Build dynamic SET clause
    const setClauses = [];
    const params = [];
    let paramIdx = 1;

    if (name !== undefined) {
      setClauses.push(`name = $${paramIdx++}`);
      params.push(name);
    }
    if (config !== undefined) {
      setClauses.push(`config = $${paramIdx++}`);
      params.push(JSON.stringify(config));
    }
    if (status !== undefined) {
      setClauses.push(`status = $${paramIdx++}`);
      params.push(status);
    }

    params.push(id);

    try {
      const result = await withAdminClient(async (client) => {
        return client.query(
          `UPDATE tenants SET ${setClauses.join(', ')} WHERE id = $${paramIdx} AND deleted_at IS NULL RETURNING id, name, status, config, created_at, deleted_at`,
          params
        );
      });

      if (result.rowCount === 0) {
        return reply.status(404).send({ error: 'Not Found' });
      }

      await logAudit({
        actor: request.user?.sub || 'system',
        action: 'update',
        resource: 'tenant',
        resourceId: id,
        details: { name, config, status },
      });
      await app.boss.send('admin-lifecycle', {
        event: 'tenant_updated',
        tenantId: id,
        tenantName: result.rows[0].name,
        actor: request.user?.sub || 'system',
        changes: Object.keys(request.body),
      });

      return result.rows[0];
    } catch (err) {
      if (err.code === '23505') {
        return reply.status(409).send({ error: 'Conflict', message: 'Tenant name already exists' });
      }
      throw err;
    }
  });

  // ── DELETE /admin/tenants/:id ───────────────────────────────────────
  // Soft-delete: sets deleted_at = now() by default.
  // Purge: if purge=true, permanently hard-deletes the tenant and all its
  // dependent data by temporarily disabling the prevent_hard_delete triggers.
  app.delete('/tenants/:id', {
    schema: {
      querystring: {
        type: 'object',
        required: ['confirm'],
        properties: {
          confirm: { type: 'string', const: 'true' },
          purge: { type: 'string', enum: ['true', 'false'] },
        },
        additionalProperties: false,
      }
    }
  }, async (request, reply) => {
    const { id } = request.params;
    const purge = request.query.purge === 'true';

    if (!UUID_REGEX.test(id)) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Invalid UUID format' });
    }

    if (purge) {
      // Direct pool connects as superuser (postgres) in sandbox, allowing trigger control
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        
        // 1. Disable prevent_hard_delete triggers
        await client.query('ALTER TABLE wapp_sessions DISABLE TRIGGER trg_wapp_sessions_prevent_delete');
        await client.query('ALTER TABLE wapp_incoming DISABLE TRIGGER trg_wapp_incoming_prevent_delete');
        await client.query('ALTER TABLE sync_inbox DISABLE TRIGGER trg_sync_inbox_prevent_delete');
        await client.query('ALTER TABLE tenants DISABLE TRIGGER trg_tenants_prevent_delete');

        // 2. Wipe all related dependent data
        await client.query('DELETE FROM wapp_sessions WHERE tenant_id = $1', [id]);
        await client.query('DELETE FROM wapp_incoming WHERE tenant_id = $1', [id]);
        await client.query('DELETE FROM sync_inbox WHERE tenant_id = $1', [id]);
        await client.query('DELETE FROM storage_objects WHERE tenant_id = $1', [id]);

        // 3. Delete tenant
        const result = await client.query('DELETE FROM tenants WHERE id = $1 RETURNING id', [id]);

        if (result.rowCount === 0) {
          // Re-enable triggers and rollback
          await client.query('ALTER TABLE wapp_sessions ENABLE TRIGGER trg_wapp_sessions_prevent_delete');
          await client.query('ALTER TABLE wapp_incoming ENABLE TRIGGER trg_wapp_incoming_prevent_delete');
          await client.query('ALTER TABLE sync_inbox ENABLE TRIGGER trg_sync_inbox_prevent_delete');
          await client.query('ALTER TABLE tenants ENABLE TRIGGER trg_tenants_prevent_delete');
          await client.query('COMMIT');
          return reply.status(404).send({ error: 'Tenant not found' });
        }

        // 4. Re-enable prevent_hard_delete triggers
        await client.query('ALTER TABLE wapp_sessions ENABLE TRIGGER trg_wapp_sessions_prevent_delete');
        await client.query('ALTER TABLE wapp_incoming ENABLE TRIGGER trg_wapp_incoming_prevent_delete');
        await client.query('ALTER TABLE sync_inbox ENABLE TRIGGER trg_sync_inbox_prevent_delete');
        await client.query('ALTER TABLE tenants ENABLE TRIGGER trg_tenants_prevent_delete');

        await client.query('COMMIT');

        await logAudit({
          actor: request.user?.sub || 'system',
          action: 'purge',
          resource: 'tenant',
          resourceId: id,
        });
        await app.boss.send('admin-lifecycle', {
          event: 'tenant_purged',
          tenantId: id,
          actor: request.user?.sub || 'system',
        });

        return reply.status(200).send({ status: 'deleted', id });
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } else {
      // Standard Soft-delete
      const result = await withAdminClient(async (client) => {
        return client.query(
          'UPDATE tenants SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL RETURNING id',
          [id]
        );
      });

      if (result.rowCount === 0) {
        return reply.status(404).send({ error: 'Tenant not found or already deleted' });
      }

      // Asynchronously dispatch disconnection to Baileys worker via pg-boss
      await withAdminClient(async (client) => {
        const check = await client.query('SELECT id FROM wapp_sessions WHERE tenant_id = $1 AND deleted_at IS NULL', [id]);
        for (const row of check.rows) {
          await app.boss.send('wapp-session-control', {
            action: 'disconnect',
            tenantId: id,
            sessionId: row.id
          });
        }
      });

      await logAudit({
        actor: request.user?.sub || 'system',
        action: 'delete',
        resource: 'tenant',
        resourceId: id,
      });
      await app.boss.send('admin-lifecycle', {
        event: 'tenant_deleted',
        tenantId: id,
        actor: request.user?.sub || 'system',
      });

      return reply.status(200).send({ status: 'deleted', id });
    }
  });

  // ── PATCH /admin/tenants/:id/status ─────────────────────────────────
  // Changes tenant lifecycle status (active ↔ suspended ↔ trial)
  app.patch('/tenants/:id/status', {
    schema: {
      body: {
        type: 'object',
        required: ['status'],
        properties: {
          status: { type: 'string', enum: ['active', 'suspended', 'trial'] },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;
    if (!UUID_REGEX.test(id)) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Invalid UUID format' });
    }

    const { status } = request.body;
    const result = await withAdminClient(async (client) => {
      return client.query(
        'UPDATE tenants SET status = $1 WHERE id = $2 AND deleted_at IS NULL RETURNING id, name, status',
        [status, id]
      );
    });

    if (result.rowCount === 0) {
      return reply.status(404).send({ error: 'Not Found' });
    }

    await logAudit({
      actor: request.user?.sub || 'system',
      action: 'status_change',
      resource: 'tenant',
      resourceId: id,
      details: { status },
    });
    await app.boss.send('admin-lifecycle', {
      event: 'tenant_status_changed',
      tenantId: id,
      tenantName: result.rows[0].name,
      actor: request.user?.sub || 'system',
      newStatus: status,
    });

    return reply.status(200).send();
  });

  // ── POST /admin/tenants/:id/restore ─────────────────────────────────
  // Restores a soft-deleted tenant (clears deleted_at, sets status=active)
  app.post('/tenants/:id/restore', async (request, reply) => {
    const { id } = request.params;
    if (!UUID_REGEX.test(id)) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Invalid UUID format' });
    }

    const result = await withAdminClient(async (client) => {
      return client.query(
        "UPDATE tenants SET deleted_at = NULL, status = 'active' WHERE id = $1 AND deleted_at IS NOT NULL RETURNING id, name, status",
        [id]
      );
    });

    if (result.rowCount === 0) {
      return reply.status(404).send({ error: 'Tenant not found or not deleted' });
    }

    await logAudit({
      actor: request.user?.sub || 'system',
      action: 'restore',
      resource: 'tenant',
      resourceId: id,
    });
    await app.boss.send('admin-lifecycle', {
      event: 'tenant_restored',
      tenantId: id,
      tenantName: result.rows[0].name,
      actor: request.user?.sub || 'system',
    });

    return reply.status(200).send();
  });

  // ── GET /admin/tenants/:id/stats ────────────────────────────────────
  // Aggregated stats for a single tenant (sessions, inbox, storage)
  app.get('/tenants/:id/stats', async (request, reply) => {
    const { id } = request.params;
    if (!UUID_REGEX.test(id)) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Invalid UUID format' });
    }

    return withAdminClient(async (client) => {
      const sessions = await client.query(
        'SELECT count(*)::int AS count FROM wapp_sessions WHERE tenant_id = $1', [id]
      );
      const inbox = await client.query(
        "SELECT count(*)::int AS total, count(*) FILTER (WHERE status = 'pending')::int AS pending FROM sync_inbox WHERE tenant_id = $1", [id]
      );
      const storage = await client.query(
        "SELECT count(*)::int AS files, coalesce(sum(size),0)::bigint AS bytes FROM storage_objects WHERE tenant_id = $1 AND status = 'uploaded' AND deleted_at IS NULL", [id]
      );

      return {
        sessions: sessions.rows[0].count,
        inbox: inbox.rows[0],
        storage: storage.rows[0],
      };
    });
  });

  // ── POST /admin/tenants/:id/token ───────────────────────────────────
  // Generates an API key (JWT token signed with HS256) for a tenant (K.1)
  app.post('/tenants/:id/token', async (request, reply) => {
    const { id } = request.params;
    if (!UUID_REGEX.test(id)) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Invalid UUID format' });
    }

    const tenant = await withAdminClient(async (client) => {
      const res = await client.query('SELECT id, name, config FROM tenants WHERE id = $1 AND deleted_at IS NULL', [id]);
      return res.rows[0];
    });

    if (!tenant) {
      return reply.status(404).send({ error: 'Tenant not found or deleted' });
    }

    const ttl = tenant.config?.token_ttl_hours || 24;
    const token = await app.jwt.sign(
      { tenant_id: tenant.id, sub: 'admin-console' },
      { expiresIn: `${ttl}h` }
    );

    await logAudit({
      actor: request.user?.sub || 'system',
      action: 'generate_token',
      resource: 'tenant',
      resourceId: id,
      details: { ttl_hours: ttl },
    });
    await app.boss.send('admin-lifecycle', {
      event: 'token_generated',
      tenantId: id,
      tenantName: tenant.name,
      actor: request.user?.sub || 'system',
      ttlHours: ttl,
    });

    return { token };
  });

  // ── GET /admin/audit ────────────────────────────────────────────────
  // Paginated audit trail with filters (H.1)
  app.get('/audit', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          page:     { type: 'integer', minimum: 1, default: 1 },
          limit:    { type: 'integer', minimum: 1, default: 50 },
          action:   { type: 'string' },
          resource: { type: 'string' },
          resource_id: { type: 'string' },
        },
        additionalProperties: false,
      },
    },
  }, async (request, _reply) => {
    const { page, limit, action, resource, resource_id } = request.query;
    const offset = (page - 1) * limit;

    return withAdminClient(async (client) => {
      const conditions = [];
      const params = [];
      let paramIdx = 1;

      if (action) {
        conditions.push(`action = $${paramIdx++}`);
        params.push(action);
      }
      if (resource) {
        conditions.push(`resource = $${paramIdx++}`);
        params.push(resource);
      }
      if (resource_id) {
        conditions.push(`resource_id = $${paramIdx++}`);
        params.push(resource_id);
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const countResult = await client.query(
        `SELECT COUNT(*)::int AS total FROM admin_audit_log ${where}`, params
      );
      const total = countResult.rows[0].total;

      params.push(limit, offset);
      const result = await client.query(
        `SELECT id, actor, action, resource, resource_id, details, created_at FROM admin_audit_log ${where} ORDER BY created_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx}`,
        params
      );

      return { data: result.rows, meta: { total, page, limit } };
    });
  });

  // ── GET /admin/dashboard/summary ─────────────────────────────────────
  // Aggregated metrics for the dashboard landing page (A.1–A.6)
  app.get('/dashboard/summary', async (_request, _reply) => {
    return withAdminClient(async (client) => {
      // Tenant counts by status
      const tenantCounts = await client.query(`
        SELECT
          count(*) FILTER (WHERE deleted_at IS NULL AND status = 'active') AS active,
          count(*) FILTER (WHERE deleted_at IS NULL AND status = 'suspended') AS suspended,
          count(*) FILTER (WHERE deleted_at IS NULL AND status = 'trial') AS trial,
          count(*) FILTER (WHERE deleted_at IS NOT NULL) AS deleted
        FROM tenants
      `);

      // Job queue health (last 24h)
      const jobCounts = await client.query(`
        SELECT state, count(*)::int AS count
        FROM pgboss.job
        WHERE created_on > now() - interval '24 hours'
        GROUP BY state
      `);

      // WhatsApp session status
      const wappCounts = await client.query(`
        SELECT status, count(*)::int AS count
        FROM wapp_sessions
        WHERE deleted_at IS NULL
        GROUP BY status
      `);

      // Storage usage
      const storageSummary = await client.query(`
        SELECT
          count(*)::int AS files,
          coalesce(sum(size), 0)::bigint AS bytes
        FROM storage_objects
        WHERE status = 'uploaded' AND deleted_at IS NULL
      `);

      // Sync inbox backlog
      const inboxBacklog = await client.query(`
        SELECT
          count(*) FILTER (WHERE status = 'pending')::int AS pending,
          count(*) FILTER (WHERE status = 'processing')::int AS processing,
          count(*) FILTER (WHERE status = 'done')::int AS done,
          count(*) FILTER (WHERE status = 'failed')::int AS failed
        FROM sync_inbox
      `);

      // Flatten job counts into an object
      const jobs = {};
      for (const row of jobCounts.rows) {
        jobs[row.state] = row.count;
      }

      // Flatten whatsapp counts
      const whatsapp = {};
      for (const row of wappCounts.rows) {
        whatsapp[row.status] = row.count;
      }

      return {
        tenants: tenantCounts.rows[0],
        jobs,
        whatsapp,
        storage: storageSummary.rows[0],
        inbox: inboxBacklog.rows[0],
      };
    });
  });

  // ── GET /admin/jobs (with filters) ─────────────────────────────────
  app.get('/jobs', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          page:      { type: 'integer', minimum: 1, default: 1 },
          state:     { type: 'string' },
          tenant_id: { type: 'string' },
          search:    { type: 'string' },
          limit:     { type: 'integer', minimum: 1, default: 50 },
        },
        additionalProperties: false,
      },
    },
  }, async (request, _reply) => {
    const { page, state, tenant_id, search, limit } = request.query;
    const offset = (page - 1) * limit;

    return withAdminClient(async (client) => {
      const conditions = [];
      const params = [];
      let paramIdx = 1;

      if (state) {
        conditions.push(`j.state = $${paramIdx++}`);
        params.push(state);
      }

      if (tenant_id) {
        // pg-boss stores data as JSONB; tenant_id is in the data column
        conditions.push(`(j.data->>'tenantId' = $${paramIdx} OR j.data->>'tenant_id' = $${paramIdx++})`);
        params.push(tenant_id);
      }

      if (search) {
        // Search by tenant name (via LEFT JOIN) or by tenant ID in JSONB data
        conditions.push(`(t.name ILIKE $${paramIdx} OR j.data->>'tenantId' ILIKE $${paramIdx} OR j.data->>'tenant_id' ILIKE $${paramIdx++})`);
        params.push(`%${search}%`);
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      params.push(limit, offset);
      const result = await client.query(
        `SELECT 
           j.id, 
           j.name, 
           j.state, 
           j.data, 
           j.created_on, 
           j.started_on, 
           j.completed_on,
           t.id AS tenant_id,
           t.name AS tenant_name
         FROM pgboss.job j
         LEFT JOIN tenants t ON (
           CASE 
             WHEN (j.data->>'tenantId') IS NOT NULL AND (j.data->>'tenantId') <> '' AND (j.data->>'tenantId') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN (j.data->>'tenantId')::uuid
             WHEN (j.data->>'tenant_id') IS NOT NULL AND (j.data->>'tenant_id') <> '' AND (j.data->>'tenant_id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN (j.data->>'tenant_id')::uuid
             ELSE NULL
           END
         ) = t.id
         ${where} 
         ORDER BY j.created_on DESC 
         LIMIT $${paramIdx++} OFFSET $${paramIdx}`,
        params
      );

      // Append dynamically generated descriptions
      return result.rows.map(row => {
        const formatAdminJid = (jid) => {
          if (!jid) return 'remitente desconocido';
          let rawId = jid.split('@')[0];
          rawId = rawId.replace(/^\+/, '');
          if (rawId === '163217431068839') return '+56 9 9417 2921';
          if (rawId.startsWith('569') && rawId.length === 11) return `+56 9 ${rawId.slice(3, 7)} ${rawId.slice(7)}`;
          if (/^\d+$/.test(rawId)) return `+${rawId}`;
          return rawId;
        };

        let description = '';
        const name = row.name;
        const data = row.data;
        if (data) {
          switch (name) {
            case 'wapp-session-control':
              if (data.action === 'reconnect') {
                description = '🔄 Reconectando canal WhatsApp y regenerando código QR';
              } else if (data.action === 'disconnect') {
                description = '🔌 Finalizando socket de sesión WhatsApp y limpiando credenciales';
              } else {
                description = `⚙️ Controlando sesión WhatsApp (${data.action || 'acción desconocida'})`;
              }
              break;
            case 'sync-inbox-process':
              if (data.payload?.type === 'audio') {
                description = `🎙️ Reprocesando mensaje de audio de ${formatAdminJid(data.payload.sender)}`;
              } else if (data.payload?.type === 'image') {
                description = `🖼️ Reprocesando mensaje de imagen de ${formatAdminJid(data.payload.sender)}`;
              } else {
                description = '📥 Procesando payload de sincronización offline';
              }
              break;
            case 'wapp-send-process':
              description = `📤 Enviando notificación WhatsApp a ${formatAdminJid(data.to)}`;
              break;
            case 'wapp-lifecycle': {
              const evt = data.event;
              if (evt === 'connection_opened') {
                description = '✅ Canal WhatsApp conectado correctamente';
              } else if (evt === 'connection_closed') {
                if (data.isLoggedOut) {
                  description = '🚪 Sesión WhatsApp cerrada desde el teléfono';
                } else if (!data.hadCredentials && data.qrAttemptCount > 0) {
                  description = `⏰ Código QR expirado tras ${data.qrAttemptCount} intentos sin escaneo`;
                } else {
                  description = '🔌 Conexión de WhatsApp caída (se reconectará automáticamente si existen credenciales)';
                }
              } else if (evt === 'message_received') {
                description = `📩 Mensaje entrante de WhatsApp de ${formatAdminJid(data.sender)}`;
              } else {
                description = `📡 Evento de ciclo de vida de WhatsApp: ${evt || 'desconocido'}`;
              }
              break;
            }
            case 'admin-lifecycle': {
              const evt = data.event;
              const tName = data.tenantName || data.tenantId?.substring(0, 8) || 'desconocido';
              if (evt === 'tenant_created') {
                description = `🏢 Tenant "${tName}" creado`;
              } else if (evt === 'tenant_updated') {
                const fields = Array.isArray(data.changes) ? data.changes.join(', ') : 'campos';
                description = `✏️ Tenant "${tName}" actualizado (${fields})`;
              } else if (evt === 'tenant_deleted') {
                description = `🗑️ Tenant eliminado (soft-delete)`;
              } else if (evt === 'tenant_status_changed') {
                description = `🔄 Tenant "${tName}" estado cambiado a ${data.newStatus || 'desconocido'}`;
              } else if (evt === 'tenant_restored') {
                description = `♻️ Tenant "${tName}" restaurado desde eliminación`;
              } else if (evt === 'token_generated') {
                description = `🔑 Token API generado para "${tName}" (TTL: ${data.ttlHours || '?'}h)`;
              } else if (evt === 'token_revoked') {
                description = `🚫 Token API revocado (JTI: ${data.jti?.substring(0, 12) || 'desconocido'}…)`;
              } else if (evt === 'config_updated') {
                description = `⚙️ Configuración del sistema "${data.configKey || 'desconocida'}" actualizada`;
              } else {
                description = `🏛️ Operación de administración: ${evt || 'desconocida'}`;
              }
              break;
            }
            default:
              description = `⚙️ Ejecutando job de fondo: ${name}`;
          }
        }
        return {
          ...row,
          description: description || `⚙️ Ejecutando job de fondo: ${name}`
        };
      });
    });
  });

  // ── DELETE /admin/jobs (purge finished jobs) ─────────────────────────
  app.delete('/jobs', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          state:   { type: 'string', enum: ['completed', 'failed', 'cancelled', 'all_finished'], default: 'all_finished' },
          confirm: { type: 'string', enum: ['true'] },
        },
        required: ['confirm'],
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const { state, confirm } = request.query;

    let targetStates = [];
    if (state === 'all_finished') {
      targetStates = ['completed', 'failed', 'cancelled'];
    } else {
      targetStates = [state];
    }

    const deletedCount = await withAdminClient(async (client) => {
      const res = await client.query(
        'DELETE FROM pgboss.job WHERE state::text = ANY($1)',
        [targetStates]
      );
      return res.rowCount;
    });

    await logAudit({
      actor: request.user?.sub || 'system',
      action: 'purge_jobs',
      resource: 'jobs',
      resourceId: null,
      details: { state, purged_count: deletedCount },
    });

    await app.boss.send('admin-lifecycle', {
      event: 'jobs_purged',
      state,
      purgedCount: deletedCount,
      actor: request.user?.sub || 'system',
    });

    return { message: 'Jobs purgados correctamente', purgedCount: deletedCount };
  });

  // ── GET /admin/whatsapp/status/gemini-keys ───────────────────────────
  app.get('/whatsapp/status/gemini-keys', async (_request, _reply) => {
    const keys = Object.keys(process.env)
      .filter(key => key.startsWith('GEMINI_API_KEY'))
      .map(key => ({
        key: key,
        name: key === 'GEMINI_API_KEY' ? 'Heredada (process.env.GEMINI_API_KEY)' : `${key} (${key.replace('GEMINI_API_KEY_', '')})`
      }));
    
    if (keys.length === 0) {
      keys.push({ key: 'GEMINI_API_KEY', name: 'Heredada (process.env.GEMINI_API_KEY)' });
    }
    return keys;
  });

  // ── GET /admin/whatsapp/status ──────────────────────────────────────
  app.get('/whatsapp/status', async (_request, _reply) => {
    return withAdminClient(async (client) => {
      const result = await client.query(
        `SELECT id, tenant_id, status, qr_code, qr_generated_at, qr_scanned_at, qr_scanned_by, updated_at
         FROM wapp_sessions
         WHERE deleted_at IS NULL`
      );
      return result.rows;
    });
  });

  // ── GET /admin/whatsapp/status/stream (SSE) ─────────────────────────
  // Server-Sent Events endpoint for real-time WhatsApp session status updates.
  // Uses PostgreSQL LISTEN/NOTIFY to push changes without polling.
  // The DB trigger `notify_wapp_status_change` fires on wapp_sessions UPDATE.
  app.get('/whatsapp/status/stream', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          token: { type: 'string' },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    // SSE headers – must write CORS manually because raw writeHead bypasses fastify-cors
    const headers = {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable Nginx buffering for SSE
    };

    if (request.headers.origin) {
      headers['Access-Control-Allow-Origin'] = request.headers.origin;
      headers['Access-Control-Allow-Credentials'] = 'true';
    }

    reply.hijack();
    reply.raw.writeHead(200, headers);

    // Acquire a dedicated PG connection for LISTEN via direct pool (:5432).
    // LISTEN requires session-level persistence incompatible with PgBouncer (§4.7).
    let pgClient;
    try {
      pgClient = await directPool.connect();
      await pgClient.query('LISTEN wapp_status_change');
      await pgClient.query('LISTEN tenant_activity');
    } catch (err) {
      request.log.error({ err: err.message }, 'Failed to establish SSE PG listener');
      reply.raw.end();
      return;
    }

    // Send initial heartbeat
    reply.raw.write('event: heartbeat\ndata: connected\n\n');

    // Forward PG notifications as SSE events, routing by channel
    const onNotification = (msg) => {
      try {
        const eventType = msg.channel === 'tenant_activity' ? 'activity_update' : 'status_change';
        reply.raw.write(`event: ${eventType}\ndata: ${msg.payload}\n\n`);
      } catch (_) {
        // Client disconnected — cleanup will handle it
      }
    };
    pgClient.on('notification', onNotification);

    // Heartbeat every 30s to keep connection alive through proxies
    const heartbeatInterval = setInterval(() => {
      try {
        reply.raw.write('event: heartbeat\ndata: ping\n\n');
      } catch (_) {
        clearInterval(heartbeatInterval);
      }
    }, 10_000);

    // Cleanup on disconnect
    let released = false;
    const cleanup = () => {
      if (released) return;
      released = true;

      clearInterval(heartbeatInterval);
      if (pgClient) {
        pgClient.removeListener('notification', onNotification);
        pgClient.query('UNLISTEN wapp_status_change').catch(() => {});
        pgClient.query('UNLISTEN tenant_activity').catch(() => {});
        pgClient.release();
      }
    };

    return new Promise((resolve) => {
      request.raw.on('close', () => {
        cleanup();
        resolve();
      });
      request.raw.on('error', () => {
        cleanup();
        resolve();
      });
    });
  });

  // ── POST /admin/whatsapp/status/:tenant_id/reconnect ─────────────────
  // Resets credentials and publishes wapp-session-control job to pg-boss to force WhatsApp connection.
  app.post('/whatsapp/status/:tenant_id/reconnect', async (request, reply) => {
    const { tenant_id } = request.params;
    if (!UUID_REGEX.test(tenant_id)) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Invalid UUID format' });
    }

    let sessionId;
    await withAdminClient(async (client) => {
      // Check if session exists
      const check = await client.query('SELECT id FROM wapp_sessions WHERE tenant_id = $1 AND deleted_at IS NULL', [tenant_id]);
      if (check.rows.length === 0) {
        // If no session exists, we insert a fresh row to trigger a new session start!
        sessionId = uuidv7();
        await client.query(
          "INSERT INTO wapp_sessions (id, tenant_id, credentials, status) VALUES ($1, $2, '{}', 'waiting_qr')",
          [sessionId, tenant_id]
        );
      } else {
        sessionId = check.rows[0].id;
        // Reset state & credentials on DB
        await client.query(
          "UPDATE wapp_sessions SET credentials = '{}', status = 'waiting_qr', qr_code = NULL WHERE id = $1",
          [sessionId]
        );
      }
    });

    // Publish event-driven command to baileys worker via pg-boss
    await app.boss.send('wapp-session-control', {
      action: 'reconnect',
      tenantId: tenant_id,
      sessionId
    });

    await logAudit({
      actor: request.user?.sub || 'user',
      action: 'reconnect_whatsapp',
      resource: 'whatsapp_channel',
      resourceId: tenant_id,
      details: { message: 'Reconexión forzada de sesión WhatsApp y regeneración de código QR' }
    });

    return reply.status(200).send();
  });

  // ── DELETE /admin/whatsapp/status/:tenant_id ──────────────────────────
  // Performs synchronous database soft-delete and publishes wapp-session-control job to pg-boss to terminate the Baileys socket.
  app.delete('/whatsapp/status/:tenant_id', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          confirm: { type: 'string', enum: ['true'] },
        },
        required: ['confirm'],
        additionalProperties: false,
      }
    }
  }, async (request, reply) => {
    const { tenant_id } = request.params;
    if (!UUID_REGEX.test(tenant_id)) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Invalid UUID format' });
    }

    let sessionId;
    await withAdminClient(async (client) => {
      const check = await client.query('SELECT id FROM wapp_sessions WHERE tenant_id = $1 AND deleted_at IS NULL', [tenant_id]);
      if (check.rows.length > 0) {
        sessionId = check.rows[0].id;
        // Synchronously update the DB state to soft-deleted, clear credentials, and reset status immediately
        await client.query(
          `UPDATE wapp_sessions 
           SET deleted_at = now(), status = 'disconnected', qr_code = NULL, credentials = '{}' 
           WHERE id = $1`,
          [sessionId]
        );
      }
    });

    if (sessionId) {
      // Publish event-driven command to baileys worker via pg-boss for async socket teardown
      await app.boss.send('wapp-session-control', {
        action: 'disconnect',
        tenantId: tenant_id,
        sessionId
      });
    }

    await logAudit({
      actor: request.user?.sub || 'user',
      action: 'delete_whatsapp',
      resource: 'whatsapp_channel',
      resourceId: tenant_id,
      details: { message: 'Desconexión forzada de canal WhatsApp y limpieza de sesión' }
    });

    return reply.status(200).send();
  });

  // ── GET /admin/whatsapp/status/:tenant_id/audit ───────────────────────
  // Returns QR scan and session history audits for a specific WhatsApp channel.
  app.get('/whatsapp/status/:tenant_id/audit', async (request, reply) => {
    const { tenant_id } = request.params;
    if (!UUID_REGEX.test(tenant_id)) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Invalid UUID format' });
    }

    return withAdminClient(async (client) => {
      const result = await client.query(
        `SELECT id, actor, action, resource, resource_id, details, created_at
         FROM admin_audit_log
         WHERE resource = 'whatsapp_channel' AND resource_id = $1
         ORDER BY created_at DESC`,
        [tenant_id]
      );
      return result.rows;
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // BLOQUE 4B — WhatsApp Multichannel Management (TASK-025)
  // ════════════════════════════════════════════════════════════════════

  // ── GET /admin/whatsapp/status/:tenant_id/channels ────────────────
  // Returns all channels (non-deleted) for a tenant, with their latest session status.
  app.get('/whatsapp/status/:tenant_id/channels', async (request, reply) => {
    const { tenant_id } = request.params;
    if (!UUID_REGEX.test(tenant_id)) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Invalid UUID format' });
    }

    return withAdminClient(async (client) => {
      const result = await client.query(
        `SELECT c.id, c.tenant_id, c.name, c.phone_number, c.status, c.config, c.created_at,
                s.id AS session_id, s.status AS session_status, s.qr_code,
                s.qr_generated_at, s.qr_scanned_at, s.qr_scanned_by, s.updated_at AS session_updated_at
         FROM wapp_channels c
         LEFT JOIN wapp_sessions s ON s.channel_id = c.id AND s.deleted_at IS NULL
         WHERE c.tenant_id = $1 AND c.deleted_at IS NULL
         ORDER BY c.created_at ASC`,
        [tenant_id]
      );
      return result.rows;
    });
  });

  // ── POST /admin/whatsapp/status/:tenant_id/channels ───────────────
  // Creates a new WhatsApp channel for a tenant.
  app.post('/whatsapp/status/:tenant_id/channels', {
    schema: {
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 100 },
          config: { type: 'object' },
        },
        required: ['name'],
        additionalProperties: false,
      }
    }
  }, async (request, reply) => {
    const { tenant_id } = request.params;
    if (!UUID_REGEX.test(tenant_id)) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Invalid UUID format' });
    }

    const { name, config } = request.body;
    const channelId = uuidv7();

    await withAdminClient(async (client) => {
      // Verify tenant exists
      const tenantCheck = await client.query('SELECT id FROM tenants WHERE id = $1 AND deleted_at IS NULL', [tenant_id]);
      if (tenantCheck.rows.length === 0) {
        return reply.status(404).send({ error: 'Not Found', message: 'Tenant not found' });
      }

      await client.query(
        `INSERT INTO wapp_channels (id, tenant_id, name, config) VALUES ($1, $2, $3, $4)`,
        [channelId, tenant_id, name, JSON.stringify(config || {})]
      );
    });

    await logAudit({
      actor: request.user?.sub || 'user',
      action: 'create_channel',
      resource: 'whatsapp_channel',
      resourceId: channelId,
      details: { tenant_id, name }
    });

    return reply.status(201).send({ id: channelId, tenant_id, name, status: 'disconnected', config: config || {} });
  });

  // ── GET /admin/whatsapp/status/:tenant_id/channels/:channel_id ────
  // Returns detail for a specific channel including session state and QR.
  app.get('/whatsapp/status/:tenant_id/channels/:channel_id', async (request, reply) => {
    const { tenant_id, channel_id } = request.params;
    if (!UUID_REGEX.test(tenant_id) || !UUID_REGEX.test(channel_id)) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Invalid UUID format' });
    }

    return withAdminClient(async (client) => {
      const result = await client.query(
        `SELECT c.id, c.tenant_id, c.name, c.phone_number, c.status, c.config, c.created_at,
                s.id AS session_id, s.status AS session_status, s.qr_code,
                s.qr_generated_at, s.qr_scanned_at, s.qr_scanned_by, s.updated_at AS session_updated_at,
                s.credentials IS NOT NULL AND s.credentials::text != '{}' AS has_credentials
         FROM wapp_channels c
         LEFT JOIN wapp_sessions s ON s.channel_id = c.id AND s.deleted_at IS NULL
         WHERE c.id = $1 AND c.tenant_id = $2 AND c.deleted_at IS NULL`,
        [channel_id, tenant_id]
      );
      if (result.rows.length === 0) {
        return reply.status(404).send({ error: 'Not Found' });
      }
      return result.rows[0];
    });
  });

  // ── POST /admin/whatsapp/status/:tenant_id/channels/:channel_id/reconnect ─
  // Resets credentials for a specific channel and triggers QR generation.
  app.post('/whatsapp/status/:tenant_id/channels/:channel_id/reconnect', async (request, reply) => {
    const { tenant_id, channel_id } = request.params;
    if (!UUID_REGEX.test(tenant_id) || !UUID_REGEX.test(channel_id)) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Invalid UUID format' });
    }

    let sessionId;
    await withAdminClient(async (client) => {
      // Verify channel belongs to tenant
      const channelCheck = await client.query(
        'SELECT id FROM wapp_channels WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
        [channel_id, tenant_id]
      );
      if (channelCheck.rows.length === 0) {
        return reply.status(404).send({ error: 'Not Found', message: 'Channel not found' });
      }

      // Check if session exists for this channel
      const check = await client.query(
        'SELECT id FROM wapp_sessions WHERE channel_id = $1 AND deleted_at IS NULL',
        [channel_id]
      );
      if (check.rows.length === 0) {
        sessionId = uuidv7();
        await client.query(
          "INSERT INTO wapp_sessions (id, tenant_id, channel_id, credentials, status) VALUES ($1, $2, $3, '{}', 'waiting_qr')",
          [sessionId, tenant_id, channel_id]
        );
      } else {
        sessionId = check.rows[0].id;
        await client.query(
          "UPDATE wapp_sessions SET credentials = '{}', status = 'waiting_qr', qr_code = NULL WHERE id = $1",
          [sessionId]
        );
      }

      // Update channel status
      await client.query(
        "UPDATE wapp_channels SET status = 'waiting_qr' WHERE id = $1",
        [channel_id]
      );
    });

    await app.boss.send('wapp-session-control', {
      action: 'reconnect',
      tenantId: tenant_id,
      sessionId,
      channelId: channel_id
    });

    await logAudit({
      actor: request.user?.sub || 'user',
      action: 'reconnect_channel',
      resource: 'whatsapp_channel',
      resourceId: channel_id,
      details: { tenant_id, message: 'Reconexión de canal WhatsApp y regeneración de QR' }
    });

    return { message: 'Reconexión de canal encolada', channelId: channel_id, sessionId };
  });

  // ── DELETE /admin/whatsapp/status/:tenant_id/channels/:channel_id ─
  // Soft-deletes a specific channel and terminates its Baileys socket.
  app.delete('/whatsapp/status/:tenant_id/channels/:channel_id', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          confirm: { type: 'string', enum: ['true'] },
        },
        required: ['confirm'],
        additionalProperties: false,
      }
    }
  }, async (request, reply) => {
    const { tenant_id, channel_id } = request.params;
    if (!UUID_REGEX.test(tenant_id) || !UUID_REGEX.test(channel_id)) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Invalid UUID format' });
    }

    let sessionId;
    await withAdminClient(async (client) => {
      // Find and soft-delete the session
      const check = await client.query(
        'SELECT id FROM wapp_sessions WHERE channel_id = $1 AND deleted_at IS NULL',
        [channel_id]
      );
      if (check.rows.length > 0) {
        sessionId = check.rows[0].id;
        await client.query(
          `UPDATE wapp_sessions 
           SET deleted_at = now(), status = 'disconnected', qr_code = NULL, credentials = '{}' 
           WHERE id = $1`,
          [sessionId]
        );
      }

      // Soft-delete the channel
      await client.query(
        "UPDATE wapp_channels SET deleted_at = now(), status = 'disconnected' WHERE id = $1 AND tenant_id = $2",
        [channel_id, tenant_id]
      );
    });

    if (sessionId) {
      await app.boss.send('wapp-session-control', {
        action: 'disconnect',
        tenantId: tenant_id,
        sessionId,
        channelId: channel_id
      });
    }

    await logAudit({
      actor: request.user?.sub || 'user',
      action: 'delete_channel',
      resource: 'whatsapp_channel',
      resourceId: channel_id,
      details: { tenant_id, message: 'Canal WhatsApp eliminado' }
    });

    return reply.status(200).send();
  });

  // ── PATCH /admin/whatsapp/status/:tenant_id/channels/:channel_id ──
  // Updates channel name and/or config.
  app.patch('/whatsapp/status/:tenant_id/channels/:channel_id', {
    schema: {
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 100 },
          config: { type: 'object' },
        },
        additionalProperties: false,
      }
    }
  }, async (request, reply) => {
    const { tenant_id, channel_id } = request.params;
    if (!UUID_REGEX.test(tenant_id) || !UUID_REGEX.test(channel_id)) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Invalid UUID format' });
    }

    const { name, config } = request.body || {};
    if (!name && !config) {
      return reply.status(200).send();
    }

    const sets = [];
    const values = [];
    let paramIndex = 1;

    if (name) { sets.push(`name = $${paramIndex++}`); values.push(name); }
    if (config) { sets.push(`config = $${paramIndex++}`); values.push(JSON.stringify(config)); }

    values.push(channel_id, tenant_id);

    await withAdminClient(async (client) => {
      const result = await client.query(
        `UPDATE wapp_channels SET ${sets.join(', ')} WHERE id = $${paramIndex++} AND tenant_id = $${paramIndex} AND deleted_at IS NULL`,
        values
      );
      if (result.rowCount === 0) {
        return reply.status(404).send({ error: 'Not Found' });
      }
    });

    await logAudit({
      actor: request.user?.sub || 'user',
      action: 'update_channel',
      resource: 'whatsapp_channel',
      resourceId: channel_id,
      details: { tenant_id, name, config }
    });

    return reply.status(200).send({ id: channel_id, tenant_id, name, config });
  });

  // ════════════════════════════════════════════════════════════════════
  // BLOQUE 5 — Storage Browser
  // ════════════════════════════════════════════════════════════════════

  // ── GET /admin/storage ──────────────────────────────────────────────
  // Paginated file list with tenant/status filter
  app.get('/storage', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          page:      { type: 'integer', minimum: 1, default: 1 },
          limit:     { type: 'integer', minimum: 1, default: 50 },
          tenant_id: { type: 'string' },
          status:    { type: 'string', enum: ['pending', 'uploaded', 'deleted'] },
          search:    { type: 'string' },
        },
        additionalProperties: false,
      },
    },
  }, async (request, _reply) => {
    const { page, limit, tenant_id, status, search } = request.query;
    const offset = (page - 1) * limit;

    return withAdminClient(async (client) => {
      const conditions = [];
      const params = [];
      let paramIdx = 1;

      if (tenant_id) {
        conditions.push(`tenant_id = $${paramIdx++}::uuid`);
        params.push(tenant_id);
      }
      if (status) {
        conditions.push(`status = $${paramIdx++}`);
        params.push(status);
      }
      if (search) {
        conditions.push(`file_name ILIKE $${paramIdx++}`);
        params.push(`%${search}%`);
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const countResult = await client.query(
        `SELECT COUNT(*)::int AS total FROM storage_objects ${where}`, params
      );
      const total = countResult.rows[0].total;

      params.push(limit, offset);
      const result = await client.query(
        `SELECT id, tenant_id, file_name, size, mime_type, storage_key, status, created_at, deleted_at
         FROM storage_objects ${where}
         ORDER BY created_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx}`,
        params
      );

      return { data: result.rows, meta: { total, page, limit } };
    });
  });

  // ── GET /admin/storage/summary ──────────────────────────────────────
  // Aggregated storage stats
  app.get('/storage/summary', async (_request, _reply) => {
    return withAdminClient(async (client) => {
      const result = await client.query(`
        SELECT
          count(*) FILTER (WHERE status = 'uploaded' AND deleted_at IS NULL)::int AS active_files,
          count(*) FILTER (WHERE status = 'pending')::int AS pending_files,
          count(*) FILTER (WHERE deleted_at IS NOT NULL)::int AS deleted_files,
          coalesce(sum(size) FILTER (WHERE status = 'uploaded' AND deleted_at IS NULL), 0)::bigint AS active_bytes,
          count(DISTINCT tenant_id) FILTER (WHERE status = 'uploaded')::int AS tenants_with_files
        FROM storage_objects
      `);
      return result.rows[0];
    });
  });

  // ── GET /admin/storage/:id/download-url ────────────────────────────
  app.get('/storage/:id/download-url', {
    schema: {
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } },
        required: ['id']
      }
    }
  }, async (request, reply) => {
    const { id } = request.params;
    return withAdminClient(async (client) => {
      const res = await client.query('SELECT storage_key FROM storage_objects WHERE id = $1', [id]);
      if (res.rowCount === 0) {
        return reply.status(404).send({ error: 'Not Found', message: 'Storage object not found' });
      }
      const storage_key = res.rows[0].storage_key;
      const command = new GetObjectCommand({
        Bucket: storage_key.startsWith('inbox/') ? 'jarvis-private' : config.storage.bucket,
        Key: storage_key
      });
      const url = await getSignedUrl(getPresigningS3Client(request), command, { expiresIn: 300 });
      
      // Fire and forget audit log outside the transaction, or wait for it
      await logAudit({
        actor: 'jarvis_admin',
        action: 'download_url',
        resource: 'storage',
        resourceId: id,
        details: { storage_key }
      });
      return { url, expires_in: 300 };
    });
  });

  // ── POST /admin/storage/batch-urls ─────────────────────────────────
  app.post('/storage/batch-urls', {
    schema: {
      body: {
        type: 'object',
        properties: { ids: { type: 'array', items: { type: 'string', format: 'uuid' }, maxItems: 100 } },
        required: ['ids']
      }
    }
  }, async (request, _reply) => {
    const { ids } = request.body;
    if (ids.length === 0) return [];
    
    return withAdminClient(async (client) => {
      const res = await client.query('SELECT id, storage_key FROM storage_objects WHERE id = ANY($1::uuid[])', [ids]);
      const urls = [];
      for (const row of res.rows) {
        const command = new GetObjectCommand({
          Bucket: row.storage_key.startsWith('inbox/') ? 'jarvis-private' : config.storage.bucket,
          Key: row.storage_key
        });
        const url = await getSignedUrl(getPresigningS3Client(request), command, { expiresIn: 300 });
        urls.push({ id: row.id, url });
      }
      return urls;
    });
  });

  // ── DELETE /admin/storage/:id ──────────────────────────────────────
  const deleteStorageHandler = async (request, reply) => {
    const { id } = request.params;
    const found = await withAdminClient(async (client) => {
      const res = await client.query(
        `UPDATE storage_objects SET status = 'deleted', deleted_at = now() 
         WHERE id = $1 AND deleted_at IS NULL RETURNING storage_key, tenant_id`,
        [id]
      );
      if (res.rowCount === 0) return false;
      
      const { storage_key, tenant_id } = res.rows[0];
      
      if (app.boss) {
        await app.boss.send('storage-purge', {
          tenantId: tenant_id,
          storageKey: storage_key,
          requestedBy: 'jarvis_admin'
        });
      }

      await logAudit({
        actor: 'jarvis_admin',
        action: 'delete',
        resource: 'storage',
        resourceId: id,
        details: { storage_key }
      });
      
      return true;
    });

    if (!found) {
      return reply.status(404).send({ error: 'Not Found' });
    }
    
    return reply.status(200).send();
  };

  const deleteStorageSchema = {
    schema: {
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } },
        required: ['id']
      },
      querystring: {
        type: 'object',
        properties: { confirm: { type: 'string', enum: ['true'] } },
        required: ['confirm']
      }
    }
  };

  app.delete('/storage/:id', deleteStorageSchema, deleteStorageHandler);
  app.delete('/storage/:id/download-url', deleteStorageSchema, deleteStorageHandler);

  // ── POST /admin/storage/bulk-delete ────────────────────────────────
  app.post('/storage/bulk-delete', {
    schema: {
      body: {
        type: 'object',
        properties: {
          ids: { type: 'array', items: { type: 'string', format: 'uuid' }, maxItems: 100 },
          confirm: { type: 'boolean' }
        },
        required: ['ids', 'confirm']
      }
    }
  }, async (request, _reply) => {
    const { ids } = request.body;
    if (ids.length === 0) return { deletedCount: 0 };

    return withAdminClient(async (client) => {
      const res = await client.query(
        `UPDATE storage_objects SET status = 'deleted', deleted_at = now() 
         WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL RETURNING id, storage_key, tenant_id`,
        [ids]
      );
      
      if (app.boss) {
        for (const row of res.rows) {
          await app.boss.send('storage-purge', {
            tenantId: row.tenant_id,
            storageKey: row.storage_key,
            requestedBy: 'jarvis_admin'
          });
        }
      }

      await logAudit({
        actor: 'jarvis_admin',
        action: 'bulk_delete',
        resource: 'storage',
        details: { count: res.rowCount, object_ids: ids }
      });
      
      return { deletedCount: res.rowCount };
    });
  });

  // ── POST /admin/storage/bulk-download ──────────────────────────────
  app.post('/storage/bulk-download', {
    schema: {
      body: {
        type: 'object',
        properties: { ids: { type: 'array', items: { type: 'string', format: 'uuid' }, maxItems: 500 } },
        required: ['ids']
      }
    }
  }, async (request, reply) => {
    const { ids } = request.body;
    if (ids.length === 0) return reply.status(400).send({ error: 'Bad Request', message: 'No IDs provided' });
    
    if (app.boss) {
      const jobId = await app.boss.send('storage-zip', { ids, requestedBy: 'jarvis_admin' });
      return reply.status(202).send({ jobId, status: 'processing' });
    } else {
      return reply.status(500).send({ error: 'Internal Error', message: 'pg-boss is disabled' });
    }
  });

  // ── GET /admin/storage/zip/:jobId/download-url ─────────────────────
  app.get('/storage/zip/:jobId/download-url', {
    schema: {
      params: {
        type: 'object',
        properties: { jobId: { type: 'string', format: 'uuid' } },
        required: ['jobId']
      }
    }
  }, async (request, reply) => {
    const { jobId } = request.params;
    
    return withAdminClient(async (client) => {
      const res = await client.query('SELECT data, state FROM pgboss.job WHERE id = $1', [jobId]);
      if (res.rowCount === 0) return reply.status(404).send({ error: 'Not Found', message: 'Job not found' });
      
      const job = res.rows[0];
      if (job.state !== 'completed') {
        return reply.status(400).send({ error: 'Bad Request', message: 'Job not completed yet' });
      }
      
      const zipKey = job.data?.output?.zipKey;
      if (!zipKey) {
        return reply.status(404).send({ error: 'Not Found', message: 'Zip file not generated' });
      }

      const command = new GetObjectCommand({
        Bucket: config.storage.bucket,
        Key: zipKey
      });
      const url = await getSignedUrl(getPresigningS3Client(request), command, { expiresIn: 600 });
      return { url };
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // BLOQUE 6 — System Config
  // ════════════════════════════════════════════════════════════════════

  // ── GET /admin/config ───────────────────────────────────────────────
  app.get('/config', async (_request, _reply) => {
    return withAdminClient(async (client) => {
      const result = await client.query('SELECT key, value, updated_at, updated_by FROM system_config ORDER BY key');
      return result.rows;
    });
  });

  // ── PATCH /admin/config/:key ────────────────────────────────────────
  app.patch('/config/:key', {
    schema: {
      body: {
        type: 'object',
        required: ['value'],
        properties: {
          value: { type: 'object' },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const { key } = request.params;

    const result = await withAdminClient(async (client) => {
      return client.query(
        'UPDATE system_config SET value = $1, updated_at = now(), updated_by = $2 WHERE key = $3 RETURNING key, value, updated_at, updated_by',
        [JSON.stringify(request.body.value), request.user?.sub || 'system', key]
      );
    });

    if (result.rowCount === 0) {
      return reply.status(404).send({ error: 'Config key not found' });
    }

    await logAudit({
      actor: request.user?.sub || 'system',
      action: 'update',
      resource: 'config',
      resourceId: key,
      details: request.body.value,
    });
    await app.boss.send('admin-lifecycle', {
      event: 'config_updated',
      configKey: key,
      actor: request.user?.sub || 'system',
    });

    return reply.status(200).send();
  });

  // ════════════════════════════════════════════════════════════════════
  // BLOQUE 7 — Log Viewer (Loki Proxy)
  // ════════════════════════════════════════════════════════════════════

  // ── GET /admin/logs ─────────────────────────────────────────────────
  // Proxies to Loki's query_range endpoint
  app.get('/logs', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          query: { type: 'string', default: '{job="jarvis"}' },
          limit: { type: 'integer', minimum: 1, default: 100 },
          start: { type: 'string' },
          end:   { type: 'string' },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const lokiHost = process.env.LOKI_HOST || 'http://loki:3100';
    const { query, limit, start, end } = request.query;

    const params = new URLSearchParams({ query, limit: String(limit) });
    if (start) params.set('start', start);
    if (end) params.set('end', end);

    try {
      const lokiResp = await fetch(`${lokiHost}/loki/api/v1/query_range?${params}`);
      if (!lokiResp.ok) {
        const body = await lokiResp.text();
        return reply.status(lokiResp.status).send({ error: 'Loki error', message: body });
      }
      const data = await lokiResp.json();

      // Flatten Loki streams into simple log entries
      const entries = [];
      for (const stream of (data.data?.result || [])) {
        const labels = stream.stream || {};
        for (const [ts, line] of (stream.values || [])) {
          entries.push({
            timestamp: ts,
            line,
            labels,
          });
        }
      }

      // Sort newest first
      entries.sort((a, b) => Number(b.timestamp) - Number(a.timestamp));

      return { data: entries.slice(0, limit), meta: { total: entries.length } };
    } catch (err) {
      return reply.status(502).send({ error: 'Loki unreachable', message: err.message });
    }
  });

  // ── GET /admin/logs/labels ──────────────────────────────────────────
  // Available Loki label names for filtering
  app.get('/logs/labels', async (_request, reply) => {
    const lokiHost = process.env.LOKI_HOST || 'http://loki:3100';
    try {
      const resp = await fetch(`${lokiHost}/loki/api/v1/labels`);
      if (!resp.ok) return reply.status(resp.status).send({ error: 'Loki error' });
      return resp.json();
    } catch (err) {
      return reply.status(502).send({ error: 'Loki unreachable', message: err.message });
    }
  });

  // ════════════════════════════════════════════════════════════════════
  // BLOQUE 9 — Token Management
  // ════════════════════════════════════════════════════════════════════

  // ── GET /admin/tokens/revoked ───────────────────────────────────────
  // Lists revoked tokens
  app.get('/tokens/revoked', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          page:  { type: 'integer', minimum: 1, default: 1 },
          limit: { type: 'integer', minimum: 1, default: 50 },
        },
        additionalProperties: false,
      },
    },
  }, async (request, _reply) => {
    const { page, limit } = request.query;
    const offset = (page - 1) * limit;

    return withAdminClient(async (client) => {
      const countResult = await client.query('SELECT COUNT(*)::int AS total FROM revoked_tokens');
      const total = countResult.rows[0].total;

      const result = await client.query(
        'SELECT jti, tenant_id, revoked_at, revoked_by FROM revoked_tokens ORDER BY revoked_at DESC LIMIT $1 OFFSET $2',
        [limit, offset]
      );

      return { data: result.rows, meta: { total, page, limit } };
    });
  });

  // ── POST /admin/tokens/revoke ───────────────────────────────────────
  // Revokes a token by JTI
  app.post('/tokens/revoke', {
    schema: {
      body: {
        type: 'object',
        required: ['jti', 'tenant_id'],
        properties: {
          jti:       { type: 'string', format: 'uuid' },
          tenant_id: { type: 'string', format: 'uuid' },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const { jti, tenant_id } = request.body;

    try {
      await withAdminClient(async (client) => {
        return client.query(
          'INSERT INTO revoked_tokens (jti, tenant_id, revoked_by) VALUES ($1, $2, $3)',
          [jti, tenant_id, request.user?.sub || 'system']
        );
      });

      await logAudit({
        actor: request.user?.sub || 'system',
        action: 'revoke',
        resource: 'token',
        resourceId: jti,
        details: { tenant_id },
      });
      await app.boss.send('admin-lifecycle', {
        event: 'token_revoked',
        tenantId: tenant_id || null,
        actor: request.user?.sub || 'system',
        jti,
      });

      return reply.status(201).send();
    } catch (err) {
      if (err.code === '23505') {
        return reply.status(409).send({ error: 'Token already revoked' });
      }
      throw err;
    }
  });

  // ════════════════════════════════════════════════════════════════════
  // BLOQUE 10 — Health Monitor
  // ════════════════════════════════════════════════════════════════════

  // ── GET /admin/health ───────────────────────────────────────────────
  // Aggregated health status of all services
  app.get('/health', async (_request, _reply) => {
    const checks = {};

    // Database
    try {
      const start = Date.now();
      await withAdminClient(async (client) => {
        await client.query('SELECT 1');
      });
      checks.database = { status: 'healthy', latency_ms: Date.now() - start };
    } catch (err) {
      checks.database = { status: 'unhealthy', error: err.message };
    }

    // Pooler (same DB path but via pooler)
    checks.pooler = checks.database;

    // Loki
    try {
      const lokiHost = process.env.LOKI_HOST || 'http://loki:3100';
      const start = Date.now();
      const resp = await fetch(`${lokiHost}/ready`, { signal: AbortSignal.timeout(3000) });
      checks.loki = { status: resp.ok ? 'healthy' : 'degraded', latency_ms: Date.now() - start };
    } catch (err) {
      checks.loki = { status: 'unhealthy', error: err.message };
    }

    // Storage (MinIO)
    try {
      const storageEndpoint = process.env.STORAGE_ENDPOINT || 'http://storage:9000';
      const start = Date.now();
      const resp = await fetch(`${storageEndpoint}/minio/health/ready`, { signal: AbortSignal.timeout(3000) });
      checks.storage = { status: resp.ok ? 'healthy' : 'degraded', latency_ms: Date.now() - start };
    } catch (err) {
      checks.storage = { status: 'unhealthy', error: err.message };
    }

    // pg-boss queue health
    try {
      const start = Date.now();
      const result = await withAdminClient(async (client) => {
        return client.query(`
          SELECT
            count(*) FILTER (WHERE state = 'active')::int AS active,
            count(*) FILTER (WHERE state = 'failed' AND created_on > now() - interval '1 hour')::int AS recent_failures
          FROM pgboss.job
        `);
      });
      const row = result.rows[0];
      checks.job_queue = {
        status: row.recent_failures > 10 ? 'degraded' : 'healthy',
        active_jobs: row.active,
        recent_failures: row.recent_failures,
        latency_ms: Date.now() - start,
      };
    } catch (err) {
      checks.job_queue = { status: 'unhealthy', error: err.message };
    }

    const overallStatus = Object.values(checks).every(c => c.status === 'healthy')
      ? 'healthy'
      : Object.values(checks).some(c => c.status === 'unhealthy')
        ? 'unhealthy'
        : 'degraded';

    return { status: overallStatus, services: checks, timestamp: new Date().toISOString() };
  });

  // ════════════════════════════════════════════════════════════════════
  // BLOQUE E — Sync Inbox Monitor
  // ════════════════════════════════════════════════════════════════════

  // ── GET /admin/inbox ────────────────────────────────────────────────
  // Paginated inbox items with filters (E.1)
  app.get('/inbox', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          page:      { type: 'integer', minimum: 1, default: 1 },
          limit:     { type: 'integer', minimum: 1, default: 50 },
          status:    { type: 'string' },
          tenant_id: { type: 'string' },
        },
        additionalProperties: false,
      },
    },
  }, async (request, _reply) => {
    const { page, limit, status, tenant_id } = request.query;
    const offset = (page - 1) * limit;

    const whereClauses = [];
    const params = [];
    let idx = 1;

    if (status) {
      whereClauses.push(`status = $${idx++}`);
      params.push(status);
    }
    if (tenant_id) {
      if (UUID_REGEX.test(tenant_id)) {
        whereClauses.push(`tenant_id = $${idx++}`);
        params.push(tenant_id);
      } else {
        return { data: [], meta: { total: 0, page, limit } };
      }
    }

    const whereString = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    return withAdminClient(async (client) => {
      const countResult = await client.query(
        `SELECT COUNT(*)::int AS total FROM sync_inbox ${whereString}`,
        params
      );
      const total = countResult.rows[0].total;

      const selectParams = [...params, limit, offset];
      const result = await client.query(
        `SELECT id, tenant_id, payload, status, created_at, processed_at FROM sync_inbox ${whereString} ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
        selectParams
      );

      return { data: result.rows, meta: { total, page, limit } };
    });
  });

  // ── GET /admin/inbox/:id ────────────────────────────────────────────
  // Detailed single sync inbox item (E.2)
  app.get('/inbox/:id', async (request, reply) => {
    const { id } = request.params;
    if (!UUID_REGEX.test(id)) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Invalid UUID format' });
    }

    const result = await withAdminClient(async (client) => {
      return client.query(
        'SELECT id, tenant_id, payload, status, created_at, processed_at FROM sync_inbox WHERE id = $1',
        [id]
      );
    });

    if (result.rowCount === 0) {
      return reply.status(404).send({ error: 'Inbox item not found' });
    }

    return result.rows[0];
  });

  // ── POST /admin/inbox/:id/reprocess ─────────────────────────────────
  // Reprocesses a failed inbox item (E.4) by setting status to pending and enqueuing a pg-boss job.
  app.post('/inbox/:id/reprocess', async (request, reply) => {
    const { id } = request.params;
    if (!UUID_REGEX.test(id)) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Invalid UUID format' });
    }

    const result = await withAdminClient(async (client) => {
      return client.query(
        "UPDATE sync_inbox SET status = 'pending', processed_at = NULL WHERE id = $1 RETURNING id, tenant_id, status, payload",
        [id]
      );
    });

    if (result.rowCount === 0) {
      return reply.status(404).send({ error: 'Inbox item not found' });
    }

    const { tenant_id: tenantId, payload } = result.rows[0];

    // Enqueue the pg-boss job so the transactional worker actually reprocesses it
    if (app.boss) {
      await app.boss.send('sync-inbox-process', {
        inboxId: id,
        tenantId,
        payload,
      }, {
        retryLimit: 3,
        retryDelay: 5,
        retryBackoff: true,
        expireInSeconds: 300,
      });
    }

    await logAudit({
      actor: request.user?.sub || 'system',
      action: 'reprocess',
      resource: 'inbox',
      resourceId: id,
      details: { tenant_id: tenantId },
    });

    return reply.status(200).send();
  });
}
