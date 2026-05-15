-- Phase 4b: cross-table duplicate-face guard
--
-- The existing face_duplicate_attempt_logs table (migration
-- 20260515_face_audit_tables.sql) only references employees(id) for both
-- attempting and matched sides. With Phase 4a (contractor face
-- enrollment), the duplicate guard now also has to cover the case where
-- the attempting OR matched subject is a contractor employee.
--
-- We add two nullable contractor columns to either side and leave the
-- existing employee columns untouched (also nullable). Every row will
-- have exactly one of (attempting_employee_id, attempting_contractor_employee_id)
-- set, and exactly one of (matched_employee_id, matched_contractor_employee_id)
-- set. The `source` column is widened informally to include new values
-- like 'enroll-contractor' (no enum change required — it's TEXT).

ALTER TABLE face_duplicate_attempt_logs
  ADD COLUMN IF NOT EXISTS attempting_contractor_employee_id UUID
    REFERENCES contractor_employees(id) ON DELETE SET NULL;

ALTER TABLE face_duplicate_attempt_logs
  ADD COLUMN IF NOT EXISTS matched_contractor_employee_id UUID
    REFERENCES contractor_employees(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_dup_attempt_matched_contractor
  ON face_duplicate_attempt_logs (matched_contractor_employee_id, attempted_at DESC)
  WHERE matched_contractor_employee_id IS NOT NULL;
