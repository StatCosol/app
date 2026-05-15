-- Phase 3b: face-attendance audit tables
-- ----------------------------------------------------------------
-- Three append-only tables for the mobile-attendance hardening flow:
--   1. face_failed_scan_logs       — every recordPunch rejection (mismatch,
--                                    geofence, mock-loc, status gate, etc.)
--   2. face_duplicate_attempt_logs — every duplicate-face hit at enrollment
--   3. face_enrollment_history     — append row for every ENROLL / RE_ENROLL
--                                    / DEACTIVATE / REACTIVATE event.
-- All rows are scoped by client_id so existing RLS / row-scope helpers can
-- filter the same way as biometric_punches.

CREATE TABLE IF NOT EXISTS face_failed_scan_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  branch_id       UUID         REFERENCES client_branches(id) ON DELETE SET NULL,
  device_id       UUID         REFERENCES mobile_attendance_devices(id) ON DELETE SET NULL,
  employee_id     UUID         REFERENCES employees(id) ON DELETE SET NULL,
  employee_code   TEXT,
  attempted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason          TEXT NOT NULL,           -- enum-like, see below
  reason_detail   TEXT,                    -- free-form e.g. "match_score=0.62 < 0.78"
  match_score     DOUBLE PRECISION,
  liveness_score  DOUBLE PRECISION,
  capture_lat     DOUBLE PRECISION,
  capture_lng     DOUBLE PRECISION,
  ip              INET
);

-- Reason taxonomy (kept open for forward-compat):
--   FACE_MISMATCH, LIVENESS_FAIL, MULTI_FACE, MASK_DETECTED, GEOFENCE_OUTSIDE,
--   MOCK_LOCATION, ROOTED_DEVICE, EMPLOYEE_INACTIVE, EMPLOYEE_EXITED,
--   COOLDOWN_ACTIVE, CROSS_SOURCE_CONFLICT, CLOCK_SKEW, INVALID_TIME,
--   QUALITY_LOW, OTHER

CREATE INDEX IF NOT EXISTS idx_failed_scan_client_time
  ON face_failed_scan_logs (client_id, attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_failed_scan_emp_time
  ON face_failed_scan_logs (employee_code, attempted_at DESC)
  WHERE employee_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_failed_scan_reason
  ON face_failed_scan_logs (client_id, reason, attempted_at DESC);

CREATE TABLE IF NOT EXISTS face_duplicate_attempt_logs (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id                UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  attempted_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  attempting_employee_id   UUID         REFERENCES employees(id) ON DELETE SET NULL,
  matched_employee_id      UUID         REFERENCES employees(id) ON DELETE SET NULL,
  match_score              DOUBLE PRECISION NOT NULL,
  attempted_by_user_id     UUID         REFERENCES users(id) ON DELETE SET NULL,
  source                   TEXT NOT NULL  -- 'enroll-face' | 'enroll-self'
);

CREATE INDEX IF NOT EXISTS idx_dup_attempt_client_time
  ON face_duplicate_attempt_logs (client_id, attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_dup_attempt_matched
  ON face_duplicate_attempt_logs (matched_employee_id, attempted_at DESC)
  WHERE matched_employee_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS face_enrollment_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  client_id       UUID NOT NULL REFERENCES clients(id)   ON DELETE CASCADE,
  action          TEXT NOT NULL,           -- ENROLL | RE_ENROLL | DEACTIVATE | REACTIVATE
  reason          TEXT,
  embedding_model TEXT,
  actor_user_id   UUID         REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_face_enroll_hist_emp_time
  ON face_enrollment_history (employee_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_face_enroll_hist_client_time
  ON face_enrollment_history (client_id, created_at DESC);
