// JWT Authentication Middleware
// Constraint: CORE.IN.02 – anonymous requests rejected with 401
// Constraint: CORE.FN.03 – expired JWT rejected without DB latency
//
// Phase 1 (sandbox): symmetric HS256 with static secret.
// Phase 2 (production): rotate via JWT_SECRET env var.

import jwt from '@fastify/jwt';

/**
 * Registers @fastify/jwt and adds an `authenticate` decorator.
 * Routes that require auth call `{ onRequest: [app.authenticate] }`.
 *
 * @param {import('fastify').FastifyInstance} app
 */
export async function registerJwt(app) {
  // Tenant JWT (HS256)
  await app.register(jwt, {
    secret: process.env.JWT_SECRET || 'jarvis-sandbox-secret-change-in-production',
    sign: { expiresIn: '1h' },
  });

  // Admin JWT (RS256)
  const adminPublicKey = process.env.ADMIN_JWT_PUBLIC_KEY || `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAnzyis1ZckQGzwwL5KzcU
...
-----END PUBLIC KEY-----`; // Placeholder for sandbox if not provided

  const adminPrivateKey = process.env.ADMIN_JWT_PRIVATE_KEY || `-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEAkQ/s4htokfmaO6OtSiVlv7U5wbWtdCUPDQZEpVocx0alH06U
...
-----END RSA PRIVATE KEY-----`;

  await app.register(jwt, {
    secret: {
      public: adminPublicKey,
      private: adminPrivateKey
    },
    namespace: 'admin',
    sign: { algorithm: 'RS256', expiresIn: '1h' },
    verify: { algorithms: ['RS256'] },
  });

  // Decorate with reusable authentication hook for tenants
  app.decorate('authenticate', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch (err) {
      // CORE.FN.03: expired or malformed JWT → 401 without DB roundtrip
      reply.status(401).send({ error: 'Unauthorized' });
    }
  });

  // Decorate with reusable authentication hook for admins
  app.decorate('adminAuthenticate', async (request, reply) => {
    try {
      await request.adminJwtVerify();
    } catch (err) {
      reply.status(401).send({ error: 'Unauthorized Admin' });
    }
  });
}
