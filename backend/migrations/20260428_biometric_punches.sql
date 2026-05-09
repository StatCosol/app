-- Biometric punches: raw events from devices (ZKTeco/Essl/Matrix etc.)
-- Each row is a single IN/OUT/AUTO event. Processor service rolls them up
-- into one attendance_records row per (employee, date).

CREATE TABLE IF NOT EXISTS biometric_punches (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       uuid NOT NULL,
  branch_id       uuid NULL,
  employee_id     uuid NULL,
  employee_code   varchar(50) NOT NULL,
  punch_time      timestamptz NOT NULL,
  direction       varchar(10) NOT NULL DEFAULT 'AUTO',  -- IN | OUT | AUTO
  device_id       varchar(80) NULL,
  source          varchar(20) NOT NULL DEFAULT 'DEVICE', -- DEVICE | IMPORT | MANUAL
  raw_payload     jsonb NULL,
  processed_at    timestamptz NULL,
  attendance_id   uuid NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_biometric_punches_client_time
  ON biometric_punches (client_id, punch_time);

CREATE INDEX IF NOT EXISTS ix_biometric_punches_emp_time
  ON biometric_punches (employee_id, punch_time);

CREATE INDEX IF NOT EXISTS ix_biometric_punches_code_time
  ON biometric_punches (client_id, employee_code, punch_time);

CREATE INDEX IF NOT EXISTS ix_biometric_punches_unprocessed
  ON biometric_punches (client_id, punch_time)
  WHERE processed_at IS NULL;

-- Idempotency: same employee+exact timestamp+device should not duplicate
CREATE UNIQUE INDEX IF NOT EXISTS uq_biometric_punches_dedupe
  ON biometric_punches (client_id, employee_code, punch_time, COALESCE(device_id, ''));
