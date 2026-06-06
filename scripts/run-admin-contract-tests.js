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
  data: { output: { zipKey: 'mock-zip-key' } },
  created_on: '2026-04-27T00:00:00.000Z',
  started_on: null,
  completed_on: null,
};

const MOCK_WAPP_SESSION = {
  tenant_id: '01926d8c-5a00-7000-8000-000000000001',
  status: 'connected',
  updated_at: '2026-04-27T00:00:00.000Z',
};

const MOCK_WAPP_CHANNEL = {
  id: '01926d8c-5a00-7000-8000-000000000003',
  tenant_id: '01926d8c-5a00-7000-8000-000000000001',
  name: 'contract-channel',
  phone_number: '1234567890',
  status: 'connected',
  config: { processor: 'antigravity' },
  created_at: '2026-04-27T00:00:00.000Z',
  session_id: '01926d8c-5a00-7000-8000-000000000004',
  session_status: 'connected',
  qr_code: null,
  qr_generated_at: null,
  qr_scanned_at: null,
  qr_scanned_by: null,
  session_updated_at: '2026-04-27T00:00:00.000Z',
};

const MOCK_AUDIT_ENTRY = {
  id: 1,
  actor: 'admin',
  action: 'create',
  resource: 'tenant',
  resource_id: '01926d8c-5a00-7000-8000-000000000001',
  details: { name: 'contract-tenant' },
  created_at: '2026-04-27T00:00:00.000Z',
};

const MOCK_STORAGE_OBJECT = {
  id: '01926d8c-5a00-7000-8000-000000000005',
  tenant_id: '01926d8c-5a00-7000-8000-000000000001',
  file_name: 'test.jpg',
  mime_type: 'image/jpeg',
  size_bytes: 1024,
  s3_key: 'tenants/1/test.jpg',
  storage_key: 'tenants/1/test.jpg',
  sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  status: 'uploaded',
  created_at: '2026-04-27T00:00:00.000Z',
  updated_at: '2026-04-27T00:00:00.000Z',
  deleted_at: null,
};

const MOCK_STORAGE_SUMMARY = {
  active_files: 5,
  pending_files: 1,
  deleted_files: 2,
  active_bytes: 10240,
  tenants_with_files: 3,
};

const MOCK_SYSTEM_CONFIG = {
  key: 'some-key',
  value: { someKey: 'some-value' },
  updated_at: '2026-04-27T00:00:00.000Z',
  updated_by: 'admin',
};

const MOCK_REVOKED_TOKEN = {
  jti: '01926d8c-5a00-7000-8000-000000000006',
  revoked_at: '2026-04-27T00:00:00.000Z',
  revoked_by: 'admin',
  expires_at: '2026-04-27T01:00:00.000Z',
};

const MOCK_SYNC_INBOX = {
  id: '01926d8c-5a00-7000-8000-000000000007',
  tenant_id: '01926d8c-5a00-7000-8000-000000000001',
  channel_id: '01926d8c-5a00-7000-8000-000000000003',
  sender_jid: '123456789@s.whatsapp.net',
  message_id: 'mock-msg-id',
  message_type: 'text',
  text_content: 'hello',
  media_s3_key: null,
  processed_at: '2026-04-27T00:00:00.000Z',
  created_at: '2026-04-27T00:00:00.000Z',
};

async function runTests() {
  process.env.NODE_ENV = 'development';
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    const urlStr = String(url);
    if (urlStr.includes('/minio/health') || urlStr.includes('/ready')) {
      return { ok: true, status: 200, json: async () => ({}) };
    }
    if (urlStr.includes('/loki/api') || urlStr.includes('/query') || urlStr.includes('/label')) {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        json: async () => ({ status: 'success', data: { result: [], resultType: 'streams' } })
      };
    }
    return { ok: false, status: 503 };
  };

  const app = Fastify({
    ajv: {
      customOptions: { removeAdditional: false, allErrors: true },
    },
  });

  app.boss = {
    send: async () => '01926d8c-5a00-7000-8000-000000000099'
  };

  app.decorate('jwt', {
    sign: async () => 'mock-jwt-token',
    admin: {
      sign: async () => 'mock-admin-jwt-token'
    }
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
      const qStr = typeof q === 'string' ? q : q.text || '';
      if (qStr.includes('COUNT')) {
        return { rows: [{ total: 1 }] };
      }
      if (qStr.includes('INSERT')) {
        if (qStr.includes('wapp_channels')) {
          return { rows: [MOCK_WAPP_CHANNEL], rowCount: 1 };
        }
        return {
          rows: [{ ...MOCK_TENANT_CREATED, id: params?.[0] || MOCK_TENANT_CREATED.id, name: params?.[1] || MOCK_TENANT_CREATED.name }],
          rowCount: 1,
        };
      }
      if (qStr.includes('DELETE')) {
        return { rows: [{ id: params?.[0] || MOCK_TENANT.id }], rowCount: 1 };
      }
      if (qStr.includes('UPDATE') && qStr.includes('SET deleted_at')) {
        // Soft-delete (DELETE endpoint): UPDATE SET deleted_at = now() WHERE id = $1
        return { rows: [{ id: params?.[0] || MOCK_TENANT.id }], rowCount: 1 };
      }
      if (qStr.includes('UPDATE')) {
        if (qStr.includes('wapp_channels')) {
          return { rows: [MOCK_WAPP_CHANNEL], rowCount: 1 };
        }
        if (qStr.includes('system_config')) {
          return { rows: [MOCK_SYSTEM_CONFIG], rowCount: 1 };
        }
        // PATCH — params: [$1=name, $2=id]
        return {
          rows: [{ ...MOCK_TENANT, id: params?.[1] || MOCK_TENANT.id, name: params?.[0] || MOCK_TENANT.name }],
          rowCount: 1,
        };
      }
      if (qStr.includes('wapp_channels')) {
        return { rows: [MOCK_WAPP_CHANNEL], rowCount: 1 };
      }
      if (qStr.includes('wapp_sessions')) {
        return { rows: [MOCK_WAPP_SESSION], rowCount: 1 };
      }
      if (qStr.includes('admin_audit_log')) {
        return { rows: [MOCK_AUDIT_ENTRY], rowCount: 1 };
      }
      if (qStr.includes('storage_objects')) {
        if (qStr.includes('active_files')) {
          return { rows: [MOCK_STORAGE_SUMMARY], rowCount: 1 };
        }
        return { rows: [MOCK_STORAGE_OBJECT], rowCount: 1 };
      }
      if (qStr.includes('system_config')) {
        return { rows: [MOCK_SYSTEM_CONFIG], rowCount: 1 };
      }
      if (qStr.includes('revoked_tokens')) {
        return { rows: [MOCK_REVOKED_TOKEN], rowCount: 1 };
      }
      if (qStr.includes('sync_inbox')) {
        return { rows: [MOCK_SYNC_INBOX], rowCount: 1 };
      }
      if (qStr.includes('pgboss.job')) {
        return { rows: [MOCK_JOB], rowCount: 1 };
      }
      if (qStr.includes('SELECT') && qStr.includes('tenants')) {
        return { rows: [MOCK_TENANT], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
    release: () => {},
  };

  pool.connect = async () => mockClient;

  await app.register(registerAdminRoutes, { prefix: '/admin' });

  const port = 3006;
  await app.listen({ port, host: '0.0.0.0' });

  try {
    console.log(`Contract test server running on port ${port}...`);
    const env = {
      ...process.env,
      adminBearerAuth: 'mock-admin-token'
    };

    const { stdout, stderr } = await execAsync(
      `npx specmatic test specs/admin-api.yaml --host 127.0.0.1 --port ${port} --filter "!(PATH='/admin/whatsapp/status/stream')"`,
      { env }
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
    global.fetch = originalFetch;
    await app.close();
  }
}

runTests();
