-- Add approval audit trail columns to compliance_tasks
ALTER TABLE compliance_tasks
  ADD COLUMN IF NOT EXISTS approved_by_user_id UUID NULL REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS approved_at       TIMESTAMPTZ NULL;

-- Index for querying by approver
CREATE INDEX IF NOT EXISTS idx_ct_approved_by ON compliance_tasks (approved_by_user_id)
  WHERE approved_by_user_id IS NOT NULL;

-- Reset script-seeded APPROVED tasks that have no real approval workflow
-- These were inserted/updated by tmp-seed-tasks.js and tmp-fix-march.js
UPDATE compliance_tasks
   SET status = 'PENDING',
       remarks = NULL
 WHERE status = 'APPROVED'
   AND approved_by_user_id IS NULL
   AND approved_at IS NULL;
