-- Free-text "type / reason" notes for the catch-all OTHER_EARNINGS and
-- OTHER_DEDUCTIONS amounts entered from the Preview Employees grid. Shown
-- on the payslip alongside the amount so payees know what the line is for.
ALTER TABLE payroll_run_employees
  ADD COLUMN IF NOT EXISTS other_earnings_note   text NULL,
  ADD COLUMN IF NOT EXISTS other_deductions_note text NULL;

COMMENT ON COLUMN payroll_run_employees.other_earnings_note IS
  'Free-text label for OTHER_EARNINGS amount (e.g. "Festival bonus", "Arrears Apr"). Shown on payslip.';
COMMENT ON COLUMN payroll_run_employees.other_deductions_note IS
  'Free-text label for OTHER_DEDUCTIONS amount (e.g. "Loan recovery", "Advance"). Shown on payslip.';
