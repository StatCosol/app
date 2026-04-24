-- Add attendance approval workflow columns
-- Allows Branch/Client users to approve employee self-marked attendance
-- Only approved records flow to payroll

BEGIN;

ALTER TABLE attendance_records
  ADD COLUMN IF NOT EXISTS approval_status      VARCHAR(20) DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS approved_by_user_id  UUID,
  ADD COLUMN IF NOT EXISTS approved_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_reason     TEXT;

CREATE INDEX IF NOT EXISTS idx_att_approval_status ON attendance_records (approval_status);
CREATE INDEX IF NOT EXISTS idx_att_approved_by     ON attendance_records (approved_by_user_id);

-- Backfill: mark all existing manually-entered (non-self-marked) records as APPROVED
UPDATE attendance_records
SET approval_status = 'APPROVED'
WHERE self_marked = false
  AND approval_status = 'PENDING';

COMMIT;
