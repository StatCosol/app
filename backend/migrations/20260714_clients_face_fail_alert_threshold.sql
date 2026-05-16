-- Per-client override for the face-failure spike detector threshold.
-- When NULL, the global env default (FACE_FAIL_ALERT_THRESHOLD, default 20)
-- applies. When set, the detector requires that many failures in the window
-- before raising an alert for that client.
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS face_fail_alert_threshold INT NULL;

COMMENT ON COLUMN clients.face_fail_alert_threshold IS
  'Per-client threshold for the face-failure spike detector. NULL = use env default.';
