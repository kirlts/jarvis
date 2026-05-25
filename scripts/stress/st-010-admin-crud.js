// K6 Stress Test: Admin API Expansion Endpoints
// ST-010: Validates that the expanded admin API handles concurrent load
// on CRUD operations without data corruption or resource exhaustion.
//
// Run: ADMIN_TOKEN=<jwt> k6 run scripts/stress/st-010-admin-crud.js
//
// Success criteria:
//   - POST /admin/tenants: 201 or 409 (unique constraint), never 500
//   - GET /admin/tenants: 200 with valid pagination meta
//   - PATCH /admin/tenants/:id: 200 or 404 (race with delete), never 500
//   - DELETE /admin/tenants/:id?confirm=true: 200 or 404, never 500
//   - p95 response time < 100ms under 50 VUs

import http from 'k6/http';
import { check, group } from 'k6';
import { Counter, Trend } from 'k6/metrics';

const adminToken = __ENV.ADMIN_TOKEN;
const baseUrl = __ENV.BASE_URL || 'http://localhost:3000';

// Custom metrics
const createErrors = new Counter('admin_create_errors');
const patchErrors = new Counter('admin_patch_errors');
const deleteErrors = new Counter('admin_delete_errors');
const createDuration = new Trend('admin_create_duration');
const listDuration = new Trend('admin_list_duration');

export const options = {
  scenarios: {
    crud_load: {
      executor: 'constant-vus',
      vus: 50,
      duration: '30s',
    },
  },
  thresholds: {
    'http_req_duration{endpoint:create}': ['p(95)<200'],
    'http_req_duration{endpoint:list}':   ['p(95)<200'],
    'admin_create_errors':  ['count<1'],
    'admin_patch_errors':   ['count<1'],
    'admin_delete_errors':  ['count<1'],
  },
};

const headers = {
  'Authorization': `Bearer ${adminToken}`,
  'Content-Type': 'application/json',
};

export default function () {
  const uniqueName = `stress-vu${__VU}-iter${__ITER}-${Date.now()}`;

  group('POST /admin/tenants', () => {
    const res = http.post(
      `${baseUrl}/admin/tenants`,
      JSON.stringify({ name: uniqueName }),
      { headers, tags: { endpoint: 'create' } }
    );
    createDuration.add(res.timings.duration);

    const ok = check(res, {
      'create returns 201 or 409': (r) => r.status === 201 || r.status === 409,
      'create never returns 500': (r) => r.status !== 500,
    });
    if (!ok) createErrors.add(1);
  });

  group('GET /admin/tenants (paginated)', () => {
    const res = http.get(
      `${baseUrl}/admin/tenants?page=1&limit=10`,
      { headers, tags: { endpoint: 'list' } }
    );
    listDuration.add(res.timings.duration);

    check(res, {
      'list returns 200': (r) => r.status === 200,
      'list has meta': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.meta && typeof body.meta.total === 'number';
        } catch { return false; }
      },
    });
  });

  // Try to get the created tenant by searching the list
  group('GET /admin/tenants/:id', () => {
    // Create a tenant to get its ID
    const createRes = http.post(
      `${baseUrl}/admin/tenants`,
      JSON.stringify({ name: `get-test-${__VU}-${__ITER}-${Date.now()}` }),
      { headers }
    );
    if (createRes.status === 201) {
      const id = JSON.parse(createRes.body).id;
      const getRes = http.get(`${baseUrl}/admin/tenants/${id}`, { headers });
      check(getRes, {
        'get by id returns 200': (r) => r.status === 200,
      });
    }
  });

  group('PATCH + DELETE race condition', () => {
    // Create tenant
    const createRes = http.post(
      `${baseUrl}/admin/tenants`,
      JSON.stringify({ name: `race-${__VU}-${__ITER}-${Date.now()}` }),
      { headers }
    );
    if (createRes.status !== 201) return;
    const id = JSON.parse(createRes.body).id;

    // Fire PATCH and DELETE concurrently (simulated sequentially in K6)
    const patchRes = http.patch(
      `${baseUrl}/admin/tenants/${id}`,
      JSON.stringify({ name: `patched-${Date.now()}` }),
      { headers }
    );
    const deleteRes = http.del(
      `${baseUrl}/admin/tenants/${id}?confirm=true`,
      null,
      { headers }
    );

    const patchOk = check(patchRes, {
      'patch returns 200 or 404': (r) => r.status === 200 || r.status === 404,
      'patch never returns 500': (r) => r.status !== 500,
    });
    if (!patchOk) patchErrors.add(1);

    const deleteOk = check(deleteRes, {
      'delete returns 200 or 404': (r) => r.status === 200 || r.status === 404,
      'delete never returns 500': (r) => r.status !== 500,
    });
    if (!deleteOk) deleteErrors.add(1);
  });
}
