-- Add status tracking columns to payroll_inputs
ALTER TABLE payroll_inputs
  ADD COLUMN IF NOT EXISTS status_updated_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS status_updated_by_user_id UUID;
