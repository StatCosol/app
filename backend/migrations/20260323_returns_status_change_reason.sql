-- Add status_change_reason column to track why a status was changed
ALTER TABLE compliance_returns
  ADD COLUMN IF NOT EXISTS status_change_reason TEXT;
