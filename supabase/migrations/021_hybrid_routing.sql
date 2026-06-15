-- 021_hybrid_routing.sql
-- Migration for Hybrid Routing and Plugins Catalog
-- Ref: [EPIC-003], [TASK-028]

-- 1. Drop processor column from wapp_sessions if it exists
ALTER TABLE wapp_sessions DROP COLUMN IF EXISTS processor;

-- 2. Create plugins catalog table
CREATE TABLE IF NOT EXISTS plugins (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  display_name TEXT NOT NULL,
  description  TEXT,
  fields       JSONB NOT NULL DEFAULT '[]',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_plugins_fields_array CHECK (jsonb_typeof(fields) = 'array')
);

-- Enable RLS on plugins and create a policy allowing anyone to read it
ALTER TABLE plugins ENABLE ROW LEVEL SECURITY;

CREATE POLICY select_public ON plugins
  FOR SELECT USING (true);

-- 3. Create tenant_rules table
CREATE TABLE IF NOT EXISTS tenant_rules (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  channel_id    UUID REFERENCES wapp_channels(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  trigger_type  TEXT NOT NULL CHECK (trigger_type IN ('all', 'regex', 'media_type')),
  trigger_value TEXT,
  actions       JSONB NOT NULL DEFAULT '[]',
  priority      INTEGER NOT NULL DEFAULT 0,
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ,
  CONSTRAINT chk_tenant_rules_actions_array CHECK (jsonb_typeof(actions) = 'array')
);

-- Protect created_at on tenant_rules
CREATE TRIGGER trg_tenant_rules_protect_created_at
  BEFORE UPDATE ON tenant_rules
  FOR EACH ROW
  EXECUTE FUNCTION prevent_created_at_update();

-- Enable RLS on tenant_rules
ALTER TABLE tenant_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON tenant_rules
  USING (tenant_id = current_setting('request.jwt.claims.tenant_id', true)::UUID);

-- Create composite index on tenant_rules for priority sorting performance
CREATE INDEX IF NOT EXISTS idx_tenant_rules_tenant_priority
  ON tenant_rules (tenant_id, priority DESC) WHERE deleted_at IS NULL;

-- 4. Create activity_logs table
CREATE TABLE IF NOT EXISTS activity_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  channel_id  UUID REFERENCES wapp_channels(id) ON DELETE SET NULL,
  rule_id     UUID REFERENCES tenant_rules(id) ON DELETE SET NULL,
  event_type  TEXT NOT NULL,
  description TEXT NOT NULL,
  metadata    JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on activity_logs
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON activity_logs
  USING (tenant_id = current_setting('request.jwt.claims.tenant_id', true)::UUID);

-- Create index for quick activity queries
CREATE INDEX IF NOT EXISTS idx_activity_logs_tenant_created
  ON activity_logs (tenant_id, created_at DESC);

-- 5. Update notify_tenant_activity function to recognize activity_logs and add its trigger
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
  ELSIF TG_TABLE_NAME IN ('wapp_incoming', 'storage_objects', 'sync_inbox', 'activity_logs') THEN
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

CREATE OR REPLACE TRIGGER trg_activity_logs_activity
AFTER INSERT ON activity_logs
FOR EACH ROW
EXECUTE FUNCTION notify_tenant_activity();

-- 6. Grant permissions to jarvis_admin
GRANT SELECT, INSERT, UPDATE, DELETE ON plugins TO jarvis_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_rules TO jarvis_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON activity_logs TO jarvis_admin;

-- 7. Seed global catalog of plugins
INSERT INTO plugins (id, name, display_name, description, fields)
VALUES
  ('antigravity', 'Antigravity Core', 'Antigravity CLI Agent', 'AI Developer Command Executer Agent', '[]'),
  ('whisper', 'Whisper STT', 'Whisper Transcription STT', 'OpenAI Speech-to-Text Transducer', '[]'),
  ('dinowiki', 'DinoWiki', 'DinoWiki Knowledge Agent', 'Semantic Knowledge Base MCP Service', '[]')
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  fields = EXCLUDED.fields;
