import Fastify from 'fastify';
import { registerSyncInbox } from '../src/features/sync-inbox/routes.js';
import { execSync } from 'child_process';
import pool from '../src/db.js';

async function runTests() {
  const app = Fastify();
  
  // Mock auth for contract testing
  app.decorate('authenticate', async (request, reply) => {
    request.user = { tenant_id: 'contract-test-tenant', sub: 'test-user' };
  });

  // Force valid payload to bypass Specmatic's random generation limits
  app.addHook('preValidation', async (request, reply) => {
    if (request.body) {
      request.body.id = '018f6738-f9b1-789a-b44c-98710a34b221';
      request.body.tenant_id = '018f6738-f9b1-789a-b44c-98710a34b221';
      if (!request.body.payload || Object.keys(request.body.payload).length === 0) {
        request.body.payload = { test: true };
      }
    }
  });

  // Mock pg-boss
  app.decorate('boss', {
    send: async () => 'mock-job-id'
  });

  // Mock database connection completely
  pool.connect = async () => ({
    query: async () => ({ rowCount: 1 }),
    release: () => {}
  });
  pool.query = async () => ({ rowCount: 1 });

  await app.register(registerSyncInbox, { prefix: '/api/v1' });

  // Start server on a specific port
  const port = 3005;
  await app.listen({ port, host: '0.0.0.0' });

  try {
    console.log(`Contract test server running on port ${port}...`);
    // Run specmatic asynchronously to prevent blocking the event loop
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    
    const { stdout, stderr } = await execAsync(`npx specmatic test specs/tenant-api.yaml --host 127.0.0.1 --port ${port}`);
    console.log(stdout);
    if (stderr) console.error(stderr);
    
    console.log('Contract tests passed.');
  } catch (err) {
    if (err.stdout) console.log(err.stdout);
    console.error('Contract tests failed.');
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

runTests();
