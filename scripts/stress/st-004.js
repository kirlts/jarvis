import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  scenarios: {
    pg_high_concurrency: {
      executor: 'constant-vus',
      vus: 500, // 500 concurrent VUs as specified in ST-004
      duration: '15s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'], // less than 1% errors
  },
};

export default function () {
  // Hit PG-backed admin endpoint using seed JWT authentication
  const url = 'http://core-api:3000/admin/tenants?page=1&limit=10';
  const params = {
    headers: {
      'Authorization': 'Bearer test',
      'Content-Type': 'application/json',
    },
  };

  const res = http.get(url, params);
  check(res, {
    'status is 200': (r) => r.status === 200,
    'has data array': (r) => {
      try {
        const body = JSON.parse(r.body);
        return Array.isArray(body.data);
      } catch (e) {
        return false;
      }
    }
  });
  sleep(0.1);
}
