-- Migration: System config key-value store
-- Purpose: Persistent admin-editable configuration (Bloque 6)
-- Guarded by admin realm — no RLS needed.

CREATE TABLE IF NOT EXISTS system_config (
  key    TEXT        PRIMARY KEY,
  value  JSONB       NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  TEXT        NOT NULL DEFAULT 'system'
);

-- Seed with defaults
INSERT INTO system_config (key, value, updated_by) VALUES
  ('maintenance_mode', '{"enabled": false, "message": ""}', 'migration'),
  ('rate_limits', '{"global_rpm": 1000, "per_tenant_rpm": 100}', 'migration'),
  ('retention', '{"audit_days": 90, "storage_orphan_days": 30, "job_history_days": 7}', 'migration'),
  ('features', '{"whatsapp_enabled": true, "sync_enabled": true}', 'migration')
ON CONFLICT (key) DO NOTHING;
