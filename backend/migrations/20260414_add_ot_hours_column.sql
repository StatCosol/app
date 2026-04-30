-- Add OT hours column to payroll_run_employees
ALTER TABLE payroll_run_employees
  ADD COLUMN IF NOT EXISTS ot_hours NUMERIC(6,2) NOT NULL DEFAULT 0;
