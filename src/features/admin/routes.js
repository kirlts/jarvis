import pool from '../../db.js';

/**
 * @param {import('fastify').FastifyInstance} app
 */
export async function registerAdminRoutes(app) {
  // Enforce admin JWT
  app.addHook('onRequest', app.adminAuthenticate);

  // Enforce super_admin role
  app.addHook('preHandler', async (request, reply) => {
    if (!request.user || request.user.role !== 'super_admin') {
      return reply.status(403).send({ error: 'Forbidden' });
    }
  });

  // GET /admin/tenants
  app.get('/tenants', async (request, reply) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL role = 'jarvis_admin'");
      const result = await client.query('SELECT id, name, created_at, deleted_at FROM tenants');
      await client.query('COMMIT');
      return result.rows;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

  // GET /admin/jobs
  app.get('/jobs', async (request, reply) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL role = 'jarvis_admin'");
      // pg-boss internal tables are in the `pgboss` schema
      const result = await client.query('SELECT id, name, state, created_on, started_on, completed_on FROM pgboss.job ORDER BY created_on DESC LIMIT 100');
      await client.query('COMMIT');
      return result.rows;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

  // GET /admin/whatsapp/status
  app.get('/whatsapp/status', async (request, reply) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL role = 'jarvis_admin'");
      const result = await client.query('SELECT tenant_id, status, updated_at FROM wapp_sessions');
      await client.query('COMMIT');
      return result.rows;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

  // DELETE /admin/tenants/:id
  app.delete('/tenants/:id', {
    schema: {
      querystring: {
        type: 'object',
        required: ['confirm'],
        properties: {
          confirm: { type: 'string', const: 'true' }
        }
      }
    }
  }, async (request, reply) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL role = 'jarvis_admin'");
      
      const { id } = request.params;
      const result = await client.query('DELETE FROM tenants WHERE id = $1 RETURNING id', [id]);
      
      await client.query('COMMIT');
      
      if (result.rowCount === 0) {
        return reply.status(404).send({ error: 'Tenant not found' });
      }
      
      return { status: 'deleted', id };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });
}
