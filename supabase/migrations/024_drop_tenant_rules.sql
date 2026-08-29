-- 024_drop_tenant_rules.sql
-- Purge: tenant_rules system replaced by tenant_flows (EPIC-004 Motor de Flujos)
-- The tenant_rules table and its associated activity_logs.rule_id FK column
-- are eliminated. All routing is now managed by the flow-engine via tenant_flows.

DROP TABLE IF EXISTS tenant_rules CASCADE;

-- Remove the rule_id foreign key column from activity_logs
ALTER TABLE activity_logs DROP COLUMN IF EXISTS rule_id;
