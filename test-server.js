import Fastify from 'fastify';
import { registerSyncInbox } from './src/features/sync-inbox/routes.js';
import pool from './src/db.js';

const app = Fastify();
app.decorate('authenticate', async () => {});
app.decorate('boss', { send: async () => 'job' });
pool.query = async () => ({ rowCount: 1 });
app.register(registerSyncInbox, { prefix: '/api/v1' });

app.listen({ port: 3005 }).then(() => console.log('Listening'));
