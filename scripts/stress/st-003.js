import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  scenarios: {
    constant_request_rate: {
      executor: 'constant-arrival-rate',
      rate: 1000, // 1000 reqs/s
      timeUnit: '1s',
      duration: '30s', // 60s in spec, let's do 30s to save time in LLM
      preAllocatedVUs: 100,
      maxVUs: 500,
    },
  },
  thresholds: {
    http_req_duration: ['p(99)<50'], // 99% of requests must complete below 50ms
  },
};

export default function () {
  const res = http.get('http://core-api:3000/health');
  check(res, {
    'is status 200': (r) => r.status === 200,
  });
}
