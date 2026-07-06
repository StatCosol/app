-- ═══════════════════════════════════════════════════════════════════════════
-- FaceDesk V2 — StatCo Smart Attendance Kiosk (canonical schema)
-- New module, fully separate from V1 mobile-attendance. Tables are prefixed
-- `facedesk_` so they never collide with V1 or other in-flight work. V1 stays
-- live until V2 is validated. All idempotent.
--
-- Thresholds are stored as PERCENTAGES for the admin UI (per spec: 95% match,
-- 90% retry, 90% duplicate). The backend maps them to calibrated cosine
-- thresholds for the actual face model — see FaceDeskSettingsService.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS facedesk_kiosk_devices (
  device_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_name     varchar(120) NOT NULL,
  branch_id       uuid,
  client_id       uuid NOT NULL,
  location        text,
  device_status   varchar(20) NOT NULL DEFAULT 'PROVISIONED'
                    CHECK (device_status IN ('PROVISIONED','ONLINE','OFFLINE','REVOKED')),
  install_token   varchar(80) UNIQUE,
  android_id      varchar(120),
  mode            varchar(20) NOT NULL DEFAULT 'ATTENDANCE'
                    CHECK (mode IN ('ATTENDANCE','ENROLLMENT')),
  last_sync_time  timestamptz,
  app_version     varchar(40),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fd_devices_client ON facedesk_kiosk_devices(client_id);
CREATE INDEX IF NOT EXISTS idx_fd_devices_branch ON facedesk_kiosk_devices(branch_id);

CREATE TABLE IF NOT EXISTS facedesk_employee_face_profiles (
  profile_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id       uuid NOT NULL,
  client_id         uuid NOT NULL,
  branch_id         uuid,
  enrollment_status varchar(20) NOT NULL DEFAULT 'PENDING'
                    CHECK (enrollment_status IN ('PENDING','ENROLLED','BLOCKED','DEACTIVATED')),
  face_template     bytea,
  embedding_model   varchar(40),
  quality_score     numeric,
  liveness_status   varchar(20) DEFAULT 'UNKNOWN'
                    CHECK (liveness_status IN ('UNKNOWN','PASSED','FAILED')),
  duplicate_status  varchar(20) DEFAULT 'CLEAR'
                    CHECK (duplicate_status IN ('CLEAR','FLAGGED','APPROVED','REJECTED')),
  consent_given_at  timestamptz,
  consent_given_by  uuid,
  enrolled_by       uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_fd_profile_employee UNIQUE (employee_id)
);
CREATE INDEX IF NOT EXISTS idx_fd_profiles_client ON facedesk_employee_face_profiles(client_id);
CREATE INDEX IF NOT EXISTS idx_fd_profiles_status ON facedesk_employee_face_profiles(client_id, enrollment_status);

CREATE TABLE IF NOT EXISTS facedesk_employee_face_samples (
  sample_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     uuid NOT NULL,
  profile_id      uuid NOT NULL REFERENCES facedesk_employee_face_profiles(profile_id) ON DELETE CASCADE,
  sample_type     varchar(20) NOT NULL DEFAULT 'FRONT'
                    CHECK (sample_type IN ('FRONT','LEFT','RIGHT','EXPRESSION','LIVENESS')),
  image_path      text,
  embedding       bytea NOT NULL,
  embedding_model varchar(40),
  quality_score   numeric,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fd_samples_profile ON facedesk_employee_face_samples(profile_id);
CREATE INDEX IF NOT EXISTS idx_fd_samples_employee ON facedesk_employee_face_samples(employee_id);

CREATE TABLE IF NOT EXISTS facedesk_attendance_logs (
  attendance_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id       uuid NOT NULL,
  client_id         uuid NOT NULL,
  branch_id         uuid,
  device_id         uuid,
  punch_type        varchar(10) NOT NULL DEFAULT 'AUTO'
                     CHECK (punch_type IN ('IN','OUT','AUTO')),
  punch_time        timestamptz NOT NULL,
  confidence_score  numeric,
  match_margin      numeric,
  liveness_score    numeric,
  photo_url         text,
  attendance_status varchar(20) NOT NULL DEFAULT 'MARKED'
                     CHECK (attendance_status IN ('MARKED','REVIEW_PENDING','APPROVED','REJECTED')),
  sync_status       varchar(20) NOT NULL DEFAULT 'SYNCED'
                     CHECK (sync_status IN ('SYNCED','OFFLINE_PENDING')),
  offline_ref       varchar(80),
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fd_att_client_day ON facedesk_attendance_logs(client_id, punch_time);
CREATE INDEX IF NOT EXISTS idx_fd_att_employee ON facedesk_attendance_logs(employee_id, punch_time);
CREATE UNIQUE INDEX IF NOT EXISTS uq_fd_att_offline_ref
  ON facedesk_attendance_logs(client_id, offline_ref) WHERE offline_ref IS NOT NULL;

CREATE TABLE IF NOT EXISTS facedesk_attendance_failed_attempts (
  attempt_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        uuid NOT NULL,
  branch_id        uuid,
  device_id        uuid,
  best_employee_id uuid,
  best_confidence  numeric,
  reason           varchar(40) NOT NULL,
  photo_url        text,
  attempted_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fd_failed_client ON facedesk_attendance_failed_attempts(client_id, attempted_at);

CREATE TABLE IF NOT EXISTS facedesk_face_duplicate_alerts (
  alert_id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           uuid NOT NULL,
  new_employee_id     uuid NOT NULL,
  matched_employee_id uuid NOT NULL,
  similarity_score    numeric NOT NULL,
  status              varchar(20) NOT NULL DEFAULT 'PENDING'
                       CHECK (status IN ('PENDING','APPROVED','REJECTED','FALSE_ALERT')),
  reviewed_by         uuid,
  reviewed_at         timestamptz,
  admin_remarks       text,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fd_dupe_client ON facedesk_face_duplicate_alerts(client_id, status);

CREATE TABLE IF NOT EXISTS facedesk_attendance_review_queue (
  review_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        uuid NOT NULL,
  branch_id        uuid,
  employee_id      uuid,
  attendance_id    uuid REFERENCES facedesk_attendance_logs(attendance_id) ON DELETE CASCADE,
  issue_type       varchar(30) NOT NULL
                    CHECK (issue_type IN ('DUPLICATE_ENROLLMENT','LOW_CONFIDENCE','MULTIPLE_MATCH','REPEATED_FAILURE','MANUAL_CORRECTION')),
  confidence_score numeric,
  status           varchar(20) NOT NULL DEFAULT 'PENDING'
                    CHECK (status IN ('PENDING','APPROVED','REJECTED','REASSIGNED','FALSE_ALERT')),
  admin_remarks    text,
  reviewed_by      uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  reviewed_at      timestamptz
);
CREATE INDEX IF NOT EXISTS idx_fd_review_client ON facedesk_attendance_review_queue(client_id, status);

CREATE TABLE IF NOT EXISTS facedesk_manual_attendance_corrections (
  correction_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       uuid NOT NULL,
  branch_id       uuid,
  employee_id     uuid NOT NULL,
  attendance_id   uuid,
  correction_type varchar(20) NOT NULL CHECK (correction_type IN ('ADD','EDIT','DELETE')),
  old_punch_time  timestamptz,
  new_punch_time  timestamptz,
  old_punch_type  varchar(10),
  new_punch_type  varchar(10),
  reason          text,
  requested_by    uuid,
  approved_by     uuid,
  status          varchar(20) NOT NULL DEFAULT 'PENDING'
                   CHECK (status IN ('PENDING','APPROVED','REJECTED')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  resolved_at     timestamptz
);
CREATE INDEX IF NOT EXISTS idx_fd_corrections_client ON facedesk_manual_attendance_corrections(client_id, status);

CREATE TABLE IF NOT EXISTS facedesk_device_sync_logs (
  sync_id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id         uuid NOT NULL,
  client_id         uuid NOT NULL,
  synced_count      int NOT NULL DEFAULT 0,
  duplicate_skipped int NOT NULL DEFAULT 0,
  failed_count      int NOT NULL DEFAULT 0,
  sync_status       varchar(20) NOT NULL DEFAULT 'OK' CHECK (sync_status IN ('OK','PARTIAL','FAILED')),
  detail            text,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fd_sync_device ON facedesk_device_sync_logs(device_id, created_at);

-- Thresholds are PERCENTAGES (admin-facing); the service maps to cosine.
CREATE TABLE IF NOT EXISTS facedesk_face_settings (
  client_id             uuid PRIMARY KEY,
  face_match_confidence numeric NOT NULL DEFAULT 95,   -- accept ≥ (percent)
  face_retry_confidence numeric NOT NULL DEFAULT 90,   -- retry band floor (percent)
  duplicate_threshold   numeric NOT NULL DEFAULT 90,   -- block enrollment ≥ (percent)
  min_face_samples      int NOT NULL DEFAULT 5,
  frame_capture_count   int NOT NULL DEFAULT 15,
  liveness_required     boolean NOT NULL DEFAULT true,
  offline_sync_enabled  boolean NOT NULL DEFAULT true,
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS facedesk_audit_logs (
  audit_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   uuid NOT NULL,
  actor_id    uuid,
  action      varchar(40) NOT NULL,
  entity_type varchar(40) NOT NULL,
  entity_id   uuid,
  detail      jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fd_audit_client ON facedesk_audit_logs(client_id, created_at);
