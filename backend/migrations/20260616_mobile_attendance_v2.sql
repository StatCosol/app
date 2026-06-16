-- Mobile Attendance v2 schema
-- Generated 2026-06-16
-- Drop old tables from the god-object service before recreating with clean schema.
-- All 8 tables are rebuilt from scratch; no biometric data existed before this PR.
DROP TABLE IF EXISTS face_liveness_nonces CASCADE;
DROP TABLE IF EXISTS contractor_biometric_punches CASCADE;
DROP TABLE IF EXISTS mobile_attendance_punches CASCADE;
DROP TABLE IF EXISTS kiosk_enroll_tickets CASCADE;
DROP TABLE IF EXISTS face_enrollment_history CASCADE;
DROP TABLE IF EXISTS contractor_face_enrollments CASCADE;
DROP TABLE IF EXISTS face_enrollments CASCADE;
DROP TABLE IF EXISTS mobile_attendance_devices CASCADE;

-- Devices
CREATE TABLE IF NOT EXISTS mobile_attendance_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL,
  branch_id UUID,
  mode VARCHAR(10) NOT NULL CHECK (mode IN ('KIOSK','ESS')),
  install_token VARCHAR(64) NOT NULL UNIQUE,
  android_id VARCHAR(100),
  device_name VARCHAR(200),
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_seen_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revoked_by UUID,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mad_client ON mobile_attendance_devices(client_id);
CREATE INDEX IF NOT EXISTS idx_mad_deleted_at ON mobile_attendance_devices(deleted_at);

-- Employee face enrollments (one row per employee — employee_id IS the PK)
CREATE TABLE IF NOT EXISTS face_enrollments (
  employee_id UUID PRIMARY KEY,
  client_id UUID NOT NULL,
  branch_id UUID,
  embedding BYTEA,
  embedding_model VARCHAR(40),
  photo_url TEXT,
  consent_given_at TIMESTAMPTZ,
  consent_given_by UUID,
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  enrolled_by UUID,
  is_active BOOLEAN NOT NULL DEFAULT true,
  deactivated_at TIMESTAMPTZ,
  deactivation_reason TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fe_client ON face_enrollments(client_id);

-- Contractor face enrollments (same structure, keyed by contractor_employee_id)
CREATE TABLE IF NOT EXISTS contractor_face_enrollments (
  contractor_employee_id UUID PRIMARY KEY,
  client_id UUID NOT NULL,
  branch_id UUID,
  contractor_user_id UUID,
  embedding BYTEA,
  embedding_model VARCHAR(40),
  photo_url TEXT,
  consent_given_at TIMESTAMPTZ,
  consent_given_by UUID,
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  enrolled_by UUID,
  is_active BOOLEAN NOT NULL DEFAULT true,
  deactivated_at TIMESTAMPTZ,
  deactivation_reason TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cfe_client ON contractor_face_enrollments(client_id);

-- Enrollment audit trail
CREATE TABLE IF NOT EXISTS face_enrollment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID,
  contractor_employee_id UUID,
  client_id UUID NOT NULL,
  action VARCHAR(20) NOT NULL,  -- ENROLL, RE_ENROLL, DEACTIVATE, DELETE
  reason TEXT,
  embedding_model VARCHAR(40),
  actor_user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_feh_employee ON face_enrollment_history(employee_id);
CREATE INDEX IF NOT EXISTS idx_feh_contractor ON face_enrollment_history(contractor_employee_id);

-- Kiosk-supervised enrollment tickets
CREATE TABLE IF NOT EXISTS kiosk_enroll_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL,
  branch_id UUID,
  device_id UUID NOT NULL,
  subject_type VARCHAR(20) NOT NULL CHECK (subject_type IN ('EMPLOYEE','CONTRACTOR')),
  employee_id UUID,
  contractor_employee_id UUID,
  subject_name VARCHAR(250) NOT NULL,
  subject_code VARCHAR(50),
  consent_given BOOLEAN NOT NULL DEFAULT false,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  captured_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancelled_by UUID,
  rejection_reason TEXT,
  embedding_model VARCHAR(40),
  pending_embedding BYTEA,
  photo_url TEXT,
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_ket_client_status ON kiosk_enroll_tickets(client_id, status);
CREATE INDEX IF NOT EXISTS idx_ket_device_status ON kiosk_enroll_tickets(device_id, status);

-- Employee attendance punches
CREATE TABLE IF NOT EXISTS mobile_attendance_punches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL,
  branch_id UUID,
  device_id UUID NOT NULL,
  employee_id UUID NOT NULL,
  direction VARCHAR(5) NOT NULL CHECK (direction IN ('IN','OUT','AUTO')),
  punch_time TIMESTAMPTZ NOT NULL,
  match_score NUMERIC,
  liveness_score NUMERIC,
  liveness_challenge_type VARCHAR(30),
  liveness_challenge_passed_at TIMESTAMPTZ,
  liveness_nonce VARCHAR(100),
  embedding_model VARCHAR(40),
  photo_url TEXT,
  capture_lat NUMERIC,
  capture_lng NUMERIC,
  ip VARCHAR(45),
  user_agent TEXT,
  is_mock_location BOOLEAN,
  is_rooted BOOLEAN,
  offline_sync BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_map_client_employee ON mobile_attendance_punches(client_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_map_punch_time ON mobile_attendance_punches(punch_time);

-- Contractor attendance punches
CREATE TABLE IF NOT EXISTS contractor_biometric_punches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL,
  branch_id UUID,
  device_id UUID NOT NULL,
  contractor_employee_id UUID NOT NULL,
  direction VARCHAR(5) NOT NULL CHECK (direction IN ('IN','OUT','AUTO')),
  punch_time TIMESTAMPTZ NOT NULL,
  match_score NUMERIC,
  liveness_score NUMERIC,
  liveness_challenge_type VARCHAR(30),
  liveness_challenge_passed_at TIMESTAMPTZ,
  liveness_nonce VARCHAR(100),
  embedding_model VARCHAR(40),
  photo_url TEXT,
  capture_lat NUMERIC,
  capture_lng NUMERIC,
  ip VARCHAR(45),
  user_agent TEXT,
  is_mock_location BOOLEAN,
  is_rooted BOOLEAN,
  offline_sync BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cbp_client_ce ON contractor_biometric_punches(client_id, contractor_employee_id);

-- Liveness nonces (one-time server-issued challenge tokens)
CREATE TABLE IF NOT EXISTS face_liveness_nonces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL,
  nonce VARCHAR(100) NOT NULL UNIQUE,
  challenge_type VARCHAR(30) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fln_device ON face_liveness_nonces(device_id);
CREATE INDEX IF NOT EXISTS idx_fln_nonce ON face_liveness_nonces(nonce);
