-- Contractor attendance/muster payroll generation fields.
-- Idempotent: safe to run repeatedly.

BEGIN;

ALTER TABLE contractor_employees
  ADD COLUMN IF NOT EXISTS employee_code varchar(80) NULL;

CREATE INDEX IF NOT EXISTS idx_ce_employee_code
  ON contractor_employees(client_id, contractor_user_id, employee_code)
  WHERE employee_code IS NOT NULL;

ALTER TABLE contractor_mcd_computations
  ADD COLUMN IF NOT EXISTS minimum_daily_wage numeric(12,2) NULL,
  ADD COLUMN IF NOT EXISTS employee_daily_wage numeric(12,2) NULL,
  ADD COLUMN IF NOT EXISTS payable_daily_wage numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS esi_employer_contribution numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lwf_employee_deduction numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lwf_employer_contribution numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_employer_contribution numeric(12,2) NOT NULL DEFAULT 0;

UPDATE contractor_mcd_computations
   SET payable_daily_wage = COALESCE(quotation_daily_wage, mcd_daily_wage, 0)
 WHERE payable_daily_wage = 0;

CREATE INDEX IF NOT EXISTS idx_cmcd_branch_period
  ON contractor_mcd_computations(branch_id, period_month);

COMMIT;
