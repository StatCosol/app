-- Azure Face API integration for FaceDesk duplicate detection.

ALTER TABLE facedesk_face_settings
  ADD COLUMN IF NOT EXISTS azure_face_list_id varchar(64);

ALTER TABLE facedesk_employee_face_profiles
  ADD COLUMN IF NOT EXISTS azure_persisted_face_id varchar(64);
