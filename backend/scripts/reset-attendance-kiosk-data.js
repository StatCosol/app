const { Client } = require('pg');

const execute = process.argv.includes('--execute');

const config = {
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  ssl:
    String(process.env.DB_SSL || '').toLowerCase() === 'true'
      ? { rejectUnauthorized: false }
      : undefined,
};

const statements = [
  ['kiosk_enroll_tickets', `DELETE FROM kiosk_enroll_tickets`],
  [
    'contractor_face_reenrollment_requests',
    `DELETE FROM contractor_face_reenrollment_requests`,
  ],
  ['face_reenrollment_requests', `DELETE FROM face_reenrollment_requests`],
  [
    'contractor_face_enrollment_history',
    `DELETE FROM contractor_face_enrollment_history`,
  ],
  ['face_enrollment_history', `DELETE FROM face_enrollment_history`],
  ['contractor_face_enrollments', `DELETE FROM contractor_face_enrollments`],
  ['face_enrollments', `DELETE FROM face_enrollments`],
  ['face_duplicate_attempt_logs', `DELETE FROM face_duplicate_attempt_logs`],
  ['face_failed_scan_logs', `DELETE FROM face_failed_scan_logs`],
  ['face_liveness_nonces', `DELETE FROM face_liveness_nonces`],
  ['contractor_biometric_punches', `DELETE FROM contractor_biometric_punches`],
  ['biometric_punches', `DELETE FROM biometric_punches`],
  ['attendance_records', `DELETE FROM attendance_records`],
  [
    'mobile_attendance_devices_kiosk',
    `DELETE FROM mobile_attendance_devices WHERE mode = 'KIOSK'`,
  ],
];

async function safeDelete(client, label, sql) {
  const exists = await client.query(`SELECT to_regclass($1) AS name`, [
    label === 'mobile_attendance_devices_kiosk'
      ? 'mobile_attendance_devices'
      : label,
  ]);
  if (!exists.rows[0]?.name) {
    return { label, skipped: true, count: 0 };
  }
  const res = await client.query(sql);
  return { label, skipped: false, count: res.rowCount || 0 };
}

async function main() {
  for (const key of ['host', 'user', 'password', 'database']) {
    if (!config[key]) throw new Error(`Missing DB ${key}`);
  }
  if (!execute) {
    console.log(
      'Dry run only. Re-run with --execute to delete attendance/kiosk data.',
    );
    console.log(statements.map(([label]) => label).join('\n'));
    return;
  }

  const client = new Client(config);
  await client.connect();
  const results = [];
  try {
    await client.query('BEGIN');
    for (const [label, sql] of statements) {
      results.push(await safeDelete(client, label, sql));
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    await client.end();
  }

  for (const r of results) {
    console.log(`${r.label}: ${r.skipped ? 'skipped' : r.count}`);
  }
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
