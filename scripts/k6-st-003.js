import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 50,
  duration: '30s',
  thresholds: {
    http_req_duration: ['p(99)<50'], // 99% of requests must complete below 50ms
  },
};

export default function () {
  // Target the sync inbox endpoint which triggers the core worker
  const payload = JSON.stringify({
    channel_id: 'test-channel',
    payload: { text: 'test regex match /ayuda' },
    metadata: {}
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      // Note: we'd need a valid token here if auth is strictly enforced during load test
    },
  };

  const res = http.post('http://127.0.0.1:3005/api/v1/sync/inbox', payload, params);
  
  check(res, {
    'status is 202': (r) => r.status === 202,
  });
  
  sleep(1);
}
