-- 016_harden_rls_deleted_tenants.sql
-- Hardens Row-Level Security (RLS) to reject access to operational tables when the tenant has been soft-deleted.

DROP POLICY IF EXISTS tenant_isolation ON tenants;
CREATE POLICY tenant_isolation ON tenants
  USING (id = NULLIF(current_setting('request.jwt.claims.tenant_id', true), '')::UUID AND deleted_at IS NULL);

DROP POLICY IF EXISTS tenant_isolation ON sync_inbox;
CREATE POLICY tenant_isolation ON sync_inbox
  USING (tenant_id = NULLIF(current_setting('request.jwt.claims.tenant_id', true), '')::UUID 
         AND EXISTS (SELECT 1 FROM tenants WHERE id = tenant_id AND deleted_at IS NULL));

DROP POLICY IF EXISTS tenant_isolation ON wapp_sessions;
CREATE POLICY tenant_isolation ON wapp_sessions
  USING (tenant_id = NULLIF(current_setting('request.jwt.claims.tenant_id', true), '')::UUID 
         AND EXISTS (SELECT 1 FROM tenants WHERE id = tenant_id AND deleted_at IS NULL));

DROP POLICY IF EXISTS tenant_isolation ON wapp_incoming;
CREATE POLICY tenant_isolation ON wapp_incoming
  USING (tenant_id = NULLIF(current_setting('request.jwt.claims.tenant_id', true), '')::UUID 
         AND EXISTS (SELECT 1 FROM tenants WHERE id = tenant_id AND deleted_at IS NULL));

DROP POLICY IF EXISTS tenant_isolation ON storage_objects;
CREATE POLICY tenant_isolation ON storage_objects
  USING (tenant_id = NULLIF(current_setting('request.jwt.claims.tenant_id', true), '')::UUID 
         AND EXISTS (SELECT 1 FROM tenants WHERE id = tenant_id AND deleted_at IS NULL));
