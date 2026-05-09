-- Add configurable Earned Leave accrual divisor on payroll_client_setup.
-- Engine previously hard-coded `worked_days / 20`. Default 20 preserves
-- existing behaviour for all clients; only clients that need a different
-- accrual policy (e.g. 1/22 or 1/25) need to update this value.

ALTER TABLE payroll_client_setup
  ADD COLUMN IF NOT EXISTS el_accrual_divisor numeric(6,2) NOT NULL DEFAULT 20;

COMMENT ON COLUMN payroll_client_setup.el_accrual_divisor IS
  'Number of worked days that earn 1 day of EL. Engine: EL_ACCRUED = WORKED_DAYS / el_accrual_divisor. Default 20 (1.5 days/month at 30 worked days).';
