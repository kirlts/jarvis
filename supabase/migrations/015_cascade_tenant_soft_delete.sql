-- 015_cascade_tenant_soft_delete.sql
-- Automatically cascade soft-delete to active WhatsApp sessions, pg-boss jobs, and storage metadata when a tenant is soft-deleted.

CREATE OR REPLACE FUNCTION cascade_tenant_soft_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    -- 1. Mark WhatsApp sessions as deleted and request deactivation/disconnection
    UPDATE wapp_sessions
    SET deleted_at = NEW.deleted_at,
        action_pending = 'disconnect',
        status = 'disconnected',
        qr_code = NULL
    WHERE tenant_id = NEW.id AND deleted_at IS NULL;

    -- 2. Clean up/cancel pending pg-boss jobs for this tenant if the table exists
    IF EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'pgboss' AND table_name = 'job'
    ) THEN
      EXECUTE 'UPDATE pgboss.job SET state = ''cancelled'' WHERE data->>''tenantId'' = $1 AND state IN (''created'', ''retry'')'
      USING NEW.id::text;
    END IF;

    -- 3. Soft-delete storage_objects for this tenant
    UPDATE storage_objects
    SET deleted_at = NEW.deleted_at,
        status = 'deleted'
    WHERE tenant_id = NEW.id AND deleted_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_tenants_cascade_soft_delete
AFTER UPDATE OF deleted_at ON tenants
FOR EACH ROW
EXECUTE FUNCTION cascade_tenant_soft_delete();
