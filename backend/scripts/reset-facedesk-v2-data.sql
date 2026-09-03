-- FaceDesk V2 data reset (ESS / legacy tables untouched)
-- Run in a transaction; review counts first.
--
-- Keeps: facedesk_kiosk_devices, facedesk_face_settings
-- Optional client scope: add AND client_id = '<uuid>' to each DELETE

BEGIN;

-- Optional: inspect counts
-- SELECT 'profiles', COUNT(*) FROM facedesk_employee_face_profiles
-- UNION ALL SELECT 'attendance', COUNT(*) FROM facedesk_attendance_logs
-- UNION ALL SELECT 'ess', COUNT(*) FROM face_enrollments;

DELETE FROM facedesk_attendance_review_queue;
DELETE FROM facedesk_manual_attendance_corrections;
DELETE FROM facedesk_attendance_logs;
DELETE FROM facedesk_attendance_failed_attempts;
DELETE FROM facedesk_face_duplicate_alerts;
DELETE FROM facedesk_enroll_tickets;
DELETE FROM facedesk_device_sync_logs;
DELETE FROM facedesk_day_reviews;
DELETE FROM facedesk_audit_logs;
DELETE FROM facedesk_employee_face_profiles; -- cascades samples

COMMIT;

-- Verify ESS untouched:
-- SELECT COUNT(*) FROM face_enrollments;
-- SELECT COUNT(*) FROM mobile_attendance_punches;
