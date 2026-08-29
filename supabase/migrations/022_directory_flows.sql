-- 022_directory_flows.sql
-- Migration for Agnostic Contact Directory + Flow Engine
-- Ref: [EPIC-004], [TASK-033], MASTER-SPEC §2 (Directorio Agnóstico), §2 (Motor de Flujos)
-- Decisions: UD-037 (Contacts decoupled from channels), UD-038 (React Flow pipelines), UD-039 (CloudEvents)

-- ─── 1. Create tenant_contacts table ────────────────────────────────────────
-- Central identity entity: contacts belong to the tenant, NOT to a channel.
-- metadata JSONB allows dynamic fields per tenant without SQL migrations.

CREATE TABLE IF NOT EXISTS tenant_contacts (
  id            UUID PRIMARY KEY,   -- UUIDv7 (generated application-side)
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  display_name  TEXT NOT NULL,
  metadata      JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);

-- Protect audit timestamps
CREATE TRIGGER trg_tenant_contacts_protect_created_at
  BEFORE UPDATE ON tenant_contacts
  FOR EACH ROW
  EXECUTE FUNCTION prevent_created_at_update();

-- Prevent physical DELETE (soft-delete only)
CREATE OR REPLACE FUNCTION prevent_tenant_contacts_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Physical DELETE on tenant_contacts is prohibited. Use soft-delete (SET deleted_at = now()).';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tenant_contacts_prevent_delete
  BEFORE DELETE ON tenant_contacts
  FOR EACH ROW
  EXECUTE FUNCTION prevent_tenant_contacts_delete();

-- ─── 2. RLS on tenant_contacts ──────────────────────────────────────────────

ALTER TABLE tenant_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON tenant_contacts
  USING (tenant_id = current_setting('request.jwt.claims.tenant_id', true)::UUID);

-- ─── 3. Index: composite leading with tenant_id ─────────────────────────────

CREATE INDEX IF NOT EXISTS idx_tenant_contacts_tenant_deleted
  ON tenant_contacts (tenant_id, deleted_at);

-- ─── 4. Create contact_addresses table ──────────────────────────────────────
-- Bridge table: links a contact to N addresses in N channels.
-- Unique constraint prevents duplicate addresses per tenant+channel_type.

CREATE TABLE IF NOT EXISTS contact_addresses (
  id            UUID PRIMARY KEY,   -- UUIDv7
  contact_id    UUID NOT NULL REFERENCES tenant_contacts(id) ON DELETE CASCADE,
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  channel_type  TEXT NOT NULL,      -- 'whatsapp', 'email', 'telegram', etc.
  address       TEXT NOT NULL,      -- phone number, email, etc.
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_contact_address_tenant UNIQUE (tenant_id, channel_type, address)
);

-- Protect audit timestamps
CREATE TRIGGER trg_contact_addresses_protect_created_at
  BEFORE UPDATE ON contact_addresses
  FOR EACH ROW
  EXECUTE FUNCTION prevent_created_at_update();

-- ─── 5. RLS on contact_addresses ────────────────────────────────────────────

ALTER TABLE contact_addresses ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON contact_addresses
  USING (tenant_id = current_setting('request.jwt.claims.tenant_id', true)::UUID);

-- ─── 6. Index on contact_addresses ──────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_contact_addresses_tenant_channel
  ON contact_addresses (tenant_id, channel_type);

CREATE INDEX IF NOT EXISTS idx_contact_addresses_contact
  ON contact_addresses (contact_id);

-- ─── 7. Create tenant_flows table ───────────────────────────────────────────
-- Each flow is a directed graph serialized as JSONB, executed by flow-engine worker.
-- trigger_type is channel-agnostic: 4 types per UD-038.

CREATE TABLE IF NOT EXISTS tenant_flows (
  id              UUID PRIMARY KEY,   -- UUIDv7
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  trigger_type    TEXT NOT NULL CHECK (trigger_type IN ('inbound_channel', 'scheduled', 'webhook', 'manual')),
  trigger_config  JSONB NOT NULL DEFAULT '{}',
  graph           JSONB NOT NULL DEFAULT '{"nodes":[],"edges":[]}',
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ,
  -- Unique partial: only one active flow with same name per tenant
  CONSTRAINT uq_tenant_flow_name UNIQUE (tenant_id, name) -- partial WHERE handled below
);

-- Drop the simple unique and replace with partial unique index
ALTER TABLE tenant_flows DROP CONSTRAINT IF EXISTS uq_tenant_flow_name;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_flows_unique_name
  ON tenant_flows (tenant_id, name)
  WHERE deleted_at IS NULL;

-- Protect audit timestamps
CREATE TRIGGER trg_tenant_flows_protect_created_at
  BEFORE UPDATE ON tenant_flows
  FOR EACH ROW
  EXECUTE FUNCTION prevent_created_at_update();

-- Prevent physical DELETE (soft-delete only)
CREATE OR REPLACE FUNCTION prevent_tenant_flows_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Physical DELETE on tenant_flows is prohibited. Use soft-delete (SET deleted_at = now()).';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tenant_flows_prevent_delete
  BEFORE DELETE ON tenant_flows
  FOR EACH ROW
  EXECUTE FUNCTION prevent_tenant_flows_delete();

-- ─── 8. RLS on tenant_flows ────────────────────────────────────────────────

ALTER TABLE tenant_flows ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON tenant_flows
  USING (tenant_id = current_setting('request.jwt.claims.tenant_id', true)::UUID);

-- ─── 9. Index on tenant_flows ───────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_tenant_flows_tenant_active
  ON tenant_flows (tenant_id, is_active)
  WHERE deleted_at IS NULL;

-- ─── 10. Update cascade_tenant_soft_delete to include contacts and flows ────

CREATE OR REPLACE FUNCTION cascade_tenant_soft_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    -- 1. Mark WhatsApp channels as deleted
    UPDATE wapp_channels
    SET deleted_at = NEW.deleted_at
    WHERE tenant_id = NEW.id AND deleted_at IS NULL;

    -- 2. Mark WhatsApp sessions as deleted and request deactivation/disconnection
    UPDATE wapp_sessions
    SET deleted_at = NEW.deleted_at,
        action_pending = 'disconnect',
        status = 'disconnected',
        qr_code = NULL
    WHERE tenant_id = NEW.id AND deleted_at IS NULL;

    -- 3. Clean up/cancel pending pg-boss jobs for this tenant if the table exists
    IF EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'pgboss' AND table_name = 'job'
    ) THEN
      EXECUTE 'UPDATE pgboss.job SET state = ''cancelled'' WHERE data->>''tenantId'' = $1 AND state IN (''created'', ''retry'')'
      USING NEW.id::text;
    END IF;

    -- 4. Soft-delete storage_objects for this tenant
    UPDATE storage_objects
    SET deleted_at = NEW.deleted_at,
        status = 'deleted'
    WHERE tenant_id = NEW.id AND deleted_at IS NULL;

    -- 5. Soft-delete contacts for this tenant (EPIC-004)
    UPDATE tenant_contacts
    SET deleted_at = NEW.deleted_at
    WHERE tenant_id = NEW.id AND deleted_at IS NULL;

    -- 6. Soft-delete flows for this tenant (EPIC-004)
    UPDATE tenant_flows
    SET deleted_at = NEW.deleted_at
    WHERE tenant_id = NEW.id AND deleted_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─── 11. Grant permissions to jarvis_admin ──────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_contacts TO jarvis_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON contact_addresses TO jarvis_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_flows TO jarvis_admin;

-- ─── 12. Add visibility, direction, fallback_message fields to wapp_channels ─
-- These are stored in the config JSONB column. No schema change needed,
-- but we document the expected structure:
-- config: {
--   visibility: 'public' | 'private',     -- default: 'public'
--   direction: 'bidirectional' | 'inbound_only' | 'outbound_only',  -- default: 'bidirectional'
--   fallback_message: 'text...',           -- message for unknown contacts in private channels
--   ...existing plugin config...
-- }
-- No ALTER needed since config is already JSONB with DEFAULT '{}' (migration 020).

-- ─── 13. Update notify_tenant_activity for contacts and flows ───────────────

CREATE OR REPLACE FUNCTION notify_tenant_activity()
RETURNS trigger AS $$
DECLARE
  tenant_id_val text;
BEGIN
  -- Extract tenant_id from the relevant column/field
  IF TG_TABLE_NAME IN ('job', 'job_common') AND TG_TABLE_SCHEMA = 'pgboss' THEN
    tenant_id_val := NEW.data->>'tenantId';
    IF tenant_id_val IS NULL THEN
      tenant_id_val := NEW.data->>'tenant_id';
    END IF;
  ELSIF TG_TABLE_NAME IN ('wapp_incoming', 'storage_objects', 'sync_inbox', 'activity_logs', 'tenant_contacts', 'tenant_flows') THEN
    tenant_id_val := NEW.tenant_id::text;
  END IF;

  IF tenant_id_val IS NOT NULL THEN
    PERFORM pg_notify(
      'tenant_activity',
      json_build_object(
        'tenant_id', tenant_id_val,
        'table', TG_TABLE_NAME,
        'operation', TG_OP
      )::text
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Notify triggers for new tables
CREATE OR REPLACE TRIGGER trg_tenant_contacts_activity
AFTER INSERT OR UPDATE ON tenant_contacts
FOR EACH ROW
EXECUTE FUNCTION notify_tenant_activity();

CREATE OR REPLACE TRIGGER trg_tenant_flows_activity
AFTER INSERT OR UPDATE ON tenant_flows
FOR EACH ROW
EXECUTE FUNCTION notify_tenant_activity();
