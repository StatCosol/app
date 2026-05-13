-- Mobile attendance: face-based punching from a tablet (KIOSK) or
-- the employee's own phone (ESS). Punches land in biometric_punches
-- with source = 'MOBILE_KIOSK' or 'MOBILE_ESS' so the existing
-- attendance roll-up + payroll/registers/reports keep working unchanged.

-- ===========================================================================
-- 1. Face enrollments — one row per employee. Stores Azure Face person ID
--    and (optionally) an on-device embedding for offline kiosk matching.
-- ===========================================================================
CREATE TABLE IF NOT EXISTS face_enrollments (
  employee_id        uuid PRIMARY KEY,
  client_id          uuid NOT NULL,
  branch_id          uuid NULL,
  azure_person_id    varchar(80) NULL,
  azure_person_group varchar(80) NULL,
  embedding          bytea NULL,             -- 512-byte float32 vector (MobileFaceNet)
  embedding_model    varchar(40) NULL,       -- e.g. 'mobilefacenet-v1', 'azure-recognition_04'
  photo_url          text NULL,              -- enrollment selfie (optional, for audit)
  consent_given_at   timestamptz NULL,       -- DPDP Act consent timestamp
  consent_given_by   uuid NULL,
  enrolled_at        timestamptz NOT NULL DEFAULT now(),
  enrolled_by        uuid NULL,
  is_active          boolean NOT NULL DEFAULT true,
  deactivated_at     timestamptz NULL,
  deactivation_reason text NULL,
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_face_enrollments_client
  ON face_enrollments (client_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS ix_face_enrollments_branch
  ON face_enrollments (branch_id) WHERE is_active = true;

-- ===========================================================================
-- 2. Mobile attendance devices — registered tablets (kiosk) or admin-issued
--    install tokens for ESS phones. Bound to a client/branch.
-- ===========================================================================
CREATE TABLE IF NOT EXISTS mobile_attendance_devices (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           uuid NOT NULL,
  branch_id           uuid NULL,
  mode                varchar(16) NOT NULL DEFAULT 'KIOSK', -- 'KIOSK' | 'ESS'
  device_label        varchar(120) NULL,
  android_id          varchar(120) NULL,                -- hardware id reported by app
  install_token       varchar(64) NOT NULL UNIQUE,      -- bearer token used by the mobile app
  install_token_hash  varchar(120) NULL,                -- reserved (future hashed-token storage)
  geofence_lat        numeric(10,7) NULL,
  geofence_lng        numeric(10,7) NULL,
  geofence_radius_m   integer NULL,
  registered_at       timestamptz NOT NULL DEFAULT now(),
  registered_by       uuid NULL,
  last_seen_at        timestamptz NULL,
  last_punch_at       timestamptz NULL,
  is_active           boolean NOT NULL DEFAULT true,
  revoked_at          timestamptz NULL,
  revoked_by          uuid NULL,
  CONSTRAINT chk_mobile_device_mode CHECK (mode IN ('KIOSK', 'ESS'))
);

CREATE INDEX IF NOT EXISTS ix_mobile_devices_client
  ON mobile_attendance_devices (client_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS ix_mobile_devices_branch
  ON mobile_attendance_devices (branch_id) WHERE is_active = true;

-- ===========================================================================
-- 3. Extend biometric_punches with mobile-specific evidence columns.
--    All nullable — eSSL device punches keep working unchanged.
-- ===========================================================================
ALTER TABLE biometric_punches
  ADD COLUMN IF NOT EXISTS mobile_device_id uuid NULL,
  ADD COLUMN IF NOT EXISTS capture_lat      numeric(10,7) NULL,
  ADD COLUMN IF NOT EXISTS capture_lng      numeric(10,7) NULL,
  ADD COLUMN IF NOT EXISTS capture_accuracy_m numeric(8,2) NULL,
  ADD COLUMN IF NOT EXISTS photo_url        text NULL,
  ADD COLUMN IF NOT EXISTS match_score      numeric(5,4) NULL,   -- 0..1, cosine/Azure confidence
  ADD COLUMN IF NOT EXISTS liveness_score   numeric(5,4) NULL,   -- 0..1
  ADD COLUMN IF NOT EXISTS match_provider   varchar(32) NULL;    -- 'azure-face' | 'mobilefacenet'

CREATE INDEX IF NOT EXISTS ix_biometric_punches_mobile_device
  ON biometric_punches (mobile_device_id)
  WHERE mobile_device_id IS NOT NULL;
