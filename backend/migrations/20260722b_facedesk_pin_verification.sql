-- FaceDesk V2: PIN-then-face 1:1 verification.
--
-- Adds an optional per-employee attendance PIN (hashed) and a per-client
-- identification mode. When a client runs in PIN_THEN_FACE mode, the kiosk
-- asks the employee for their code + PIN first, then the face is verified
-- 1:1 against only that employee's template — no roster-wide 1:N scan, which
-- removes the MULTIPLE_MATCH ambiguity and cross-employee false matches.
-- Idempotent.

-- Per-employee attendance PIN (bcrypt hash; never stored in plaintext).
ALTER TABLE facedesk_employee_face_profiles
  ADD COLUMN IF NOT EXISTS attendance_pin_hash text,
  ADD COLUMN IF NOT EXISTS attendance_pin_set_at timestamptz;

-- Per-client identification mode: FACE_ONLY (existing 1:N) or PIN_THEN_FACE (1:1).
ALTER TABLE facedesk_face_settings
  ADD COLUMN IF NOT EXISTS identification_mode varchar(20) NOT NULL DEFAULT 'FACE_ONLY';
