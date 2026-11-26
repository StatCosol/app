-- ESI contribution-period re-check (2026-11-26).
-- Payroll sets this date when the ₹21,000 fixed-gross ceiling removes an
-- employee from ESI at a period start (April / October). Only those employees
-- are re-included automatically at a later period start; HR's manual
-- exclusions leave it NULL. Additive only: existing rows stay NULL.
ALTER TABLE employees ADD COLUMN IF NOT EXISTS esi_ceiling_excluded_on date;
