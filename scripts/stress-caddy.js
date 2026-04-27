import http from 'k6/http';
import { check } from 'k6';

export const options = {
  vus: 50,
  duration: '10s',
};

export default function () {
  const params = {
    headers: {
      'Host': 'api.jarvis.local',
    },
  };
  const res = http.get('http://jarvis-caddy:80/health', params);
  check(res, {
    'is status 200': (r) => r.status === 200,
  });
}
