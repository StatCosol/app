-- Add created_by_role to compliance_returns so we can track
-- whether each filing was created by CRM, CLIENT, or BRANCH user
ALTER TABLE compliance_returns
  ADD COLUMN IF NOT EXISTS created_by_role VARCHAR(20) DEFAULT NULL;

-- Backfill: filings without a branch are likely CRM-created;
-- filings with a branch default to CLIENT
UPDATE compliance_returns
SET created_by_role = CASE
  WHEN branch_id IS NULL THEN 'CRM'
  ELSE 'CLIENT'
END
WHERE created_by_role IS NULL;
