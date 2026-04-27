-- 004_wapp_state.sql
-- WhatsApp Baileys session persistence.
-- Constraint: §4.3 Keys stored in PG JSONB, fs prohibited.

CREATE TABLE IF NOT EXISTS wapp_sessions (
  id          UUID PRIMARY KEY,   -- UUIDv7
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  credentials JSONB NOT NULL,     -- Baileys AuthState (WAPP.FN.01)
  status      TEXT NOT NULL DEFAULT 'disconnected'
    CHECK (status IN ('connected', 'disconnected', 'qr_pending')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE wapp_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON wapp_sessions
  USING (tenant_id = current_setting('request.jwt.claims.tenant_id', true)::UUID);

CREATE TABLE IF NOT EXISTS wapp_incoming (
  id          UUID PRIMARY KEY,   -- UUIDv7
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  sender      TEXT NOT NULL,
  message     JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE wapp_incoming ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON wapp_incoming
  USING (tenant_id = current_setting('request.jwt.claims.tenant_id', true)::UUID);

-- Protect audit timestamps
CREATE TRIGGER trg_wapp_sessions_protect_created_at
  BEFORE UPDATE ON wapp_sessions
  FOR EACH ROW
  EXECUTE FUNCTION prevent_created_at_update();

CREATE TRIGGER trg_wapp_incoming_protect_created_at
  BEFORE UPDATE ON wapp_incoming
  FOR EACH ROW
  EXECUTE FUNCTION prevent_created_at_update();
