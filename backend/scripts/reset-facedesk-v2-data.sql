-- FaceDesk V2 data reset (ESS / legacy tables untouched)
--
-- PREFER scripts/reset-facedesk-v2-data.mjs. It counts before it deletes, is a
-- dry run unless you pass --execute, takes --client-id, and drops the client's
-- Azure Large Face List first so no orphan faces are left behind. This file
-- cannot do any of that. It exists for the case where you have psql and nothing
-- else.
--
-- Run with psql and pass the client explicitly:
--   psql "$DATABASE_URL" -v client_id="'<uuid>'" -f reset-facedesk-v2-data.sql
--
-- The :client_id references below are deliberate: psql aborts with "client_id is
-- not defined" if you forget the -v, rather than quietly wiping every client on
-- the instance. To reset ALL clients you have to mean it — see the note at the
-- bottom.
--
-- Keeps: facedesk_kiosk_devices, facedesk_face_settings
-- Does NOT purge Azure. Run the .mjs, or delete each Large Face List by hand,
-- or the face lists keep faces whose profile rows no longer exist.

\set ON_ERROR_STOP on

BEGIN;

-- Look before you delete.
SELECT 'profiles'   AS table, COUNT(*) FROM facedesk_employee_face_profiles WHERE client_id = :client_id
UNION ALL SELECT 'attendance', COUNT(*) FROM facedesk_attendance_logs        WHERE client_id = :client_id
UNION ALL SELECT 'review',     COUNT(*) FROM facedesk_attendance_review_queue WHERE client_id = :client_id;

DELETE FROM facedesk_attendance_review_queue        WHERE client_id = :client_id;
DELETE FROM facedesk_manual_attendance_corrections  WHERE client_id = :client_id;
DELETE FROM facedesk_attendance_logs                WHERE client_id = :client_id;
DELETE FROM facedesk_attendance_failed_attempts     WHERE client_id = :client_id;
DELETE FROM facedesk_face_duplicate_alerts          WHERE client_id = :client_id;
DELETE FROM facedesk_enroll_tickets                 WHERE client_id = :client_id;
DELETE FROM facedesk_device_sync_logs               WHERE client_id = :client_id;
DELETE FROM facedesk_day_reviews                    WHERE client_id = :client_id;
DELETE FROM facedesk_audit_logs                     WHERE client_id = :client_id;
DELETE FROM facedesk_employee_face_profiles         WHERE client_id = :client_id; -- cascades samples

-- Inspect the counts above, then:
COMMIT;
-- ...or ROLLBACK; if they are not what you expected.

-- Verify ESS untouched:
-- SELECT COUNT(*) FROM face_enrollments;
-- SELECT COUNT(*) FROM mobile_attendance_punches;

-- Every client at once: use the .mjs with --execute and no --client-id. It
-- prints per-table counts and names the clients first. Stripping the WHERE
-- clauses out of this file gives you the same DELETEs with none of that.
