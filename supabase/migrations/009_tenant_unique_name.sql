-- 009_tenant_unique_name.sql
-- TASK-019: Adds UNIQUE constraint on tenants.name for 409 Conflict handling.
-- Constraint: MASTER-SPEC §6 – unique constraint en nombre de tenant.

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_name_unique
  ON tenants (name)
  WHERE deleted_at IS NULL;
