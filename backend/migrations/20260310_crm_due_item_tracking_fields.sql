BEGIN;

ALTER TABLE compliance_returns
  ADD COLUMN IF NOT EXISTS crm_owner VARCHAR(150),
  ADD COLUMN IF NOT EXISTS crm_last_reminder_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS crm_last_note TEXT,
  ADD COLUMN IF NOT EXISTS crm_last_note_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_compliance_returns_crm_owner
  ON compliance_returns (crm_owner);

CREATE INDEX IF NOT EXISTS idx_compliance_returns_crm_last_reminder_at
  ON compliance_returns (crm_last_reminder_at);

COMMIT;
