-- 006_storage_objects.sql
-- Table to track S3 files and detect orphans (STOR.IN.02.LLM)

CREATE TABLE IF NOT EXISTS storage_objects (
  id UUID PRIMARY KEY, -- UUIDv7
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  file_name TEXT NOT NULL,
  size BIGINT NOT NULL,
  mime_type TEXT NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'uploaded', 'deleted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

ALTER TABLE storage_objects ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON storage_objects
  USING (tenant_id = NULLIF(current_setting('request.jwt.claims.tenant_id', true), '')::UUID);

CREATE TRIGGER trg_storage_objects_prevent_delete
  BEFORE DELETE ON storage_objects
  FOR EACH ROW
  EXECUTE FUNCTION prevent_hard_delete();
