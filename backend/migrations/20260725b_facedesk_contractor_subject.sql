-- FaceDesk: support enrolling contractors alongside employees.
-- The profile's employee_id has no FK, so it can hold either an employees.id
-- or a contractor_employees.id; subject_type disambiguates which. Mirrored by
-- the boot-time schema patch in backend/src/main.ts.

ALTER TABLE facedesk_employee_face_profiles
  ADD COLUMN IF NOT EXISTS subject_type varchar(20) NOT NULL DEFAULT 'EMPLOYEE';
