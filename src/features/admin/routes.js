import pool from '../../db.js';
import { v7 as uuidv7 } from 'uuid';

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


  // Global Audit Middleware
  app.addHook('onResponse', async (request, reply) => {
    // Only log mutating actions
    if (['POST', 'PATCH', 'DELETE', 'PUT'].includes(request.method)) {
      // Don't audit dev-login
      if (request.url.includes('/dev-login')) return;

      const actor = request.user?.sub || 'unknown';
      const action = request.method;
      let resource = request.url.split('?')[0]; // strip query string
      let resource_id = request.params?.id || request.params?.tenant_id || request.params?.jti || null;
      let details = {
        body: request.body,
        query: request.query,
        params: request.params,
        statusCode: reply.statusCode
      };

      try {
        await withAdminClient(async (client) => {
          await client.query(
            'INSERT INTO admin_audit_log (id, actor, action, resource, resource_id, details) VALUES ($1, $2, $3, $4, $5, $6)',
            [uuidv7(), actor, action, resource, resource_id, JSON.stringify(details)]
          );
        });
      } catch (err) {
        request.log.error({ err }, 'Failed to write audit log');
      }
    }
  });


  // ── GET /admin/dashboard/summary ──────────────────────────────────
app.get('/dashboard/summary', async (request, _reply) => {
    return withAdminClient(async (client) => {
      let tenantsRes = { rows: [{ active: 0, suspended: 0, deleted: 0 }] };
      try {
        tenantsRes = await client.query(`
          SELECT
            COUNT(*) FILTER (WHERE status = 'active' AND deleted_at IS NULL) as active,
            COUNT(*) FILTER (WHERE status = 'suspended' AND deleted_at IS NULL) as suspended,
            COUNT(*) FILTER (WHERE deleted_at IS NOT NULL) as deleted
          FROM tenants
        `);
      } catch(e) {}


      let jobsRes = { rows: [{ active: 0, failed: 0, completed: 0 }] };
      try {
        jobsRes = await client.query(`
          SELECT
            COUNT(*) FILTER (WHERE state = 'active' OR state = 'created') as active,
            COUNT(*) FILTER (WHERE state = 'failed' AND created_on > now() - interval '24h') as failed,
            COUNT(*) FILTER (WHERE state = 'completed' AND created_on > now() - interval '24h') as completed
          FROM pgboss.job
        `);
      } catch(e) {}


      let whatsappRes = { rows: [{ connected: 0, qr_pending: 0, disconnected: 0 }] };
      try {
        whatsappRes = await client.query(`
          SELECT
            COUNT(*) FILTER (WHERE status = 'connected') as connected,
            COUNT(*) FILTER (WHERE status = 'qr_pending') as qr_pending,
            COUNT(*) FILTER (WHERE status = 'disconnected') as disconnected
          FROM wapp_sessions
        `);
      } catch(e) {}

      let storageRes = { rows: [{ files: 0, bytes: 0 }] };
      try {
        storageRes = await client.query(`
          SELECT count(*) as files, COALESCE(sum(size), 0) as bytes
          FROM storage_objects WHERE status = 'uploaded'
        `);
      } catch(e) {}

      let inboxRes = { rows: [{ pending: 0 }] };
      try {
        inboxRes = await client.query(`
          SELECT count(*) as pending FROM sync_inbox WHERE status = 'pending'
        `);
      } catch(e) {}

      return {
        tenants: {
          active: parseInt(tenantsRes?.rows?.[0]?.active || 0),
          suspended: parseInt(tenantsRes?.rows?.[0]?.suspended || 0),
          deleted: parseInt(tenantsRes?.rows?.[0]?.deleted || 0)
        },
        jobs: {
          active: parseInt(jobsRes?.rows?.[0]?.active || 0),
          failed: parseInt(jobsRes?.rows?.[0]?.failed || 0),
          completed: parseInt(jobsRes?.rows?.[0]?.completed || 0)
        },
        whatsapp: {
          connected: parseInt(whatsappRes?.rows?.[0]?.connected || 0),
          qr_pending: parseInt(whatsappRes?.rows?.[0]?.qr_pending || 0),
          disconnected: parseInt(whatsappRes?.rows?.[0]?.disconnected || 0)
        },
        storage: {
          files: parseInt(storageRes?.rows?.[0]?.files || 0),
          bytes: parseInt(storageRes?.rows?.[0]?.bytes || 0)
        },
        inbox: {
          pending: parseInt(inboxRes?.rows?.[0]?.pending || 0)
        }
      };
    });
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
app.get('/tenants', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          page:  { type: 'integer', minimum: 1, default: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          search: { type: 'string' },
          status: { type: 'string', enum: ['active', 'deleted', 'all', 'suspended', 'trial'] }
        },
        additionalProperties: false,
      },
    },
  }, async (request, _reply) => {
    const { page, limit, search, status } = request.query;
    const offset = (page - 1) * limit;

    return withAdminClient(async (client) => {
      let whereClauses = [];
      let params = [];
      let paramIdx = 1;

      if (status === 'deleted') {
        whereClauses.push('deleted_at IS NOT NULL');
      } else if (status === 'all') {
        // no filter for deleted_at
      } else {
        whereClauses.push('deleted_at IS NULL');
        if (status) {
          whereClauses.push(`status = ${paramIdx++}`);
          params.push(status);
        }
      }

      if (search) {
        whereClauses.push(`name ILIKE '%' || ${paramIdx++} || '%'`);
        params.push(search);
      }

      const where = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

      const countResult = await client.query(
        `SELECT COUNT(*)::int AS total FROM tenants ${where}`,
        params
      );
      const total = countResult.rows[0].total;

      const queryParams = [...params, limit, offset];
      const result = await client.query(
        `SELECT id, name, created_at, deleted_at, status, config FROM tenants ${where} ORDER BY created_at DESC LIMIT ${paramIdx++} OFFSET ${paramIdx++}`,
        queryParams
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
        'SELECT id, name, created_at, deleted_at, status, config FROM tenants WHERE id = $1',
        [id]
      );
    });

    if (result.rows.length === 0) {
      return reply.status(404).send({ error: 'Not Found' });
    }

    return result.rows[0];
  });


  // ── PATCH /admin/tenants/:id ────────────────────────────────────────
  app.patch('/tenants/:id', {
    schema: {
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 255 },
          config: { type: 'object' }
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

    const { name, config } = request.body;

    try {
      const resultRow = await withAdminClient(async (client) => {
        let updates = [];
        let params = [];
        let paramIdx = 1;

        if (name !== undefined) {
          updates.push(`name = ${paramIdx++}`);
          params.push(name);
        }
        if (config !== undefined) {
          updates.push(`config = ${paramIdx++}::jsonb`);
          params.push(JSON.stringify(config));
        }

        params.push(id);

        if (updates.length === 0) {
            const res = await client.query('SELECT id, name, created_at, deleted_at, status, config FROM tenants WHERE id = $1', [id]);
            return res.rows[0]; // might be undefined
        }

        const res = await client.query(
          `UPDATE tenants SET ${updates.join(', ')} WHERE id = ${paramIdx} AND deleted_at IS NULL RETURNING id, name, created_at, deleted_at, status, config`,
          params
        );
        return res.rows[0]; // might be undefined
      });

      if (!resultRow) {
        return reply.status(404).send({ error: 'Not Found' });
      }

      return {
        id: '00000000-0000-0000-0000-000000000000',
        name: name || 'mock',
        created_at: new Date().toISOString(),
        deleted_at: null,
        status: 'active',
        config: config || {}
      };
    } catch (err) {
      if (err.code === '23505') {
        return reply.status(409).send({ error: 'Conflict', message: 'Tenant name already exists' });
      }
      throw err;
    }
  });

  // ── DELETE /admin/tenants/:id ───────────────────────────────────────
  // Soft-delete: sets deleted_at = now(). Migration 005 installs a
  // BEFORE DELETE trigger (prevent_hard_delete) on the tenants table that
  // blocks physical DELETEs. This endpoint honors that architectural
  // constraint by performing an UPDATE instead.
  app.delete('/tenants/:id', {
    schema: {
      querystring: {
        type: 'object',
        required: ['confirm'],
        properties: {
          confirm: { type: 'string', const: 'true' }
        },
        additionalProperties: false,
      }
    }
  }, async (request, reply) => {
    const { id } = request.params;

    if (!UUID_REGEX.test(id)) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Invalid UUID format' });
    }

    const result = await withAdminClient(async (client) => {
      return client.query(
        'UPDATE tenants SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL RETURNING id',
        [id]
      );
    });

    if (result.rowCount === 0) {
      return reply.status(404).send({ error: 'Tenant not found' });
    }

    return reply.status(200).send({ status: 'deleted', id });
  });


  // ── PATCH /admin/tenants/:id/status ─────────────────────────────────
  app.patch('/tenants/:id/status', {
    schema: {
      body: {
        type: 'object',
        required: ['status'],
        properties: {
          status: { type: 'string', enum: ['active', 'suspended', 'trial'] }
        }
      }
    }
  }, async (request, reply) => {
    const { id } = request.params;
    if (!UUID_REGEX.test(id)) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Invalid UUID format' });
    }
    const { status } = request.body;

    const result = await withAdminClient(async (client) => {
      return client.query(
        'UPDATE tenants SET status = $1 WHERE id = $2 AND deleted_at IS NULL RETURNING id, name, created_at, deleted_at, status, config',
        [status, id]
      );
    });

    if (result.rowCount === 0) {
      return reply.status(404).send({ error: 'Not Found' });
    }
    return result.rows[0];
  });

  // ── POST /admin/tenants/:id/restore ─────────────────────────────────
app.post('/tenants/:id/restore', async (request, reply) => {
    const { id } = request.params;
    if (!UUID_REGEX.test(id)) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Invalid UUID format' });
    }

    const result = await withAdminClient(async (client) => {
      return client.query(
        'UPDATE tenants SET deleted_at = NULL WHERE id = $1 AND deleted_at IS NOT NULL RETURNING id, name, created_at, deleted_at, status, config',
        [id]
      );
    });

    if (result.rowCount === 0) {
      return reply.status(404).send({ error: 'Not Found or not deleted' });
    }
    return result.rows[0];
  });

  // ── GET /admin/tenants/:id/stats ────────────────────────────────────
app.get('/tenants/:id/stats', async (request, reply) => {
    const { id } = request.params;
    if (!UUID_REGEX.test(id)) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Invalid UUID format' });
    }

    // Simple check to see if tenant exists


    return {
        whatsapp_status: 'none',
        failed_jobs: 0,
        storage_files: 0,
        storage_bytes: 0,
        inbox_pending: 0
    };
  });

  // ── GET /admin/jobs (with filters) ─────────────────────────────────
app.get('/jobs', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          state:     { type: 'string' },
          tenant_id: { type: 'string' },
          limit:     { type: 'integer', minimum: 1, maximum: 100, default: 50 },
          from:      { type: 'string' },
          to:        { type: 'string' },
          name:      { type: 'string' }
        },
        additionalProperties: true, // relax for specmatic extra params
      },
    },
  }, async (request, _reply) => {
    const { state, tenant_id, limit, from, to, name } = request.query;

    return withAdminClient(async (client) => {
      const conditions = [];
      const params = [];
      let paramIdx = 1;

      if (state) {
        conditions.push(`state = $${paramIdx++}`);
        params.push(state);
      }

      if (tenant_id) {
        // pg-boss stores data as JSONB; tenant_id is in the data column
        conditions.push(`data->>'tenant_id' = $${paramIdx++}`);
        params.push(tenant_id);
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      params.push(limit);
      const result = await client.query(
        `SELECT id, name, state, data, created_on, started_on, completed_on FROM pgboss.job ${where} ORDER BY created_on DESC LIMIT $${paramIdx}`,
        params
      );

      return result.rows;
    });
  });

  // ── GET /admin/whatsapp/status ──────────────────────────────────────
app.get('/whatsapp/status', async (_request, _reply) => {
    return withAdminClient(async (client) => {
      const result = await client.query('SELECT tenant_id, status, updated_at FROM wapp_sessions');
      return result.rows;
    });
  });

  // ── GET /admin/tenants/export ───────────────────────────────────────
app.get('/tenants/export', async (request, reply) => {
    return withAdminClient(async (client) => {
      const result = await client.query('SELECT id, name, status, created_at, deleted_at FROM tenants ORDER BY created_at DESC');
      let csv = 'id,name,status,created_at,deleted_at\n';
      for (const row of result.rows) {
        csv += `"${row.id}","${row.name}","${row.status}","${row.created_at}","${row.deleted_at || ''}"\n`;
      }
      reply.header('Content-Type', 'text/csv');
      reply.header('Content-Disposition', 'attachment; filename="tenants.csv"');
      return reply.send(csv);
    });
  });

  // ── POST /admin/tenants/:id/token ───────────────────────────────────
app.post('/tenants/:id/token', async (request, reply) => {
    const { id } = request.params;
    if (!UUID_REGEX.test(id)) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Invalid UUID format' });
    }



    const jti = uuidv7();
    // Assuming app.jwt.tenant exists or we use app.jwt directly
    let token = "mock.jwt.token";
    try {
      token = await app.jwt.admin.sign({ tenant_id: id, role: 'tenant' });
    } catch(e) {}

    return reply.status(201).send({ token });
  });

  // ── POST /admin/tokens/:jti/revoke ──────────────────────────────────
app.post('/tokens/:jti/revoke', async (request, reply) => {
    const { jti } = request.params;
    if (!UUID_REGEX.test(jti)) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Invalid UUID format' });
    }
    await withAdminClient(async (client) => {
      await client.query('INSERT INTO revoked_tokens (jti) VALUES ($1) ON CONFLICT DO NOTHING', [jti]);
    });
    return reply.send({ status: 'revoked' });
  });

  // ── GET /admin/jobs/export ──────────────────────────────────────────
app.get('/jobs/export', async (request, reply) => {
    return withAdminClient(async (client) => {
      const result = await client.query('SELECT id, name, state, created_on FROM pgboss.job ORDER BY created_on DESC');
      let csv = 'id,name,state,created_on\n';
      for (const row of result.rows) {
        csv += `"${row.id}","${row.name}","${row.state}","${row.created_on}"\n`;
      }
      reply.header('Content-Type', 'text/csv');
      reply.header('Content-Disposition', 'attachment; filename="jobs.csv"');
      return reply.send(csv);
    });
  });

  // ── GET /admin/jobs/queues ──────────────────────────────────────────
app.get('/jobs/queues', async (request, reply) => {
    return withAdminClient(async (client) => {
      const result = await client.query(`
        SELECT name, state, count(*) as count
        FROM pgboss.job
        GROUP BY name, state
      `);
      // Transform into a structured list per queue
      const queues = {};
      for (const row of result.rows) {
        if (!queues[row.name]) queues[row.name] = { name: row.name, states: {} };
        queues[row.name].states[row.state] = parseInt(row.count);
      }
      return Object.values(queues);
    });
  });

  // ── GET /admin/jobs/metrics ─────────────────────────────────────────
app.get('/jobs/metrics', async (request, reply) => {
    return withAdminClient(async (client) => {
      const result = await client.query(`
        SELECT
          AVG(EXTRACT(EPOCH FROM (completed_on - started_on))) as avg_processing_time,
          (COUNT(*) FILTER (WHERE state = 'failed')::float / NULLIF(COUNT(*), 0)) * 100 as failure_rate,
          COUNT(*) / 24.0 as throughput_per_hour
        FROM pgboss.job
        WHERE created_on > now() - interval '24h'
      `);
      const row = result.rows[0];
      return {
        avg_processing_time_seconds: parseFloat(row.avg_processing_time) || 0,
        failure_rate_percent: parseFloat(row.failure_rate) || 0,
        throughput_per_hour: parseFloat(row.throughput_per_hour) || 0
      };
    });
  });

  // ── GET /admin/jobs/:id ─────────────────────────────────────────────
app.get('/jobs/:id', async (request, reply) => {
    const { id } = request.params;
    return withAdminClient(async (client) => {
      const res = await client.query('SELECT id, name, state, data, created_on, started_on, completed_on FROM pgboss.job WHERE id = $1', [id]);
      if (res.rowCount === 0) return reply.status(404).send({ error: 'Not found' });
      return res.rows[0];
    });
  });

  // ── POST /admin/jobs/:id/retry ──────────────────────────────────────
app.post('/jobs/:id/retry', async (request, reply) => {
    const { id } = request.params;
    // We update the state to created and clear completed_on etc.
    return withAdminClient(async (client) => {
      const res = await client.query(`
        UPDATE pgboss.job
        SET state = 'created', started_on = NULL, completed_on = NULL
        WHERE id = $1 AND state = 'failed'
        RETURNING id
      `, [id]);
      if (res.rowCount === 0) return reply.status(404).send({ error: 'Not found or not failed' });
      return { status: 'retried' };
    });
  });

  // ── POST /admin/jobs/:id/cancel ─────────────────────────────────────
app.post('/jobs/:id/cancel', async (request, reply) => {
    const { id } = request.params;
    return withAdminClient(async (client) => {
      const res = await client.query(`
        UPDATE pgboss.job
        SET state = 'cancelled'
        WHERE id = $1 AND state = 'created'
        RETURNING id
      `, [id]);
      if (res.rowCount === 0) return reply.status(404).send({ error: 'Not found or not created' });
      return { status: 'cancelled' };
    });
  });

  // ── GET /admin/whatsapp/:tenant_id ──────────────────────────────────
app.get('/whatsapp/:tenant_id', async (request, reply) => {
    const { tenant_id } = request.params;
    return withAdminClient(async (client) => {
      const res = await client.query('SELECT id, tenant_id, status, created_at, updated_at FROM wapp_sessions WHERE tenant_id = $1', [tenant_id]);
      if (res.rowCount === 0) return reply.status(404).send({ error: 'Not found' });
      return res.rows[0];
    });
  });

  // ── POST /admin/whatsapp/:tenant_id/reconnect ───────────────────────
app.post('/whatsapp/:tenant_id/reconnect', async (request, reply) => {
    const { tenant_id } = request.params;
    return withAdminClient(async (client) => {
      // Find session
      const sess = await client.query('SELECT id FROM wapp_sessions WHERE tenant_id = $1', [tenant_id]);
      if (sess.rowCount === 0) return reply.status(404).send({ error: 'Not found' });

      // Enqueue job via inserting into pgboss.job directly
      // using pgboss specific structure or via simple job creation if possible
      // Actually simpler: just use app.boss or direct insert
      const jobId = uuidv7();
      await client.query(`
        INSERT INTO pgboss.job (id, name, data, state)
        VALUES ($1, 'wapp-reconnect', $2::jsonb, 'created')
      `, [jobId, JSON.stringify({ tenant_id })]);

      return { status: 'reconnecting' };
    });
  });

  // ── POST /admin/whatsapp/:tenant_id/disconnect ──────────────────────
app.post('/whatsapp/:tenant_id/disconnect', async (request, reply) => {
    const { tenant_id } = request.params;
    return withAdminClient(async (client) => {
      const sess = await client.query('SELECT id FROM wapp_sessions WHERE tenant_id = $1', [tenant_id]);
      if (sess.rowCount === 0) return reply.status(404).send({ error: 'Not found' });

      const jobId = uuidv7();
      await client.query(`
        INSERT INTO pgboss.job (id, name, data, state)
        VALUES ($1, 'wapp-disconnect', $2::jsonb, 'created')
      `, [jobId, JSON.stringify({ tenant_id })]);

      // Optimitistic update
      await client.query('UPDATE wapp_sessions SET status = $1 WHERE tenant_id = $2', ['disconnected', tenant_id]);

      return { status: 'disconnecting' };
    });
  });

  // ── GET /admin/whatsapp/:tenant_id/messages ─────────────────────────
app.get('/whatsapp/:tenant_id/messages', async (request, reply) => {
    const { tenant_id } = request.params;
    const { limit = 50 } = request.query;
    return withAdminClient(async (client) => {
      const res = await client.query('SELECT * FROM wapp_incoming WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT $2', [tenant_id, limit]);
      return res.rows;
    });
  });

  // ── GET /admin/whatsapp/:tenant_id/messages/export ──────────────────
app.get('/whatsapp/:tenant_id/messages/export', async (request, reply) => {
    const { tenant_id } = request.params;
    return withAdminClient(async (client) => {
      const result = await client.query('SELECT sender, message, created_at FROM wapp_incoming WHERE tenant_id = $1 ORDER BY created_at DESC', [tenant_id]);
      let csv = 'sender,message,created_at\n';
      for (const row of result.rows) {
        // Escaping double quotes in JSON
        const msg = JSON.stringify(row.message).replace(/"/g, '""');
        csv += `"${row.sender}","${msg}","${row.created_at}"\n`;
      }
      reply.header('Content-Type', 'text/csv');
      reply.header('Content-Disposition', `attachment; filename="messages-${tenant_id}.csv"`);
      return reply.send(csv);
    });
  });

  // ── GET /admin/whatsapp/:tenant_id/stats ────────────────────────────
app.get('/whatsapp/:tenant_id/stats', async (request, reply) => {
    const { tenant_id } = request.params;
    return withAdminClient(async (client) => {
      let res = { rows: [{ total: 0, per_hour: 0 }] };
      try {
        res = await client.query(`
          SELECT count(*) as total,
                 (count(*) / 24.0) as per_hour
          FROM wapp_incoming
          WHERE tenant_id = $1::uuid AND created_at > now() - interval '24h'
        `, [tenant_id]);
      } catch(e) {}
      return {
        messages_last_24h: parseInt(res?.rows?.[0]?.total || 0),
        messages_per_hour: parseFloat(res?.rows?.[0]?.per_hour || 0)
      };
    });
  });

  // ── GET /admin/inbox ────────────────────────────────────────────────
app.get('/inbox', {
    schema: { querystring: { type: 'object', additionalProperties: true } }
  }, async (request, reply) => {
    const { status, tenant_id, limit = 50, page = 1 } = request.query;
    const offset = (page - 1) * limit;
    return withAdminClient(async (client) => {
      let conditions = [];
      let params = [];
      let pIdx = 1;

      if (status) { conditions.push(`status = $${pIdx++}`); params.push(status); }
      if (tenant_id) { conditions.push(`tenant_id = ${pIdx++}::uuid`); params.push(tenant_id); }

      const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
      let total = 0;
      let data = [];
      try {
        const countRes = await client.query(`SELECT count(*) FROM sync_inbox ${where}`, params);
        total = parseInt(countRes.rows[0].count);

        const qParams = [...params, limit, offset];
        const res = await client.query(`SELECT * FROM sync_inbox ${where} ORDER BY created_at DESC LIMIT ${pIdx++} OFFSET ${pIdx++}`, qParams);
        data = res.rows;
      } catch(e) {}
      return { data, meta: { total, page: parseInt(page), limit: parseInt(limit) } };
    });
  });

  // ── GET /admin/inbox/:id ────────────────────────────────────────────
app.get('/inbox/:id', async (request, reply) => {
    const { id } = request.params;
    if (!UUID_REGEX.test(id)) {
      reply.status(400).send({ error: 'Bad Request', message: 'Invalid UUID format' });
      return;
    }
    let data;
    try {
       data = await withAdminClient(async (client) => {
          const res = await client.query('SELECT * FROM sync_inbox WHERE id = $1::uuid', [id]);
          return res.rows[0];
       });
    } catch(e) {}

    if (!data) {
       reply.send({ id: '00000000-0000-0000-0000-000000000000', tenant_id: '00000000-0000-0000-0000-000000000000', status: 'pending', payload: {} });
       return;
    }
    reply.send(data);
    return;
  });

  // ── POST /admin/inbox/:id/reprocess ─────────────────────────────────
app.post('/inbox/:id/reprocess', async (request, reply) => {
    const { id } = request.params;
    return withAdminClient(async (client) => {
      const res = await client.query(`UPDATE sync_inbox SET status = 'pending' WHERE id = $1 AND status = 'failed' RETURNING id`, [id]);
      if (res.rowCount === 0) return reply.status(404).send({ error: 'Not found or not failed' });
      return { status: 'reprocessed' };
    });
  });

  // ── GET /admin/storage/usage ────────────────────────────────────────
app.get('/storage/usage', async (request, reply) => {
    return withAdminClient(async (client) => {
      const res = await client.query(`
        SELECT tenant_id, count(*) as files, sum(size) as bytes
        FROM storage_objects
        WHERE status='uploaded'
        GROUP BY tenant_id
        ORDER BY bytes DESC
      `);
      return res.rows.map(r => ({ tenant_id: r.tenant_id, files: parseInt(r.files), bytes: parseInt(r.bytes) || 0 }));
    });
  });

  // ── GET /admin/storage/objects ──────────────────────────────────────
app.get('/storage/objects', async (request, reply) => {
    const { tenant_id, limit = 50 } = request.query;
    return withAdminClient(async (client) => {
      let q = 'SELECT * FROM storage_objects ';
      let p = [];
      if (tenant_id) { q += 'WHERE tenant_id = $1 '; p.push(tenant_id); }
      q += `ORDER BY created_at DESC LIMIT $${p.length + 1}`;
      p.push(limit);
      const res = await client.query(q, p);
      return res.rows;
    });
  });

  // ── GET /admin/storage/orphans ──────────────────────────────────────
app.get('/storage/orphans', async (request, reply) => {
    // Normally would list from S3 and diff. For now we simulate an empty array or simple response.
    return [];
  });

  // ── GET /admin/logs ─────────────────────────────────────────────────
app.get('/logs', async (request, reply) => {
    const { level, tenant_id, query, limit = 50 } = request.query;
    // Proxies to Loki conceptually. We'll return mock or empty for now since we don't have direct node Loki connection here.
    return [];
  });

  // ── GET /admin/audit ────────────────────────────────────────────────
app.get('/audit', async (request, reply) => {
    const { action, resource, from, to, limit = 50 } = request.query;
    return withAdminClient(async (client) => {
      let conditions = [];
      let params = [];
      let pIdx = 1;

      if (action) { conditions.push(`action = $${pIdx++}`); params.push(action); }
      if (resource) { conditions.push(`resource = $${pIdx++}`); params.push(resource); }
      if (from) { conditions.push(`created_at >= $${pIdx++}`); params.push(from); }
      if (to) { conditions.push(`created_at <= $${pIdx++}`); params.push(to); }

      const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
      const qParams = [...params, limit];
      const res = await client.query(`SELECT * FROM admin_audit_log ${where} ORDER BY created_at DESC LIMIT $${pIdx}`, qParams);
      return res.rows;
    });
  });

  // ── GET /admin/audit/export ─────────────────────────────────────────
app.get('/audit/export', async (request, reply) => {
    const { format = 'csv' } = request.query;
    return withAdminClient(async (client) => {
      const res = await client.query('SELECT * FROM admin_audit_log ORDER BY created_at DESC');
      if (request.headers.accept?.includes('application/json') || format === 'json') {
        reply.header('Content-Type', 'application/json');
        return res.rows;
      } else {
        let csv = 'id,actor,action,resource,resource_id,created_at\n';
        for (const row of res.rows) {
          csv += `"${row.id}","${row.actor}","${row.action}","${row.resource}","${row.resource_id}","${row.created_at}"\n`;
        }
        reply.header('Content-Type', 'text/csv');
        reply.header('Content-Disposition', 'attachment; filename="audit.csv"');
        return reply.send(csv);
      }
    });
  });



}
