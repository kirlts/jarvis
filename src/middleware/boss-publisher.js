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
  await boss.createQueue('admin-lifecycle', { retryBackoff: false, retryLimit: 0 });

  // Sink worker: auto-completes admin lifecycle jobs so they show as 'completed' in Job Queues.
  // These jobs exist purely for observability — no processing logic needed.
  await boss.work('admin-lifecycle', { teamSize: 5, teamConcurrency: 5 }, async () => {});

  // Decorate app so routes can access boss.send()
  app.decorate('boss', boss);

  // Clean shutdown
  app.addHook('onClose', async () => {
    await boss.stop({ graceful: true, timeout: 5_000 });
  });
}
