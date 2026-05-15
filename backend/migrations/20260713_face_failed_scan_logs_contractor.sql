-- Phase 4d step 3: extend face_failed_scan_logs to cover contractor punches.
-- recordContractorPunch (POST /mobile-attendance/punch/contractor) now wraps
-- rejections in the same audit log used for in-house employees, so admins
-- can search all failed scans from one table.

ALTER TABLE face_failed_scan_logs
  ADD COLUMN IF NOT EXISTS contractor_employee_id UUID
    REFERENCES contractor_employees(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_failed_scan_contractor_time
  ON face_failed_scan_logs (contractor_employee_id, attempted_at DESC)
  WHERE contractor_employee_id IS NOT NULL;
