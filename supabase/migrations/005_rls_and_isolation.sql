-- 005_rls_and_isolation.sql
-- Completing TASK-005: PostgreSQL RLS & Isolation

-- 1. Enable RLS on tenants
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON tenants;
CREATE POLICY tenant_isolation ON tenants
  USING (id = NULLIF(current_setting('request.jwt.claims.tenant_id', true), '')::UUID);

-- Fix previous policies that had the cast issue
DROP POLICY IF EXISTS tenant_isolation ON sync_inbox;
CREATE POLICY tenant_isolation ON sync_inbox
  USING (tenant_id = NULLIF(current_setting('request.jwt.claims.tenant_id', true), '')::UUID);

DROP POLICY IF EXISTS tenant_isolation ON wapp_sessions;
CREATE POLICY tenant_isolation ON wapp_sessions
  USING (tenant_id = NULLIF(current_setting('request.jwt.claims.tenant_id', true), '')::UUID);

DROP POLICY IF EXISTS tenant_isolation ON wapp_incoming;
CREATE POLICY tenant_isolation ON wapp_incoming
  USING (tenant_id = NULLIF(current_setting('request.jwt.claims.tenant_id', true), '')::UUID);

-- 2. Reject JSONB > 10MB in transactional tables
ALTER TABLE sync_inbox ADD CONSTRAINT chk_sync_inbox_payload_size CHECK (pg_column_size(payload) <= 10485760);
ALTER TABLE wapp_sessions ADD CONSTRAINT chk_wapp_sessions_credentials_size CHECK (pg_column_size(credentials) <= 10485760);
ALTER TABLE wapp_incoming ADD CONSTRAINT chk_wapp_incoming_message_size CHECK (pg_column_size(message) <= 10485760);

-- 3. Soft-Delete (deleted_at) trigger protection for all operational tables
ALTER TABLE sync_inbox ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE wapp_sessions ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE wapp_incoming ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION prevent_hard_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Hard deletion is prohibited. Use Soft-Delete pattern (UPDATE deleted_at).';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tenants_prevent_delete BEFORE DELETE ON tenants FOR EACH ROW EXECUTE FUNCTION prevent_hard_delete();
CREATE TRIGGER trg_sync_inbox_prevent_delete BEFORE DELETE ON sync_inbox FOR EACH ROW EXECUTE FUNCTION prevent_hard_delete();
CREATE TRIGGER trg_wapp_sessions_prevent_delete BEFORE DELETE ON wapp_sessions FOR EACH ROW EXECUTE FUNCTION prevent_hard_delete();
CREATE TRIGGER trg_wapp_incoming_prevent_delete BEFORE DELETE ON wapp_incoming FOR EACH ROW EXECUTE FUNCTION prevent_hard_delete();
