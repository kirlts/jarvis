-- Migration: Add sync_inbox to the tenant_activity NOTIFY pipeline.
-- Without this, the ops-console detail view does not auto-refresh
-- when new incoming messages arrive via WhatsApp.

-- 1. Update the shared notify function to recognize sync_inbox
CREATE OR REPLACE FUNCTION notify_tenant_activity()
RETURNS trigger AS $$
DECLARE
  tenant_id_val text;
BEGIN
  -- Extract tenant_id from the relevant column/field
  -- job_common is the physical partition of pgboss.job; both names must match.
  IF TG_TABLE_NAME IN ('job', 'job_common') AND TG_TABLE_SCHEMA = 'pgboss' THEN
    tenant_id_val := NEW.data->>'tenantId';
    IF tenant_id_val IS NULL THEN
      tenant_id_val := NEW.data->>'tenant_id';
    END IF;
  ELSIF TG_TABLE_NAME IN ('wapp_incoming', 'storage_objects', 'sync_inbox') THEN
    tenant_id_val := NEW.tenant_id::text;
  END IF;

  IF tenant_id_val IS NOT NULL THEN
    PERFORM pg_notify(
      'tenant_activity',
      json_build_object(
        'tenant_id', tenant_id_val,
        'table', TG_TABLE_NAME,
        'operation', TG_OP
      )::text
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Create the trigger on sync_inbox
CREATE OR REPLACE TRIGGER trg_sync_inbox_activity
AFTER INSERT ON sync_inbox
FOR EACH ROW
EXECUTE FUNCTION notify_tenant_activity();
