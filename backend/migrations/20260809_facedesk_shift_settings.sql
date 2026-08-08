-- Per-client shift bounds for FaceDesk late/early reports (HH:MM, 24h).
ALTER TABLE facedesk_face_settings
  ADD COLUMN IF NOT EXISTS shift_start_time varchar(5),
  ADD COLUMN IF NOT EXISTS shift_end_time varchar(5);

COMMENT ON COLUMN facedesk_face_settings.shift_start_time IS 'Late-coming threshold (HH:MM, client local). NULL → FD_SHIFT_START env default.';
COMMENT ON COLUMN facedesk_face_settings.shift_end_time IS 'Early-going threshold (HH:MM). NULL → FD_SHIFT_END env default.';
