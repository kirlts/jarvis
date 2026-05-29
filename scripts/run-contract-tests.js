import { spawn } from 'child_process';
import jwt from 'jsonwebtoken';

async function run() {
  const host = 'localhost';
  const port = 3000;
  
  // 1. Generate Tenant Token
  const tenantSecret = process.env.JWT_SECRET || 'sandbox_super_secret_key_12345';
  const tenantToken = jwt.sign(
    { tenant_id: '01905555-5555-7555-8555-555555555556', sub: 'tenant-client' },
    tenantSecret,
    { expiresIn: '1h' }
  );
  
  // 2. Fetch Admin Token via dev-login
  let adminToken = '';
  try {
    const resp = await fetch(`http://${host}:${port}/admin/dev-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    if (resp.ok) {
      const data = await resp.json();
      adminToken = data.token;
      console.log('Successfully fetched admin token via dev-login');
    } else {
      console.warn('Failed to fetch admin token via dev-login, status:', resp.status);
    }
  } catch (err) {
    console.warn('Unable to reach dev-login endpoint. Is the server running? error:', err.message);
  }

  // Fallback signature of admin token if dev-login fails/unavailable
  if (!adminToken) {
    console.log('Generating fallback Admin JWT signed with sandbox key...');
    // Public/private key from docker-compose.yml
    const privateKey = process.env.ADMIN_JWT_PRIVATE_KEY || `-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEAkQ/s4htokfmaO6OtSiVlv7U5wbWtdCUPDQZEpVocx0alH06U
DrvPR7bSvdJmS7/FlKk/phZzkufTVTd+TxaHRaT8TUmkgZ9cRFFFZctq8dwQIZxN
ND0oyIxY8qTyAaoo5l0yYlXH2pL7yTLuO2VzOdij4AJwUKo8cSdbb6a7hUdPjy0a
D7XL3lV3nY37z7N5GSOEXjQAdnUmGdU2glUgt2uVvaUra9XpBaWIkC3cMgjXz0bT
avBaDOvWnc+0EoY5kA1kvi2g022FEAsBcOzaR0L4GD/aqVOX39cQPE3bcrQGL4ok
V1mxqg7snv1ebEK8nUSdMaOnnKO2N7WQTA2LGQIDAQABAoIBABfBwOzCylxlwWGV
C7NB7qj32A6mX1LPIujiJunhmSb1peM7rjm/flHjWh4mUASF0qjnEvpzYNglSVIC
dZgkO2EnhP5vWha0b5rsqG3kY45amPW4MFimz4AQpByQ8OVe5bXce3zpSYK9Yajw
w11M3xMRLL1qCNTdHGr3pBzj9H/+D4vwG0Rc2PWXBL30l8nPhV1HrtbwUlruvmSF
+QvKLxZb91masNxFe5sO2hvvz3A663IKrtg8kCzKOOkfYsjWfyOc8ReiMGHoxSWU
kMsuiZjIHQEmCMZIOOcCR9VauK5EsTY2NkD8kfPW1HIU7nBcMDeKltxMnWFcHCyv
Fai8FJECgYEAy+mTM2hVL99SUm7AFukhdC6Ow3TZkLbjiCuBWzbEEE5VQdm/Vjf+
vAod4Pm8oZcKr0dmmuQv7Ox8rYKtjstnXif/sbWyuxg3ihPSzI4g5pf/8HqsMA9E
laoq2DQ7tIoPQdvR9M3vgll9LuNFUQs8nWGc75gEMYe20/5HSsM0h60CgYEAth33
CXE1Hr2WcfxftJ2BXdcRu8TCze64oWgtUpVDSWcthLmPYh58LzxM1RoIrZfoS0iY
JM2Ou8HaVVGagNzm/zqjU/JWyRtgjec2jUlHiF5K1ZejB1p4W2jObQnk7ao9HrQL
2KPxKbMnSMpnEDv3oVmwWb2CIZ+ijJPxEOXybp0CgYEAqW6IcEO13NRL+9CobaEC
uh3hZAkYqkU85C16C4eC/CWKc+/xKzvVvvsM/p2kHgR5zVCfsf3+0Hdj1Wxqt+bN
GhBURp46R3mE1IdKNcu3DMOp13Cm2DwnedBuTz1/irDYopl7aFUhOQcQnEAdnYyf
rgmos/B1M46X3KhBJp7ya/UCgYBilnojXGubRpro/ex5hEKCIGlzMqMahD7i8diH
OlKArCBSF3ntbf9gOs6FFmDYSMHx70ydr8GzFtAxG8n+NJfAV2gPi8M7f1yXtTEs
7xyQUCtG0Z3p3yoEogoNsSuDFYOc2W8ISkfFgTylBR0iBrSZXko/an3F4ftHCteX
hEPnaQKBgG/Lg2GQ379l2AKcYhfaSdQ2Wd33uvrR4VsuFROxt+1pnQfe2QYCBGLz
OUXv9sIX3S3H9xHZgPcLZDdIg/97YHivlZbMQBTTw8s+c88kboZJeFvfYkSmvWac
LW++M3xZmSqcGUhEM/B8JYnljvRxlrEmuDQMs6u0VvnHv/ZMuD2p
-----END RSA PRIVATE KEY-----`;
    
    adminToken = jwt.sign(
      { role: 'super_admin', sub: 'admin-console' },
      privateKey,
      { algorithm: 'RS256', expiresIn: '1h' }
    );
  }

  console.log('Running Specmatic contract tests with dynamic authentication overlays...');
  
  const env = {
    ...process.env,
    // Specmatic security scheme injection
    adminBearerAuth: adminToken,
    bearerAuth: tenantToken
  };

  const specmatic = spawn('npx', [
    'specmatic', 'test',
    '--host', host,
    '--port', String(port),
    '--filter', "!(PATH='/admin/whatsapp/status/stream')",
    'specs/admin-api.yaml',
    'specs/tenant-api.yaml'
  ], { env, stdio: 'inherit' });

  specmatic.on('close', (code) => {
    process.exit(code || 0);
  });
}

run().catch((err) => {
  console.error('Fatal error running specmatic tests:', err);
  process.exit(1);
});
