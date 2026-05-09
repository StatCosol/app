-- Remove duplicate compliance_tasks rows (keep the one with the lowest id)
-- and add a unique constraint to prevent future duplicates.

-- Step 1: Delete duplicate rows, keeping the earliest (lowest id) per group
DELETE FROM compliance_tasks
WHERE id NOT IN (
  SELECT MIN(id)
  FROM compliance_tasks
  GROUP BY client_id, branch_id, compliance_id, period_year, period_month, frequency
);

-- Step 2: Add unique constraint to prevent future duplicates
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_CT_CLIENT_BRANCH_COMPLIANCE_PERIOD"
  ON compliance_tasks (client_id, branch_id, compliance_id, period_year, period_month, frequency);
