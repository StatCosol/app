const path = require('path');
const { Client } = require('pg');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const execute = process.argv.includes('--execute');

const enrolledCodes = [
  'VEIHAY0003',
  'VEIHAY0014',
  'VEIHAY0018',
  'VEIHAY0012',
  'VEIHAY0019',
  'VEIHAY0010',
  'VEIHAY0001',
  'VEIHAY0023',
  'VEIHAY0006',
];

const pendingCodes = [
  'VEIHAY0002',
  'VEIHAY0021',
  'VEIHAY0004',
  'VEIHAY0009',
  'VEIHAY0016',
  'VEIHAY0008',
  'VEIHAY0022',
  'VEIHAY0020',
  'VEIHAY0007',
  'VEIHAY0011',
  'VEIHAY0017',
  'VEIHAY0005',
  'VEIHAY0024',
  'VEIHAY0013',
];

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

async function tableExists(client, table) {
  const res = await client.query('SELECT to_regclass($1) AS name', [
    `public.${table}`,
  ]);
  return Boolean(res.rows[0]?.name);
}

async function queryIfTable(client, table, sql, params = []) {
  if (!(await tableExists(client, table))) return { rows: [], rowCount: 0 };
  return client.query(sql, params);
}

async function preview(client, label, table, sql, params = []) {
  const res = await queryIfTable(client, table, sql, params);
  console.log(`\n${label}: ${res.rows.length}`);
  console.log(JSON.stringify(res.rows, null, 2));
  return res.rows;
}

async function main() {
  for (const key of ['host', 'user', 'password', 'database']) {
    if (!config[key]) throw new Error(`Missing DB ${key}`);
  }

  const overlap = pendingCodes.filter((c) => enrolledCodes.includes(c));
  if (overlap.length) {
    throw new Error(
      `Safety stop: code present in both lists: ${overlap.join(', ')}`,
    );
  }

  const client = new Client(config);
  await client.connect();
  try {
    console.log(`Mode: ${execute ? 'EXECUTE' : 'DRY RUN'}`);
    console.log(`Database: ${config.host}/${config.database}`);
    console.log(`Pending target codes: ${pendingCodes.join(', ')}`);
    console.log(`Protected enrolled codes: ${enrolledCodes.join(', ')}`);

    const empRes = await client.query(
      `SELECT id, employee_code, name, client_id, branch_id, is_active
         FROM employees
        WHERE employee_code = ANY($1)
        ORDER BY employee_code`,
      [pendingCodes],
    );
    const employees = empRes.rows;
    const foundCodes = employees.map((e) => e.employee_code);
    const missing = pendingCodes.filter((c) => !foundCodes.includes(c));
    console.log(`\nPending employees found: ${employees.length}`);
    console.log(JSON.stringify(employees, null, 2));
    if (missing.length) {
      console.log(`Missing pending codes: ${missing.join(', ')}`);
    }

    const protectedRes = await client.query(
      `SELECT e.id, e.employee_code, e.name, fe.enrolled_at, fe.is_active
         FROM employees e
    LEFT JOIN face_enrollments fe ON fe.employee_id = e.id
        WHERE e.employee_code = ANY($1)
        ORDER BY e.employee_code`,
      [enrolledCodes],
    );
    console.log('\nProtected enrolled rows:');
    console.log(JSON.stringify(protectedRes.rows, null, 2));

    const pendingIds = employees.map((e) => e.id);
    if (!pendingIds.length) {
      console.log('\nNo pending employee ids found in this DB. Nothing to clean.');
      return;
    }

    await preview(
      client,
      'Pending rows currently in face_enrollments',
      'face_enrollments',
      `SELECT e.employee_code, e.name, fe.employee_id, fe.is_active,
              fe.enrolled_at, fe.deactivated_at, octet_length(fe.embedding) AS emb_len
         FROM face_enrollments fe
         JOIN employees e ON e.id = fe.employee_id
        WHERE fe.employee_id = ANY($1)
        ORDER BY e.employee_code`,
      [pendingIds],
    );

    await preview(
      client,
      'Kiosk tickets for pending employees',
      'kiosk_enroll_tickets',
      `SELECT kt.id, e.employee_code, kt.subject_name, kt.status, kt.created_at,
              kt.captured_at, kt.reviewed_at, kt.completed_at,
              octet_length(kt.pending_embedding) AS emb_len
         FROM kiosk_enroll_tickets kt
         JOIN employees e ON e.id = kt.employee_id
        WHERE kt.employee_id = ANY($1)
        ORDER BY kt.created_at DESC`,
      [pendingIds],
    );

    await preview(
      client,
      'Duplicate logs touching pending employees',
      'face_duplicate_attempt_logs',
      `SELECT id, attempting_employee_id, matched_employee_id,
              matched_contractor_employee_id, match_score, source, attempted_at
         FROM face_duplicate_attempt_logs
        WHERE attempting_employee_id = ANY($1)
           OR matched_employee_id = ANY($1)
        ORDER BY attempted_at DESC`,
      [pendingIds],
    );

    await preview(
      client,
      'Failed scan logs for pending employees',
      'face_failed_scan_logs',
      `SELECT id, employee_id, employee_code, reason, reason_detail, attempted_at
         FROM face_failed_scan_logs
        WHERE employee_id = ANY($1)
           OR employee_code = ANY($2)
        ORDER BY attempted_at DESC
        LIMIT 200`,
      [pendingIds, pendingCodes],
    );

    await preview(
      client,
      'Re-enrollment requests for pending employees',
      'face_reenrollment_requests',
      `SELECT id, employee_id, status, requested_at, reviewed_at, source,
              octet_length(embedding) AS emb_len
         FROM face_reenrollment_requests
        WHERE employee_id = ANY($1)
        ORDER BY requested_at DESC`,
      [pendingIds],
    );

    if (!execute) {
      console.log(
        '\nDry run only. Re-run with --execute to clear only pending-code stale face data.',
      );
      return;
    }

    await client.query('BEGIN');
    try {
      const deletedFailed = await queryIfTable(
        client,
        'face_failed_scan_logs',
        `DELETE FROM face_failed_scan_logs
          WHERE employee_id = ANY($1)
             OR employee_code = ANY($2)`,
        [pendingIds, pendingCodes],
      );

      const deletedDup = await queryIfTable(
        client,
        'face_duplicate_attempt_logs',
        `DELETE FROM face_duplicate_attempt_logs
          WHERE attempting_employee_id = ANY($1)
             OR matched_employee_id = ANY($1)`,
        [pendingIds],
      );

      const cancelledReenroll = await queryIfTable(
        client,
        'face_reenrollment_requests',
        `UPDATE face_reenrollment_requests
            SET status = 'CANCELLED',
                reviewed_at = COALESCE(reviewed_at, now()),
                review_notes = concat_ws(E'\n', review_notes, 'Cancelled during VEIHAY pending face cleanup'),
                embedding = NULL
          WHERE employee_id = ANY($1)
            AND status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')`,
        [pendingIds],
      );

      const cancelledTickets = await queryIfTable(
        client,
        'kiosk_enroll_tickets',
        `UPDATE kiosk_enroll_tickets
            SET status = CASE
                  WHEN status = 'PENDING' THEN 'CANCELLED'
                  WHEN status = 'REVIEW_PENDING' THEN 'CANCELLED'
                  ELSE status
                END,
                cancelled_at = CASE
                  WHEN status IN ('PENDING', 'REVIEW_PENDING') THEN now()
                  ELSE cancelled_at
                END,
                pending_embedding = NULL,
                notes = concat_ws(E'\n', notes, 'Cleared stale pending-code kiosk face data')
          WHERE employee_id = ANY($1)`,
        [pendingIds],
      );

      const deletedEnrollments = await queryIfTable(
        client,
        'face_enrollments',
        `DELETE FROM face_enrollments
          WHERE employee_id = ANY($1)`,
        [pendingIds],
      );

      await client.query('COMMIT');
      console.log('\nCleanup completed:');
      console.log(`face_failed_scan_logs deleted: ${deletedFailed.rowCount}`);
      console.log(`face_duplicate_attempt_logs deleted: ${deletedDup.rowCount}`);
      console.log(
        `face_reenrollment_requests cancelled/cleared: ${cancelledReenroll.rowCount}`,
      );
      console.log(
        `kiosk_enroll_tickets cancelled/cleared: ${cancelledTickets.rowCount}`,
      );
      console.log(
        `face_enrollments deleted for pending codes only: ${deletedEnrollments.rowCount}`,
      );
      console.log('Protected enrolled codes were not modified.');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
