import Fastify from 'fastify';
import jwt from '@fastify/jwt';

const fastify = Fastify();

const privateKey = `-----BEGIN RSA PRIVATE KEY-----
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
G6aRAoGBALH3KxQoNf7uYV05v3Eok/U39/n7T0k1n1e0dG6Dk3q6P9V6zQyM10lV
WfP6E9m/NnZJgBqFz1n5yV8uB4tF3Y3O6XqM8oP4o4O9s8oZ9r2dJ/I7t0pW1nLz
4nJvVqB6+G6m2qG9Y/nQzO0K6r/b4b3b1e8eZk/XWvLw9Wz6E4U1
-----END RSA PRIVATE KEY-----`;

const publicKey = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAkQ/s4htokfmaO6OtSiVl
v7U5wbWtdCUPDQZEpVocx0alH06UDrvPR7bSvdJmS7/FlKk/phZzkufTVTd+TxaH
RaT8TUmkgZ9cRFFFZctq8dwQIZxNND0oyIxY8qTyAaoo5l0yYlXH2pL7yTLuO2Vz
Odij4AJwUKo8cSdbb6a7hUdPjy0aD7XL3lV3nY37z7N5GSOEXjQAdnUmGdU2glUg
t2uVvaUra9XpBaWIkC3cMgjXz0bTavBaDOvWnc+0EoY5kA1kvi2g022FEAsBcOza
R0L4GD/aqVOX39cQPE3bcrQGL4okV1mxqg7snv1ebEK8nUSdMaOnnKO2N7WQTA2L
GQIDAQAB
-----END PUBLIC KEY-----`;

fastify.register(jwt, {
  secret: { public: publicKey, private: privateKey },
  sign: { algorithm: 'RS256', expiresIn: '1h' },
});

fastify.ready(err => {
  if (err) throw err;
  const token = fastify.jwt.sign({ sub: 'admin', role: 'super_admin' });
  console.log(token);
});
