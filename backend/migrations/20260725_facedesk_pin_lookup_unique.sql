-- FaceDesk: unique-PIN support.
-- bcrypt PIN hashes are unsearchable, so a deterministic keyed (HMAC) lookup
-- hash is stored alongside for two purposes:
--   1. enforce "no duplicate PINs" per client via a unique index, and
--   2. let the kiosk resolve a PIN-only punch with an indexed lookup instead of
--      scanning + bcrypt-comparing the whole branch roster.
-- Mirrored by the boot-time schema patch in backend/src/main.ts so the column
-- exists immediately on deploy.

ALTER TABLE facedesk_employee_face_profiles
  ADD COLUMN IF NOT EXISTS attendance_pin_lookup text;

CREATE UNIQUE INDEX IF NOT EXISTS ux_facedesk_pin_lookup
  ON facedesk_employee_face_profiles (client_id, attendance_pin_lookup)
  WHERE attendance_pin_lookup IS NOT NULL;
