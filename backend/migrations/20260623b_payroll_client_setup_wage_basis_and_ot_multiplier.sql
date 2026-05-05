-- Adds prerequisite columns referenced by entity PayrollClientSetupEntity and
-- by migrations 20260624_ot_hours_per_day_and_veipl.sql / 20260625_ot_days_in_month_decouple.sql.
--
-- These columns existed in the entity but no prior migration created them, so
-- the OT decouple migrations failed with "column does not exist".

ALTER TABLE payroll_client_setup
  ADD COLUMN IF NOT EXISTS wage_basis_days varchar(20) NOT NULL DEFAULT 'FIXED_26',
  ADD COLUMN IF NOT EXISTS ot_multiplier   numeric(4,2) NOT NULL DEFAULT 2.0;

COMMENT ON COLUMN payroll_client_setup.wage_basis_days IS
  'Wage divisor basis for prorating monthly earnings against PAYABLE_DAYS. FIXED_26 | CALENDAR_DAYS | WORKING_DAYS.';
COMMENT ON COLUMN payroll_client_setup.ot_multiplier IS
  'Overtime hourly multiplier. 1.0 = single wage, 2.0 = double wage (legacy default).';
