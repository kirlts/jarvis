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
          page:  { type: 'integer', minimum: 1, default: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        },
        additionalProperties: false,
      },
    },
  }, async (request, _reply) => {
    const { page, limit } = request.query;
    const offset = (page - 1) * limit;

    return withAdminClient(async (client) => {
      const countResult = await client.query(
        'SELECT COUNT(*)::int AS total FROM tenants WHERE deleted_at IS NULL'
      );
      const total = countResult.rows[0].total;

      const result = await client.query(
        'SELECT id, name, created_at, deleted_at FROM tenants WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT $1 OFFSET $2',
        [limit, offset]
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
        'SELECT id, name, created_at, deleted_at FROM tenants WHERE id = $1',
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
  app.patch('/tenants/:id', {
    schema: {
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 255 },
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

    const { name } = request.body;

    try {
      const result = await withAdminClient(async (client) => {
        return client.query(
          'UPDATE tenants SET name = $1 WHERE id = $2 AND deleted_at IS NULL RETURNING id, name, created_at, deleted_at',
          [name, id]
        );
      });

      if (result.rowCount === 0) {
        return reply.status(404).send({ error: 'Not Found' });
      }

      return result.rows[0];
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

  // ── GET /admin/jobs (with filters) ─────────────────────────────────
  app.get('/jobs', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          state:     { type: 'string' },
          tenant_id: { type: 'string' },
          limit:     { type: 'integer', minimum: 1, maximum: 100, default: 50 },
        },
        additionalProperties: false,
      },
    },
  }, async (request, _reply) => {
    const { state, tenant_id, limit } = request.query;

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
}
