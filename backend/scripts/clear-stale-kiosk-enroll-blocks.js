const path = require('path');
const { Client } = require('pg');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const execute = process.argv.includes('--execute');
const codes = process.argv
  .slice(2)
  .filter((s) => s !== '--execute')
  .map((s) => s.trim())
  .filter(Boolean);

if (!codes.length) {
  console.error('Usage: node scripts/clear-stale-kiosk-enroll-blocks.js EMP_CODE... [--execute]');
  process.exit(1);
}

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

async function main() {
  const client = new Client(config);
  await client.connect();
  try {
    console.log(`Mode: ${execute ? 'EXECUTE' : 'DRY RUN'}`);
    console.log(`Database: ${config.host}/${config.database}`);
    console.log(`Codes: ${codes.join(', ')}`);

    // Case 1: ticket has pending_embedding but NO face_enrollment row exists.
    // These were created when auto-approve wrote the embedding but then crashed
    // before marking the ticket COMPLETED (pre-transaction-fix race).
    const missingEnrollment = await client.query(
      `SELECT kt.id, kt.subject_code, kt.subject_name, kt.status, kt.created_at,
              kt.captured_at, kt.reviewed_at, kt.completed_at,
              octet_length(kt.pending_embedding) AS emb_len,
              'no_face_enrollment_row' AS reason
         FROM kiosk_enroll_tickets kt
         JOIN employees e ON e.id = kt.employee_id
    LEFT JOIN face_enrollments fe ON fe.employee_id = e.id
        WHERE e.employee_code = ANY($1)
          AND kt.subject_type = 'EMPLOYEE'
          AND kt.status IN ('REVIEW_PENDING', 'COMPLETED')
          AND kt.pending_embedding IS NOT NULL
          AND fe.employee_id IS NULL
        ORDER BY kt.created_at DESC`,
      [codes],
    );

    // Case 2: ticket is stuck in REVIEW_PENDING but the face_enrollment row
    // already exists and is active. This happens when the enrollment write
    // succeeded but the ticket status update failed (pre-transaction-fix race).
    const enrolledButStuck = await client.query(
      `SELECT kt.id, kt.subject_code, kt.subject_name, kt.status, kt.created_at,
              kt.captured_at, kt.reviewed_at, kt.completed_at,
              octet_length(kt.pending_embedding) AS emb_len,
              'enrollment_exists_ticket_stuck' AS reason
         FROM kiosk_enroll_tickets kt
         JOIN employees e ON e.id = kt.employee_id
         JOIN face_enrollments fe ON fe.employee_id = e.id AND fe.is_active = true
        WHERE e.employee_code = ANY($1)
          AND kt.subject_type = 'EMPLOYEE'
          AND kt.status = 'REVIEW_PENDING'
        ORDER BY kt.created_at DESC`,
      [codes],
    );

    const allRows = [...missingEnrollment.rows, ...enrolledButStuck.rows];
    // Deduplicate by id in case a ticket matches both queries somehow
    const byId = Object.fromEntries(allRows.map((r) => [r.id, r]));
    const unique = Object.values(byId);

    console.log('\nStale / ghost kiosk tickets:');
    console.log(JSON.stringify(unique, null, 2));
    console.log(`\nTotal: ${unique.length}`);

    if (!execute) {
      console.log('\nDry run only. Re-run with --execute to clear these stale ticket embeddings.');
      return;
    }

    if (!unique.length) {
      console.log('\nNothing to clear.');
      return;
    }

    await client.query('BEGIN');
    try {
      const ids = unique.map((r) => r.id);

      // For REVIEW_PENDING ghosts where enrollment exists: mark COMPLETED so
      // they stop appearing in duplicate scans.
      const stuckIds = enrolledButStuck.rows
        .filter((r) => !missingEnrollment.rows.find((m) => m.id === r.id))
        .map((r) => r.id);
      if (stuckIds.length) {
        const res = await client.query(
          `UPDATE kiosk_enroll_tickets
              SET status = 'COMPLETED',
                  completed_at = COALESCE(completed_at, now()),
                  reviewed_at  = COALESCE(reviewed_at,  now()),
                  pending_embedding = NULL,
                  notes = concat_ws(E'\n', notes,
                    'Completed by stale-block cleanup: enrollment row existed, ticket was stuck in REVIEW_PENDING')
            WHERE id = ANY($1)
              AND status = 'REVIEW_PENDING'`,
          [stuckIds],
        );
        console.log(`\nMarked COMPLETED (enrollment existed, ticket stuck): ${res.rowCount}`);
      }

      // For tickets with no enrollment row: cancel them entirely.
      const cancelIds = ids.filter((id) => !stuckIds.includes(id));
      if (cancelIds.length) {
        const res = await client.query(
          `UPDATE kiosk_enroll_tickets
              SET status = 'CANCELLED',
                  cancelled_at = now(),
                  pending_embedding = NULL,
                  notes = concat_ws(E'\n', notes,
                    'Cancelled by stale-block cleanup: no face_enrollment row found')
            WHERE id = ANY($1)`,
          [cancelIds],
        );
        console.log(`\nCancelled (no enrollment row): ${res.rowCount}`);
      }

      await client.query('COMMIT');
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
