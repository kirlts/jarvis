-- Migration 018: Update wapp_sessions status check constraint
-- Drop old inline status check constraint and replace with expanded list
-- to support 'waiting_qr', 'qr_expired', and 'connecting' statuses.

ALTER TABLE wapp_sessions
  DROP CONSTRAINT IF EXISTS wapp_sessions_status_check;

ALTER TABLE wapp_sessions
  ADD CONSTRAINT wapp_sessions_status_check
  CHECK (status IN ('connected', 'disconnected', 'connecting', 'qr_pending', 'qr_expired', 'waiting_qr'));
