-- 023_flow_execution_state.sql
-- EPIC-004 / TASK-036: Forward-only idempotency state for flow engine
--
-- Tracks which nodes in a flow execution have already been completed.
-- On retry (pg-boss), the flow engine skips these nodes to prevent
-- duplicate side effects (messages sent, SQL executed).
-- Rows are deleted on successful flow completion.

CREATE TABLE IF NOT EXISTS flow_execution_state (
  execution_id TEXT PRIMARY KEY,
  flow_id      UUID NOT NULL,
  tenant_id    UUID NOT NULL,
  completed_node_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for cleanup queries and per-tenant lookups
CREATE INDEX IF NOT EXISTS idx_flow_exec_state_tenant
  ON flow_execution_state (tenant_id);

CREATE INDEX IF NOT EXISTS idx_flow_exec_state_flow
  ON flow_execution_state (flow_id);

-- RLS: each tenant can only see their own execution state
ALTER TABLE flow_execution_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "flow_execution_state_tenant_isolation" ON flow_execution_state
  FOR ALL
  USING (tenant_id::text = current_setting('request.jwt.claims.tenant_id', true));

-- Grant access to jarvis_admin (BYPASSRLS)
GRANT SELECT, INSERT, UPDATE, DELETE ON flow_execution_state TO jarvis_admin;
