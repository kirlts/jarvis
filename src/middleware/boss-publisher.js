// pg-boss Publisher Plugin
// Registers a pg-boss instance on the Fastify app for job publishing.
// The CONSUMER (boss-worker.js) runs as a separate process.
// This plugin only handles job CREATION from HTTP handlers.
//
// Constraint: §4.7 – pg-boss connects directly to PG :5432

import { PgBoss } from 'pg-boss';
import config from '../config.js';

/**
 * @param {import('fastify').FastifyInstance} app
 */
export async function registerBossPublisher(app) {
  const boss = new PgBoss(config.boss.connectionString);

  boss.on('error', (err) => {
    app.log.error({ err: err.message }, 'pg-boss publisher error');
  });

  await boss.start();
  await boss.createQueue('sync-inbox-process');

  // Decorate app so routes can access boss.send()
  app.decorate('boss', boss);

  // Clean shutdown
  app.addHook('onClose', async () => {
    await boss.stop({ graceful: true, timeout: 5_000 });
  });
}
