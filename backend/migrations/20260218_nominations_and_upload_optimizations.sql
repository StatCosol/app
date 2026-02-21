-- ============================================================
-- Nominations Module + Upload Optimizations
-- 2026-02-18
-- ============================================================

BEGIN;

-- ============================================================
-- 1. ALTER employee_generated_forms: add client_id, branch_id,
--    version, status columns for nominations PDF tracking
-- ============================================================
ALTER TABLE employee_generated_forms
  ADD COLUMN IF NOT EXISTS client_id  UUID,
  ADD COLUMN IF NOT EXISTS branch_id  UUID,
  ADD COLUMN IF NOT EXISTS version    INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS status     VARCHAR(20) NOT NULL DEFAULT 'DRAFT';

-- Backfill client_id from the employee record
UPDATE employee_generated_forms egf
  SET client_id = e.client_id
FROM employees e
WHERE egf.employee_id = e.id
  AND egf.client_id IS NULL;

-- Backfill branch_id from the employee record
UPDATE employee_generated_forms egf
  SET branch_id = e.branch_id
FROM employees e
WHERE egf.employee_id = e.id
  AND egf.branch_id IS NULL;

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_gen_form_client
  ON employee_generated_forms(client_id);

CREATE INDEX IF NOT EXISTS idx_gen_form_emp_type
  ON employee_generated_forms(employee_id, form_type);

COMMIT;
