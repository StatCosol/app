/** Minimal FaceDesk V2 reset for production container exec (uses process.env DB_*). */
import pg from 'pg';

const client = new pg.Client({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  ssl:
    String(process.env.DB_SSL || '').toLowerCase() === 'true'
      ? { rejectUnauthorized: false }
      : undefined,
});

const tables = [
  'facedesk_attendance_review_queue',
  'facedesk_manual_attendance_corrections',
  'facedesk_attendance_logs',
  'facedesk_attendance_failed_attempts',
  'facedesk_face_duplicate_alerts',
  'facedesk_enroll_tickets',
  'facedesk_device_sync_logs',
  'facedesk_day_reviews',
  'facedesk_audit_logs',
  'facedesk_employee_face_profiles',
];

await client.connect();
const before = await client.query(`
  SELECT
    (SELECT COUNT(*)::int FROM facedesk_employee_face_profiles) AS profiles,
    (SELECT COUNT(*)::int FROM facedesk_attendance_logs) AS attendance,
    (SELECT COUNT(*)::int FROM face_enrollments) AS ess_enrollments
`);
console.log('BEFORE', before.rows[0]);

await client.query('BEGIN');
try {
  for (const t of tables) {
    const r = await client.query(`DELETE FROM ${t}`);
    console.log(`${t}: ${r.rowCount ?? 0}`);
  }
  await client.query('COMMIT');
} catch (e) {
  await client.query('ROLLBACK');
  throw e;
}

const after = await client.query(`
  SELECT
    (SELECT COUNT(*)::int FROM facedesk_employee_face_profiles) AS profiles,
    (SELECT COUNT(*)::int FROM facedesk_attendance_logs) AS attendance,
    (SELECT COUNT(*)::int FROM face_enrollments) AS ess_enrollments
`);
console.log('AFTER', after.rows[0]);
await client.end();
