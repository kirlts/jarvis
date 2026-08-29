-- 025_add_sha256_to_storage_objects.sql
-- Add sha256 column for deduplication

ALTER TABLE storage_objects ADD COLUMN sha256 TEXT;

-- Re-create the unique constraint (if required, but spec says:
-- "Unique constraint parcial (tenant_id, sha256) WHERE sha256 IS NOT NULL AND deleted_at IS NULL")
CREATE UNIQUE INDEX storage_objects_tenant_sha256_idx ON storage_objects (tenant_id, sha256) WHERE sha256 IS NOT NULL AND deleted_at IS NULL;
