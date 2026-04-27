// Sync Inbox – Route Handler
// MASTER-SPEC §2: POST /sync_inbox → HTTP 202 Accepted
// Covers: CLNT.AV.01, CLNT.AV.02, CLNT.FN.01, CLNT.FN.02, CLNT.CR.01,
//         CLNT.CR.03, CORE.FN.01, CORE.FN.02, CORE.CR.02, CORE.IN.02

import { query } from '../../db.js';
import { syncInboxSchema } from './schema.js';

/**
 * @param {import('fastify').FastifyInstance} app
 */
export async function registerSyncInbox(app) {
  app.post('/sync/inbox', {
    schema: syncInboxSchema,
    // Constraint: CORE.IN.02 – all inbox operations require valid JWT
    onRequest: [app.authenticate],
  }, async (request, reply) => {
    const { id, tenant_id, payload } = request.body;

    // Insert raw payload into inbox (CORE.FN.02)
    // Using ON CONFLICT for idempotency (CLNT.IN.01)
    const result = await query(
      `INSERT INTO sync_inbox (id, tenant_id, payload)
       VALUES ($1, $2, $3)
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
      [id, tenant_id, payload]
    );

    // Enqueue pg-boss job only if a new row was inserted (idempotent)
    if (result.rowCount > 0 && app.boss) {
      await app.boss.send('sync-inbox-process', {
        inboxId: id,
        tenantId: tenant_id,
        payload,
      }, {
        retryLimit: 3,
        retryDelay: 5,
        retryBackoff: true,
        expireInSeconds: 300,
      });
    }

    // Constraint: CORE.CR.02 – strictly 202
    reply.status(202).header('Content-Type', 'application/json').send({
      accepted: true,
      id,
    });
  });
}
