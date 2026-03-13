-- Add fields needed by Auditor Report Builder persistence
BEGIN;

ALTER TABLE audit_reports
  ADD COLUMN IF NOT EXISTS scope TEXT,
  ADD COLUMN IF NOT EXISTS methodology TEXT,
  ADD COLUMN IF NOT EXISTS selected_observation_ids JSONB,
  ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMPTZ;

COMMIT;

