-- 014_whatsapp_session_qr.sql
-- Adds columns to track active QR codes, audit trails, and background session actions.

ALTER TABLE wapp_sessions
  ADD COLUMN IF NOT EXISTS qr_code TEXT NULL,
  ADD COLUMN IF NOT EXISTS qr_generated_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS qr_scanned_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS qr_scanned_by TEXT NULL,
  ADD COLUMN IF NOT EXISTS action_pending TEXT NULL CHECK (action_pending IN ('reconnect', 'disconnect'));
