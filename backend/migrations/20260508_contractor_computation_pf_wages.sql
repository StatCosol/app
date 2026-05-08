-- Adds PF wage base and employer PF output for contractor MCD computation.
-- Existing rows are backfilled from the earlier capped-basic PF rule.

ALTER TABLE contractor_mcd_computations
  ADD COLUMN IF NOT EXISTS pf_wage numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pf_employer_contribution numeric(12,2) NOT NULL DEFAULT 0;

UPDATE contractor_mcd_computations
SET
  pf_wage = LEAST(COALESCE(basic_wage, 0), 15000),
  pf_employer_contribution = COALESCE(pf_deduction, 0)
WHERE pf_wage = 0
  AND COALESCE(pf_deduction, 0) > 0;
