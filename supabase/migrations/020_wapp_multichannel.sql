-- 020_wapp_multichannel.sql
-- Multi-channel WhatsApp support: N channels per tenant.
-- Ref: MASTER-SPEC §2 (I/O Channel Isolation), §7.1 (WhatsApp Worker), TASK-025
--
-- Creates a new entity `wapp_channels` that represents a logical WhatsApp connection
-- (a phone number with a name and an opaque config JSONB for plugin binding).
-- The existing `wapp_sessions` table becomes a child of `wapp_channels`, storing
-- only the cryptographic credentials for the Baileys socket.

-- ─── 1. Create wapp_channels table ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS wapp_channels (
  id            UUID PRIMARY KEY,   -- UUIDv7
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          TEXT NOT NULL DEFAULT 'WhatsApp Principal',
  phone_number  TEXT,
  status        TEXT NOT NULL DEFAULT 'disconnected'
    CHECK (status IN ('connected', 'disconnected', 'connecting', 'qr_pending', 'qr_expired', 'waiting_qr')),
  config        JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);

-- Protect audit timestamps
CREATE TRIGGER trg_wapp_channels_protect_created_at
  BEFORE UPDATE ON wapp_channels
  FOR EACH ROW
  EXECUTE FUNCTION prevent_created_at_update();

-- Prevent physical DELETE (soft-delete only)
CREATE OR REPLACE FUNCTION prevent_wapp_channels_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Physical DELETE on wapp_channels is prohibited. Use soft-delete (SET deleted_at = now()).';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_wapp_channels_prevent_delete
  BEFORE DELETE ON wapp_channels
  FOR EACH ROW
  EXECUTE FUNCTION prevent_wapp_channels_delete();

-- ─── 2. RLS on wapp_channels ────────────────────────────────────────────────

ALTER TABLE wapp_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON wapp_channels
  USING (tenant_id = current_setting('request.jwt.claims.tenant_id', true)::UUID);

-- ─── 3. Indexes ─────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_channels_tenant_deleted
  ON wapp_channels (tenant_id, deleted_at);

-- ─── 4. Add channel_id to wapp_sessions ─────────────────────────────────────
-- channel_id is nullable initially to allow the data migration step to populate it.

ALTER TABLE wapp_sessions
  ADD COLUMN IF NOT EXISTS channel_id UUID REFERENCES wapp_channels(id) ON DELETE CASCADE;

-- ─── 5. Data migration: Create a default channel for every existing session ─
-- For each distinct tenant_id in wapp_sessions (non-deleted), create a
-- "WhatsApp Principal" channel and link the existing session to it.

DO $$
DECLARE
  rec RECORD;
  new_channel_id UUID;
BEGIN
  FOR rec IN
    SELECT DISTINCT ON (tenant_id) id AS session_id, tenant_id, status, created_at
    FROM wapp_sessions
    WHERE deleted_at IS NULL
    ORDER BY tenant_id, created_at ASC
  LOOP
    -- Generate a deterministic-ish UUIDv7 for the channel using gen_random_uuid()
    -- (true UUIDv7 requires application layer; this is acceptable for migration seed data)
    new_channel_id := gen_random_uuid();

    INSERT INTO wapp_channels (id, tenant_id, name, status, created_at)
    VALUES (new_channel_id, rec.tenant_id, 'WhatsApp Principal', rec.status, rec.created_at);

    UPDATE wapp_sessions
    SET channel_id = new_channel_id
    WHERE id = rec.session_id;
  END LOOP;
END $$;

-- Also link any remaining orphan sessions (different sessions for the same tenant)
-- to the channel that was already created for that tenant.
UPDATE wapp_sessions s
SET channel_id = (
  SELECT c.id FROM wapp_channels c
  WHERE c.tenant_id = s.tenant_id AND c.deleted_at IS NULL
  LIMIT 1
)
WHERE s.channel_id IS NULL AND s.deleted_at IS NULL;

-- ─── 6. Update cascade_tenant_soft_delete to include wapp_channels ──────────

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
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─── 7. Update notify_wapp_status_change to include channel_id ──────────────

CREATE OR REPLACE FUNCTION notify_wapp_status_change()
RETURNS trigger AS $$
BEGIN
  -- Only notify if status or qr_code actually changed
  IF OLD.status IS DISTINCT FROM NEW.status 
     OR OLD.qr_code IS DISTINCT FROM NEW.qr_code THEN
    PERFORM pg_notify(
      'wapp_status_change',
      json_build_object(
        'tenant_id', NEW.tenant_id,
        'session_id', NEW.id,
        'channel_id', NEW.channel_id,
        'status', NEW.status,
        'qr_code', NEW.qr_code,
        'updated_at', NEW.updated_at
      )::text
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─── 8. Grant jarvis_admin access to wapp_channels ──────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON wapp_channels TO jarvis_admin;
