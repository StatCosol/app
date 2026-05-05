-- Decouple OT divisor from wage_basis_days.
-- wage_basis_days drives EARNING pro-rata (e.g. CALENDAR_DAYS).
-- ot_days_in_month is used ONLY for OT base wage. Default 26.

ALTER TABLE payroll_client_setup
  ADD COLUMN IF NOT EXISTS ot_days_in_month numeric(4,2) NOT NULL DEFAULT 26.0;

COMMENT ON COLUMN payroll_client_setup.ot_days_in_month IS
  'Days-in-month divisor for OT base wage. OT per-hour = ACTUAL_GROSS / ot_days_in_month / ot_hours_per_day.';

-- VEIPL final config:
--   wage_basis_days  = CALENDAR_DAYS  (earned gross = gross / calendar_days * payable_days)
--   ot_days_in_month = 26
--   ot_hours_per_day = 8
--   ot_multiplier    = 1.0  (single wage)
UPDATE payroll_client_setup
SET wage_basis_days  = 'CALENDAR_DAYS',
    ot_days_in_month = 26.00,
    ot_hours_per_day = 8.00,
    ot_multiplier    = 1.00
WHERE client_id IN (
  SELECT id FROM clients WHERE client_code = 'VEIPL'
);
