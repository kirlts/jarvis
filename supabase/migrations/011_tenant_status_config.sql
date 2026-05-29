-- Migration 011: Tenant Status & Config Columns
-- Purpose: Enable tenant lifecycle management and per-tenant configuration.
-- Ref: Feature Inventory §B.5, §B.7, TASK-020

-- Status column: controls tenant lifecycle state
ALTER TABLE tenants
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
    CONSTRAINT tenants_status_check CHECK (status IN ('active', 'suspended', 'trial'));

-- Config column: per-tenant JSON configuration (token TTL, feature flags, etc.)
ALTER TABLE tenants
    ADD COLUMN IF NOT EXISTS config JSONB NOT NULL DEFAULT '{}';

-- Index for status filtering
CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants (status) WHERE deleted_at IS NULL;
