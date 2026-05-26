-- 010_ops_console_expansion.sql
-- Expansion for Ops Console (Phase 1)

-- 1. Alter tenants table
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'trial'));
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS config JSONB NOT NULL DEFAULT '{}';

-- 2. Create admin_audit_log table
CREATE TABLE IF NOT EXISTS admin_audit_log (
    id UUID PRIMARY KEY,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    resource TEXT NOT NULL,
    resource_id UUID,
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Protect admin_audit_log with RLS to satisfy Zero-Trust Data Layer (even though admin role bypasses RLS)
ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY deny_tenant_access_audit_log ON admin_audit_log FOR ALL USING (false);

-- 3. Create revoked_tokens table
CREATE TABLE IF NOT EXISTS revoked_tokens (
    jti UUID PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id),
    revoked_at TIMESTAMPTZ DEFAULT now()
);

-- Protect revoked_tokens with RLS
ALTER TABLE revoked_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY deny_tenant_access_revoked_tokens ON revoked_tokens FOR ALL USING (false);
