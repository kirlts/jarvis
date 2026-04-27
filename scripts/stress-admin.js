import http from 'k6/http';
import { check } from 'k6';

export const options = {
  vus: 50,
  duration: '10s',
};

const adminToken = __ENV.ADMIN_TOKEN;

export default function () {
  const adminParams = {
    headers: {
      'Host': 'api.jarvis.local',
      'Authorization': `Bearer ${adminToken}`,
      'X-Forwarded-For': `10.0.0.${__VU}`
    },
  };
  
  const tenantParams = {
    headers: {
      'Host': 'api.jarvis.local',
      'X-Forwarded-For': `10.0.0.${__VU}`
    },
  };

  const resAdmin = http.get('http://jarvis-caddy:80/admin/tenants', adminParams);
  
  if (__ITER === 0) {
    console.log(`[VU ${__VU}] Admin status: ${resAdmin.status}, body: ${resAdmin.body}`);
  }
  
  const resTenant = http.get('http://jarvis-caddy:80/health', tenantParams);
  
  check(resAdmin, {
    'admin status 200 or 429': (r) => {
      return r.status === 200 || r.status === 429;
    },
  });
  
  check(resTenant, {
    'tenant status 200': (r) => r.status === 200,
  });
}
