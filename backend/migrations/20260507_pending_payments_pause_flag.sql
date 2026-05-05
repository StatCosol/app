-- Add per-row pause flag for daily auto-reminders.
ALTER TABLE pending_payment_followups
  ADD COLUMN IF NOT EXISTS reminders_paused BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_pending_payments_status_paused
  ON pending_payment_followups (status, reminders_paused);
