-- VEIPL OT correction: per-client OT hours-per-day setting.
-- VEIPL formula: OT = GROSS / 26 / 8.5 (single wage, 8.5 hr day).
-- Default for all other clients remains 8.0 hours/day with their existing
-- multiplier so prior runs are unchanged.

ALTER TABLE payroll_client_setup
  ADD COLUMN IF NOT EXISTS ot_hours_per_day numeric(4,2) NOT NULL DEFAULT 8.0;

COMMENT ON COLUMN payroll_client_setup.ot_hours_per_day IS
  'Hours that constitute one full working day for OT rate calc. Per-hour wage = GROSS / wageBasisDaysCount / ot_hours_per_day.';

-- VEIPL: 8 hours/day, single-wage multiplier (1.0), fixed 26-day wage basis
-- so OT per-day wage = GROSS / 26 (not calendar days). Per-hour = day / 8.
UPDATE payroll_client_setup
SET ot_hours_per_day = 8.00,
    ot_multiplier    = 1.00,
    wage_basis_days  = 'FIXED_26'
WHERE client_id IN (
  SELECT id FROM clients WHERE client_code = 'VEIPL'
);
