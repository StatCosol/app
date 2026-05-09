-- 20260430_contractor_employees_skill_salary.sql
-- Phase 1: Add skill category, salary/wage, status enum, state code to contractor_employees.
-- Idempotent: safe to re-run.

BEGIN;

-- Skill category (statutory: Unskilled / Semi Skilled / Skilled / Highly Skilled)
ALTER TABLE contractor_employees
  ADD COLUMN IF NOT EXISTS skill_category VARCHAR(20) NULL;

-- Compensation (employee-level, not contractor-level)
ALTER TABLE contractor_employees
  ADD COLUMN IF NOT EXISTS monthly_salary NUMERIC(12, 2) NULL;

ALTER TABLE contractor_employees
  ADD COLUMN IF NOT EXISTS daily_wage NUMERIC(10, 2) NULL;

-- State code for minimum-wage validation (Phase 2)
ALTER TABLE contractor_employees
  ADD COLUMN IF NOT EXISTS state_code VARCHAR(10) NULL;

-- Status enum (replaces sole reliance on is_active boolean).
-- Allowed: ACTIVE, LEFT, INACTIVE.
--   ACTIVE   = currently working
--   LEFT     = explicitly exited (resignation/contract end)
--   INACTIVE = soft-suspended (administrative)
ALTER TABLE contractor_employees
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE';

-- Backfill status from existing is_active flag (safe: NULL-coerces to ACTIVE)
UPDATE contractor_employees
   SET status = CASE WHEN is_active = TRUE THEN 'ACTIVE' ELSE 'LEFT' END
 WHERE status IS NULL OR status = 'ACTIVE';

-- Constraint: skill_category whitelist (allow NULL for legacy rows during transition)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_ce_skill_category'
  ) THEN
    ALTER TABLE contractor_employees
      ADD CONSTRAINT chk_ce_skill_category
      CHECK (skill_category IS NULL OR skill_category IN
        ('UNSKILLED', 'SEMI_SKILLED', 'SKILLED', 'HIGHLY_SKILLED'));
  END IF;
END$$;

-- Constraint: status whitelist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_ce_status'
  ) THEN
    ALTER TABLE contractor_employees
      ADD CONSTRAINT chk_ce_status
      CHECK (status IN ('ACTIVE', 'LEFT', 'INACTIVE'));
  END IF;
END$$;

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_contractor_emp_status
  ON contractor_employees(status);
CREATE INDEX IF NOT EXISTS idx_contractor_emp_skill
  ON contractor_employees(skill_category);

COMMIT;
