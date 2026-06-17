-- ============================================================
-- Migration: Attendance module fixes
-- Date: 2026-06-17
-- Changes:
--   1. attendance_mismatches      — persisted mismatch detection
--   2. attendance_audit_logs      — manual punch edit audit trail
--   3. ess_discrepancy_notes      — employee discrepancy submissions (replaces mailto:)
--   4. mobile_attendance_devices  — geofence columns (fix #13)
-- ============================================================

-- 1. Persisted attendance mismatches (Fix #1)
CREATE TABLE IF NOT EXISTS attendance_mismatches (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        UUID NOT NULL,
  branch_id        UUID,
  employee_id      UUID NOT NULL,
  employee_code    VARCHAR(50) NOT NULL,
  date             DATE NOT NULL,
  issue_type       VARCHAR(50) NOT NULL,
  detail           TEXT NOT NULL,
  severity         VARCHAR(10) NOT NULL DEFAULT 'MEDIUM' CHECK (severity IN ('HIGH','MEDIUM','LOW')),
  resolved         BOOLEAN NOT NULL DEFAULT FALSE,
  resolved_by      UUID,
  resolved_at      TIMESTAMPTZ,
  resolution_note  TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique constraint for upsert ON CONFLICT
CREATE UNIQUE INDEX IF NOT EXISTS uq_attendance_mismatches_key
  ON attendance_mismatches (client_id, employee_id, date, issue_type);

-- Lookup indices
CREATE INDEX IF NOT EXISTS idx_attendance_mismatches_client_id  ON attendance_mismatches (client_id);
CREATE INDEX IF NOT EXISTS idx_attendance_mismatches_branch_id  ON attendance_mismatches (branch_id);
CREATE INDEX IF NOT EXISTS idx_attendance_mismatches_employee_id ON attendance_mismatches (employee_id);
CREATE INDEX IF NOT EXISTS idx_attendance_mismatches_date       ON attendance_mismatches (date);

-- ─────────────────────────────────────────────────────────────

-- 2. Attendance audit logs (Fix #3)
CREATE TABLE IF NOT EXISTS attendance_audit_logs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_id    UUID NOT NULL,
  client_id        UUID NOT NULL,
  employee_id      UUID NOT NULL,
  date             DATE NOT NULL,
  action           VARCHAR(30) NOT NULL CHECK (action IN ('EDIT','APPROVE','REJECT','DELETE','CREATE')),
  actor_user_id    UUID,
  before_snapshot  JSONB,
  after_snapshot   JSONB,
  note             TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attendance_audit_logs_attendance_id ON attendance_audit_logs (attendance_id);
CREATE INDEX IF NOT EXISTS idx_attendance_audit_logs_client_id     ON attendance_audit_logs (client_id);

-- ─────────────────────────────────────────────────────────────

-- 3. ESS discrepancy notes (Fix #2 + #14)
CREATE TABLE IF NOT EXISTS ess_discrepancy_notes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        UUID NOT NULL,
  employee_id      UUID NOT NULL,
  employee_code    VARCHAR(50) NOT NULL,
  attendance_date  DATE NOT NULL,
  note             TEXT NOT NULL,
  status           VARCHAR(20) NOT NULL DEFAULT 'OPEN'
                     CHECK (status IN ('OPEN','ACKNOWLEDGED','RESOLVED','DISMISSED')),
  hr_response      TEXT,
  hr_user_id       UUID,
  hr_actioned_at   TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ess_discrepancy_notes_client_id    ON ess_discrepancy_notes (client_id);
CREATE INDEX IF NOT EXISTS idx_ess_discrepancy_notes_employee_id  ON ess_discrepancy_notes (employee_id);

-- ─────────────────────────────────────────────────────────────

-- 4. Geofence columns on mobile_attendance_devices (Fix #13)
ALTER TABLE mobile_attendance_devices
  ADD COLUMN IF NOT EXISTS geofence_lat      NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS geofence_lng      NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS geofence_radius_m INTEGER
    CHECK (geofence_radius_m IS NULL OR (geofence_radius_m >= 50 AND geofence_radius_m <= 50000));

-- ─────────────────────────────────────────────────────────────

-- 5. Employee notifications table (for Fix #6 rejection notifications)
--    Only create if it does not already exist. Backend inserts ON CONFLICT DO NOTHING.
CREATE TABLE IF NOT EXISTS employee_notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID NOT NULL,
  employee_id UUID NOT NULL,
  type        VARCHAR(60) NOT NULL,
  title       VARCHAR(255),
  body        TEXT,
  ref_type    VARCHAR(60),
  ref_id      UUID,
  is_read     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employee_notifications_employee_id ON employee_notifications (employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_notifications_client_id   ON employee_notifications (client_id);
CREATE INDEX IF NOT EXISTS idx_employee_notifications_type        ON employee_notifications (type);
