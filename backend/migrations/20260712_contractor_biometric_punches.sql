-- Phase 4d step 2: parallel punch table for contractor employees.
--
-- Mirrors the mobile-attendance columns we already write to
-- `biometric_punches` for in-house employees, but is keyed by
-- contractor_employees.id. Kept in a parallel table (matching the Phase 4a
-- precedent set by contractor_face_enrollments) so existing payroll /
-- attendance roll-ups that read biometric_punches stay untouched.

CREATE TABLE IF NOT EXISTS contractor_biometric_punches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  branch_id uuid NULL,
  contractor_employee_id uuid NOT NULL,
  punch_time timestamptz NOT NULL,
  direction varchar(10) NOT NULL DEFAULT 'AUTO',
  source varchar(20) NOT NULL DEFAULT 'MOBILE_KIOSK',
  mobile_device_id uuid NULL,
  device_id varchar(80) NULL,
  capture_lat numeric NULL,
  capture_lng numeric NULL,
  capture_accuracy_m numeric NULL,
  capture_ip inet NULL,
  capture_user_agent text NULL,
  photo_url text NULL,
  match_score numeric NULL,
  liveness_score numeric NULL,
  match_provider varchar(40) NULL,
  raw_payload jsonb NULL,
  attendance_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_contractor_punch_contractor_employee
    FOREIGN KEY (contractor_employee_id)
    REFERENCES contractor_employees (id)
    ON DELETE CASCADE,
  CONSTRAINT chk_contractor_punch_direction
    CHECK (direction IN ('IN', 'OUT', 'AUTO')),
  CONSTRAINT chk_contractor_punch_source
    CHECK (source IN ('MOBILE_KIOSK', 'MOBILE_ESS', 'DEVICE', 'IMPORT', 'MANUAL'))
);

-- Idempotency: same contractor + same instant = same punch (whether the
-- kiosk replays a drained offline queue or a network blip causes a retry).
CREATE UNIQUE INDEX IF NOT EXISTS ux_contractor_punch_dedupe
  ON contractor_biometric_punches (client_id, contractor_employee_id, punch_time);

CREATE INDEX IF NOT EXISTS ix_contractor_punch_client_time
  ON contractor_biometric_punches (client_id, punch_time);

CREATE INDEX IF NOT EXISTS ix_contractor_punch_contractor_time
  ON contractor_biometric_punches (contractor_employee_id, punch_time);

CREATE INDEX IF NOT EXISTS ix_contractor_punch_branch_time
  ON contractor_biometric_punches (branch_id, punch_time)
  WHERE branch_id IS NOT NULL;
