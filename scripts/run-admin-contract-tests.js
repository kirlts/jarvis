// Contract Test Runner: Admin API (Specmatic)
// Validates that the Fastify implementation strictly complies with
// specs/admin-api.yaml using real HTTP requests (no mocks for HTTP shape).
//
// The mock database returns ONLY the fields declared in the OpenAPI spec
// schemas. Specmatic enforces strict R2003 (unknown property) compliance.
//
// Run: node scripts/run-admin-contract-tests.js

import Fastify from 'fastify';
import { registerAdminRoutes } from '../src/features/admin/routes.js';
import pool from '../src/db.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Fixtures conforming exactly to OpenAPI schema definitions
const MOCK_TENANT = {
  id: '01926d8c-5a00-7000-8000-000000000001',
  name: 'contract-tenant',
  created_at: '2026-04-27T00:00:00.000Z',
  deleted_at: null,
};

const MOCK_TENANT_CREATED = {
  id: '01926d8c-5a00-7000-8000-000000000001',
  name: 'contract-tenant',
  created_at: '2026-04-27T00:00:00.000Z',
};

const MOCK_JOB = {
  id: '01926d8c-5a00-7000-8000-000000000002',
  name: 'sync-inbox-process',
  state: 'completed',
  data: {},
  created_on: '2026-04-27T00:00:00.000Z',
  started_on: null,
  completed_on: null,
};

const MOCK_WAPP_SESSION = {
  tenant_id: '01926d8c-5a00-7000-8000-000000000001',
  status: 'connected',
  updated_at: '2026-04-27T00:00:00.000Z',
};

async function runTests() {
  const app = Fastify({
    ajv: {
      customOptions: { removeAdditional: false, allErrors: true },
    },
  });

  // Mock admin JWT auth (Specmatic can't generate RS256 tokens)
  app.decorate('adminAuthenticate', async (request, reply) => {
    if (!request.headers.authorization) {
      return reply.status(401).send({ error: 'Unauthorized Admin' });
    }
    request.user = { role: 'super_admin' };
  });

  // Mock database — returns ONLY spec-conformant shapes
  const mockClient = {
    query: async (q, params) => {
      if (typeof q === 'string' && q.includes('COUNT')) {
        return { rows: [{ total: 1 }] };
      }
      if (typeof q === 'string' && q.includes('INSERT')) {
        return {
          rows: [{ ...MOCK_TENANT_CREATED, id: params?.[0] || MOCK_TENANT_CREATED.id, name: params?.[1] || MOCK_TENANT_CREATED.name }],
          rowCount: 1,
        };
      }
      if (typeof q === 'string' && q.includes('UPDATE') && q.includes('SET deleted_at')) {
        // Soft-delete (DELETE endpoint): UPDATE SET deleted_at = now() WHERE id = $1
        return { rows: [{ id: params?.[0] || MOCK_TENANT.id }], rowCount: 1 };
      }
      if (typeof q === 'string' && q.includes('UPDATE')) {
        // PATCH — params: [$1=name, $2=id]
        return {
          rows: [{ ...MOCK_TENANT, id: params?.[1] || MOCK_TENANT.id, name: params?.[0] || MOCK_TENANT.name }],
          rowCount: 1,
        };
      }
      if (typeof q === 'string' && q.includes('wapp_sessions')) {
        return { rows: [MOCK_WAPP_SESSION] };
      }
      if (typeof q === 'string' && q.includes('pgboss.job')) {
        return { rows: [MOCK_JOB] };
      }
      if (typeof q === 'string' && q.includes('SELECT') && q.includes('tenants')) {
        return { rows: [MOCK_TENANT] };
      }
      return { rows: [] };
    },
    release: () => {},
  };

  pool.connect = async () => mockClient;

  await app.register(registerAdminRoutes, { prefix: '/admin' });

  const port = 3006;
  await app.listen({ port, host: '0.0.0.0' });

  try {
    console.log(`Contract test server running on port ${port}...`);
    const { stdout, stderr } = await execAsync(
      `npx specmatic test specs/admin-api.yaml --host 127.0.0.1 --port ${port}`
    );
    console.log(stdout);
    if (stderr) console.error(stderr);

    // Parse results to check for failures
    const match = stdout.match(/Tests run: (\d+), Successes: (\d+), Failures: (\d+)/);
    if (match) {
      const [, total, successes, failures] = match.map(Number);
      console.log(`\nSpecmatic: ${successes}/${total} passed, ${failures} failed.`);
      if (failures > 0) {
        console.error('Contract tests have failures.');
        process.exitCode = 1;
      } else {
        console.log('Admin API contract tests passed.');
      }
    }
  } catch (err) {
    if (err.stdout) console.log(err.stdout);
    if (err.stderr) console.error(err.stderr);
    console.error('Admin API contract tests failed.');
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

runTests();
