-- Phase 4c: server-issued, single-use liveness challenge nonces.
--
-- Replaces the previous client-asserted "challenge type + timestamp"
-- model (which was trivially forgeable by a tampered APK) with a
-- nonce-bound flow:
--   1. Device requests POST /mobile-attendance/liveness/challenge.
--   2. Server inserts a fresh row here with a random nonce + random
--      challenge_type + short TTL, returns them to the device.
--   3. Device performs the on-screen action then echoes the nonce on
--      its next punch.
--   4. Server validates+consumes the nonce in one atomic UPDATE; on
--      success the row is marked consumed and cannot be reused.
--
-- Storing both client_id and device_id lets us scope cleanup queries
-- and audit any abuse to a specific device install.

CREATE TABLE IF NOT EXISTS face_liveness_nonces (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id          uuid NOT NULL,
  device_id          uuid NOT NULL,
  employee_id        uuid NULL,
  nonce              text NOT NULL,
  challenge_type     text NOT NULL,
  expires_at         timestamptz NOT NULL,
  consumed_at        timestamptz NULL,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_face_liveness_nonces_nonce
  ON face_liveness_nonces (nonce);
CREATE INDEX IF NOT EXISTS ix_face_liveness_nonces_device
  ON face_liveness_nonces (device_id, consumed_at);
CREATE INDEX IF NOT EXISTS ix_face_liveness_nonces_expires
  ON face_liveness_nonces (expires_at);
