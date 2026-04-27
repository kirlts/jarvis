-- 001_extensions.sql
-- Enable required PostgreSQL extensions for Jarvis core.
-- Constraint: §4.1 PostgreSQL is the single database.
--
-- Note: pg_cron is available in Supabase managed PG (production)
-- but not in vanilla postgres:17-alpine (sandbox).
-- Garbage collection of archived jobs handled via application-level
-- scheduling in sandbox; pg_cron in production.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
