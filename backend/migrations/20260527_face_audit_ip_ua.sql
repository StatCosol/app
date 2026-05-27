-- Roadmap #17: enrich face-attendance audit trail with client IP +
-- user agent. We already store evidence-level columns (lat/lng, scores,
-- photo URL); IP and UA round out "who/where/from-what-app" so admins
-- can investigate disputed punches without a separate access log.
--
-- face_failed_scan_logs already had `ip inet` (added 20260515); add
-- user_agent and align column name with the punch tables for symmetry.

ALTER TABLE biometric_punches
  ADD COLUMN IF NOT EXISTS capture_ip inet NULL,
  ADD COLUMN IF NOT EXISTS capture_user_agent text NULL;

ALTER TABLE contractor_biometric_punches
  ADD COLUMN IF NOT EXISTS capture_ip inet NULL,
  ADD COLUMN IF NOT EXISTS capture_user_agent text NULL;

ALTER TABLE face_failed_scan_logs
  ADD COLUMN IF NOT EXISTS user_agent text NULL;
