-- Add richer lifecycle support for payroll F&F:
-- 1) settlement_breakup on payroll_fnf
-- 2) payroll_fnf_events history table

BEGIN;

ALTER TABLE payroll_fnf
  ADD COLUMN IF NOT EXISTS settlement_breakup JSONB;

CREATE TABLE IF NOT EXISTS payroll_fnf_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fnf_id            UUID NOT NULL REFERENCES payroll_fnf(id) ON DELETE CASCADE,
  status_from       VARCHAR(30),
  status_to         VARCHAR(30) NOT NULL,
  action            VARCHAR(40) NOT NULL DEFAULT 'STATUS_UPDATE',
  remarks           TEXT,
  settlement_amount DECIMAL(14,2),
  performed_by      UUID REFERENCES users(id),
  metadata          JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fnf_events_fnf_id ON payroll_fnf_events(fnf_id);
CREATE INDEX IF NOT EXISTS idx_fnf_events_created ON payroll_fnf_events(created_at DESC);

COMMIT;
