-- Ensure legacy biometric device ingestion tables exist.
-- These are used by backend/src/biometric/* and are separate from the
-- mobile-attendance v2 kiosk/ESS tables.

CREATE TABLE IF NOT EXISTS biometric_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL,
  branch_id UUID,
  serial_number VARCHAR(80) NOT NULL UNIQUE,
  push_token VARCHAR(120) NOT NULL,
  vendor VARCHAR(40) NOT NULL DEFAULT 'ESSL',
  model VARCHAR(80),
  label VARCHAR(120),
  enabled BOOLEAN NOT NULL DEFAULT true,
  last_seen_at TIMESTAMPTZ,
  last_push_count INTEGER NOT NULL DEFAULT 0,
  meta JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_biometric_devices_client
  ON biometric_devices(client_id);

CREATE INDEX IF NOT EXISTS idx_biometric_devices_branch
  ON biometric_devices(branch_id);

CREATE TABLE IF NOT EXISTS biometric_punches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL,
  branch_id UUID,
  employee_id UUID,
  employee_code VARCHAR(50) NOT NULL,
  punch_time TIMESTAMPTZ NOT NULL,
  direction VARCHAR(10) NOT NULL DEFAULT 'AUTO',
  device_id VARCHAR(80),
  source VARCHAR(20) NOT NULL DEFAULT 'DEVICE',
  raw_payload JSONB,
  processed_at TIMESTAMPTZ,
  attendance_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_biometric_punches_client_time
  ON biometric_punches(client_id, punch_time);

CREATE INDEX IF NOT EXISTS idx_biometric_punches_employee_time
  ON biometric_punches(employee_id, punch_time);

CREATE INDEX IF NOT EXISTS idx_biometric_punches_client_code_time
  ON biometric_punches(client_id, employee_code, punch_time);

CREATE UNIQUE INDEX IF NOT EXISTS uq_biometric_punches_dedupe
  ON biometric_punches(client_id, employee_code, punch_time, (COALESCE(device_id, '')));
