-- FaceDesk V2 data reset (ESS / legacy tables untouched)
--
-- PREFER scripts/reset-facedesk-v2-data.mjs. It counts before it deletes, is a
-- dry run unless you pass --execute, takes --client-id, and drops the client's
-- Azure Large Face List first so no orphan faces are left behind. This file
-- cannot do the Azure half. It exists for the case where you have psql and
-- nothing else.
--
-- Count what would be deleted (deletes nothing):
--   psql "$DATABASE_URL" -v client_id="'<uuid>'" -f reset-facedesk-v2-data.sql
--
-- Actually delete it:
--   psql "$DATABASE_URL" -v client_id="'<uuid>'" -v execute=yes -f reset-facedesk-v2-data.sql
--
-- Why counting and deleting are separate RUNS, not separate statements: under
-- -f, psql executes the whole file without stopping. An earlier version of this
-- script printed the counts, ran the DELETEs, and COMMITted in one pass, with a
-- comment inviting the operator to "inspect the counts above, then COMMIT". No
-- such pause existed and the ROLLBACK it offered was never reachable — a
-- mistaken but perfectly valid client UUID took that tenant's FaceDesk data with
-- it, while the script appeared to be asking permission. The dry run is now the
-- default, and deleting requires saying so, which matches --execute on the .mjs.
--
-- The :client_id references are deliberate: psql aborts with "client_id is not
-- defined" if you forget the -v, rather than quietly operating on every client.
--
-- Keeps: facedesk_kiosk_devices, facedesk_face_settings
-- Does NOT purge Azure. Run the .mjs, or delete each Large Face List by hand,
-- or the face lists keep faces whose profile rows no longer exist.

\set ON_ERROR_STOP on

\echo ''
\echo 'FaceDesk V2 rows for this client:'

SELECT 'profiles'   AS table, COUNT(*) FROM facedesk_employee_face_profiles   WHERE client_id = :client_id
UNION ALL SELECT 'attendance',  COUNT(*) FROM facedesk_attendance_logs        WHERE client_id = :client_id
UNION ALL SELECT 'review',      COUNT(*) FROM facedesk_attendance_review_queue WHERE client_id = :client_id
UNION ALL SELECT 'failed',      COUNT(*) FROM facedesk_attendance_failed_attempts WHERE client_id = :client_id
UNION ALL SELECT 'duplicates',  COUNT(*) FROM facedesk_face_duplicate_alerts  WHERE client_id = :client_id
UNION ALL SELECT 'day_reviews', COUNT(*) FROM facedesk_day_reviews            WHERE client_id = :client_id;

\if :{?execute}

\echo ''
\echo 'execute=yes given — deleting the rows counted above.'

BEGIN;

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

COMMIT;

\echo 'Deleted. Azure face lists are NOT purged — see the header.'

\else

\echo ''
\echo 'DRY RUN — nothing was deleted.'
\echo 'If the counts above are what you meant to remove, re-run with:  -v execute=yes'

\endif

-- Verify ESS untouched:
-- SELECT COUNT(*) FROM face_enrollments;
-- SELECT COUNT(*) FROM mobile_attendance_punches;

-- Every client at once: use the .mjs with --execute and no --client-id. It
-- prints per-table counts and names the clients first. Stripping the WHERE
-- clauses out of this file gives you the same DELETEs with none of that.
