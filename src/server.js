// Jarvis – Fastify Server Bootstrap
// Constraint: §2 Modular Monolith (VSA), §4.1 PostgreSQL only.

import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import cors from '@fastify/cors';
import config from './config.js';
import pool from './db.js';
import { registerJwt } from './middleware/jwt.js';
import { registerEventLoopMonitor } from './middleware/event-loop-monitor.js';
import { registerBossPublisher } from './middleware/boss-publisher.js';
import { registerSyncInbox } from './features/sync-inbox/routes.js';
import { registerStorage } from './features/storage/routes.js';
import { registerAdminRoutes } from './features/admin/routes.js';

async function buildApp() {
  const app = Fastify({
    trustProxy: true,
    logger: {
      transport: process.env.LOKI_HOST
        ? {
            targets: [
              {
                target: 'pino-pretty',
                options: { colorize: true, ignore: 'pid,hostname' },
                level: 'info',
              },
              {
                target: 'pino-loki',
                options: {
                  batching: true,
                  interval: 5,
                  host: process.env.LOKI_HOST,
                  labels: { service: 'jarvis-core-api' },
                },
                level: 'info',
              },
            ],
          }
        : {
            target: 'pino-pretty',
            options: { colorize: true, ignore: 'pid,hostname' },
          },
    },
    // Constraint: CLNT.CR.03 – reject payloads with undeclared fields
    ajv: {
      customOptions: {
        removeAdditional: false,
        allErrors: true,
      },
    },
    // Constraint: CORE.RS.01 – reject oversized payloads (50MB)
    bodyLimit: 50 * 1024 * 1024,
    // Constraint: CORE.RS.03 – drop idle connections (Slowloris)
    connectionTimeout: 10_000,
    keepAliveTimeout: 5_000,
  });

  // ── Security ──────────────────────────────────────────────────────
  await app.register(helmet);
  await app.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  });
  await app.register(sensible);

  // Constraint: CORE.IN.02, CORE.FN.03 – JWT authentication
  await registerJwt(app);

  // Constraint: CLNT.RS.01 – Rate limiter (429 at 100 req/s)
  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 second',
  });

  // ── Observability ─────────────────────────────────────────────────
  // Constraint: CORE.AV.02 – event loop lag monitoring
  await registerEventLoopMonitor(app);

  // ── Health Check (CORE.AV.01) ─────────────────────────────────────
  // Excluded from auth: diagnostic endpoints must remain accessible
  app.get('/health', { config: { rateLimit: false } }, async (_request, reply) => {
    try {
      await pool.query('SELECT 1');
      return { status: 'ok', db: 'connected' };
    } catch (err) {
      app.log.error({ err }, 'Health check: DB unreachable');
      return reply.status(503).send({
        status: 'degraded',
        db: 'disconnected',
        message: err.message,
      });
    }
  });

  // ── Feature Slices (VSA) ──────────────────────────────────────────
  await registerBossPublisher(app);
  await app.register(registerSyncInbox, { prefix: '/api/v1' });
  await app.register(registerStorage, { prefix: '/api/v1' });
  await app.register(registerAdminRoutes, { prefix: '/admin' });

  // ── Global Error Handler (CORE.IN.03) ─────────────────────────────
  app.setErrorHandler((error, _request, reply) => {
    // PostgreSQL FK constraint violation — referenced entity doesn't exist
    if (error.code === '23503') {
      app.log.warn({ constraint: error.constraint, detail: error.detail }, 'FK constraint violation');
      return reply.status(422).send({
        error: 'Unprocessable Entity',
        message: `Referenced entity does not exist: ${error.constraint || 'foreign key violation'}`,
      });
    }
    // PostgreSQL invalid enum value — invalid input for enum type
    if (error.code === '22P02') {
      app.log.warn({ message: error.message }, 'Invalid enum value');
      return reply.status(400).send({
        error: 'Bad Request',
        message: error.message,
      });
    }
    // PostgreSQL numeric overflow — value out of range for type
    if (error.code === '22003') {
      app.log.warn({ message: error.message }, 'Numeric value out of range');
      return reply.status(400).send({
        error: 'Bad Request',
        message: error.message,
      });
    }
    // PostgreSQL unique violation — duplicate key
    if (error.code === '23505') {
      app.log.warn({ constraint: error.constraint, detail: error.detail }, 'Unique constraint violation');
      return reply.status(409).send({
        error: 'Conflict',
        message: `Duplicate value: ${error.constraint || 'unique violation'}`,
      });
    }
    // PostgreSQL not-null violation — missing required field
    if (error.code === '23502') {
      app.log.warn({ column: error.column, table: error.table }, 'Not-null constraint violation');
      return reply.status(400).send({
        error: 'Bad Request',
        message: `Missing required field: ${error.column || 'unknown'}`,
      });
    }
    app.log.error(error);
    // Never leak stack traces to client
    reply.status(error.statusCode || 500).send({
      error: error.statusCode ? error.message : 'Internal Server Error',
    });
  });

  return app;
}

async function start() {
  const app = await buildApp();

  try {
    await app.listen({
      host: config.server.host,
      port: config.server.port,
    });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();

export { buildApp };
