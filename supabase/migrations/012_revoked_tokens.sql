-- Migration 012: Revoked Tokens
-- Purpose: Token revocation list for tenant JWTs.
-- Ref: Feature Inventory §K.2, TASK-020

CREATE TABLE IF NOT EXISTS revoked_tokens (
    jti UUID PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    revoked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_by TEXT NOT NULL
);

-- Index for fast lookup during JWT verification
CREATE INDEX IF NOT EXISTS idx_revoked_tokens_tenant ON revoked_tokens (tenant_id);

-- Grant access to jarvis_admin role
GRANT SELECT, INSERT ON revoked_tokens TO jarvis_admin;

-- No DELETE grant: revocations are permanent records.
