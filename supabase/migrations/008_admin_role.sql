-- 008_admin_role.sql
-- Creates the jarvis_admin role with BYPASSRLS for Ops Console operations.
-- Pre-creates the pgboss schema so grants succeed on first boot.
-- pg-boss uses CREATE SCHEMA IF NOT EXISTS internally, so pre-creation
-- is safe and eliminates the temporal dependency on worker start order.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'jarvis_admin') THEN
    CREATE ROLE jarvis_admin WITH NOLOGIN BYPASSRLS;
  END IF;
END
$$;

-- Public schema grants
GRANT USAGE ON SCHEMA public TO jarvis_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO jarvis_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO jarvis_admin;

-- Pre-create pgboss schema (pg-boss reuses it via CREATE SCHEMA IF NOT EXISTS)
CREATE SCHEMA IF NOT EXISTS pgboss;
GRANT USAGE ON SCHEMA pgboss TO jarvis_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA pgboss TO jarvis_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA pgboss GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO jarvis_admin;
