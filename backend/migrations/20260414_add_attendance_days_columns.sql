-- Add attendance/days columns to payroll_run_employees
ALTER TABLE payroll_run_employees
  ADD COLUMN IF NOT EXISTS total_days   numeric(5,1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS days_present numeric(5,1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lop_days     numeric(5,1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ncp_days     numeric(5,1) NOT NULL DEFAULT 0;
