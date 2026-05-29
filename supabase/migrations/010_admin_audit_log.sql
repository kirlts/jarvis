-- Migration 010: Admin Audit Log
-- Purpose: Traceable record of every mutating admin operation.
-- Ref: Feature Inventory §H.1, TASK-020

CREATE TABLE IF NOT EXISTS admin_audit_log (
    id UUID PRIMARY KEY,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    resource TEXT NOT NULL,
    resource_id UUID,
    details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for common query patterns: filter by action, resource, or date range
CREATE INDEX IF NOT EXISTS idx_audit_action ON admin_audit_log (action);
CREATE INDEX IF NOT EXISTS idx_audit_resource ON admin_audit_log (resource);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON admin_audit_log (created_at DESC);

-- Grant access to jarvis_admin role
GRANT SELECT, INSERT ON admin_audit_log TO jarvis_admin;

-- No RLS: this table is exclusively accessed via the admin realm.
-- No DELETE grant: audit log is append-only by design.
