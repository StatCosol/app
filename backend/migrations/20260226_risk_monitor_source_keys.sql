-- Risk Monitor dedup columns
-- Adds source_key to notifications and escalations for idempotent system notifications

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS source_key TEXT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_notifications_source
  ON notifications (client_id, source_key)
  WHERE source_key IS NOT NULL;

ALTER TABLE escalations ADD COLUMN IF NOT EXISTS source_key TEXT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_escalations_source
  ON escalations (client_id, source_key)
  WHERE source_key IS NOT NULL;
