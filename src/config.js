// Jarvis – Environment Configuration
// Single source of truth for all service connection strings.
// Constraint: §4.5 Pooler port 6543 mandatory for workers.

const config = {
  server: {
    host: process.env.HOST || '0.0.0.0',
    port: parseInt(process.env.PORT || '3000', 10),
  },

  // Direct PG connection (migrations, admin)
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres_sandbox',
    database: process.env.DB_NAME || 'jarvis',
  },

  // Pooler connection (application traffic via Supavisor/PgBouncer)
  // Constraint: §4.5 – Transaction pooling, port 6543
  pooler: {
    host: process.env.POOLER_HOST || 'localhost',
    port: parseInt(process.env.POOLER_PORT || '6543', 10),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres_sandbox',
    database: process.env.DB_NAME || 'jarvis',
  },

  // S3-compatible storage (MinIO in sandbox)
  storage: {
    endpoint: process.env.STORAGE_ENDPOINT || 'http://localhost:9000',
    accessKey: process.env.STORAGE_ACCESS_KEY || 'minioadmin',
    secretKey: process.env.STORAGE_SECRET_KEY || 'minioadmin_sandbox',
    bucket: process.env.STORAGE_BUCKET || 'jarvis-files',
  },

  // pg-boss configuration
  // CRITICAL: Boss MUST connect directly to PG (port 5432), NOT through
  // the transaction pooler. pg-boss relies on advisory locks and
  // SELECT FOR UPDATE SKIP LOCKED which require session-level continuity.
  // Transaction-mode PgBouncer multiplexes connections between transactions,
  // breaking these locking semantics.
  boss: {
    connectionString: process.env.BOSS_DATABASE_URL ||
      `postgresql://postgres:postgres_sandbox@localhost:5432/jarvis`,
  },
};

export default config;
