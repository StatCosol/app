-- Biometric devices registry for eSSL/ZKTeco iclock push protocol.
-- Devices authenticate by serial number (SN) and an opaque push token.
CREATE TABLE IF NOT EXISTS biometric_devices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       uuid NOT NULL,
  branch_id       uuid,
  serial_number   varchar(80) NOT NULL,
  push_token      varchar(120) NOT NULL,
  vendor          varchar(40)  NOT NULL DEFAULT 'ESSL',
  model           varchar(80),
  label           varchar(120),
  enabled         boolean      NOT NULL DEFAULT true,
  last_seen_at    timestamptz,
  last_push_count integer      NOT NULL DEFAULT 0,
  meta            jsonb,
  created_at      timestamptz  NOT NULL DEFAULT now(),
  updated_at      timestamptz  NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_biometric_devices_sn
  ON biometric_devices (serial_number);

CREATE INDEX IF NOT EXISTS ix_biometric_devices_client
  ON biometric_devices (client_id);
