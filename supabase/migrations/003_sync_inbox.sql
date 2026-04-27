-- 003_sync_inbox.sql
-- Inbox pattern: raw client payloads land here before transactional processing.
-- Constraint: §4.4 UUIDv7, §4.5 RLS, §2 Inbox Pattern.

CREATE TABLE IF NOT EXISTS sync_inbox (
  id          UUID PRIMARY KEY,             -- UUIDv7 from client (CLNT.FN.01)
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  payload     JSONB NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);

-- Index for pg-boss worker consumption (ordered by UUIDv7 timestamp)
CREATE INDEX IF NOT EXISTS idx_sync_inbox_pending
  ON sync_inbox (created_at ASC)
  WHERE status = 'pending';

-- RLS enforcement (DB.CR.01)
ALTER TABLE sync_inbox ENABLE ROW LEVEL SECURITY;

-- RLS policy: only rows matching the session tenant_id are visible
CREATE POLICY tenant_isolation ON sync_inbox
  USING (tenant_id = current_setting('request.jwt.claims.tenant_id', true)::UUID);

-- Prevent created_at mutation (DB.CR.03)
CREATE TRIGGER trg_sync_inbox_protect_created_at
  BEFORE UPDATE ON sync_inbox
  FOR EACH ROW
  EXECUTE FUNCTION prevent_created_at_update();
