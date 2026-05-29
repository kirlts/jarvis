-- Migration 017: Real-time WhatsApp session status notifications via PG NOTIFY
-- Fires a NOTIFY event on the 'wapp_status_change' channel whenever
-- the status or qr_code of a wapp_sessions row changes.
-- The admin SSE endpoint (GET /admin/whatsapp/status/stream) listens on this channel.

CREATE OR REPLACE FUNCTION notify_wapp_status_change()
RETURNS trigger AS $$
BEGIN
  -- Only notify if status or qr_code actually changed
  IF OLD.status IS DISTINCT FROM NEW.status 
     OR OLD.qr_code IS DISTINCT FROM NEW.qr_code THEN
    PERFORM pg_notify(
      'wapp_status_change',
      json_build_object(
        'tenant_id', NEW.tenant_id,
        'session_id', NEW.id,
        'status', NEW.status,
        'qr_code', NEW.qr_code,
        'updated_at', NEW.updated_at
      )::text
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop if exists for idempotency
DROP TRIGGER IF EXISTS trg_wapp_status_notify ON wapp_sessions;

CREATE TRIGGER trg_wapp_status_notify
  AFTER UPDATE ON wapp_sessions
  FOR EACH ROW
  EXECUTE FUNCTION notify_wapp_status_change();
