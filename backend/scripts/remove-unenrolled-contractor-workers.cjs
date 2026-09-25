#!/usr/bin/env node
/**
 * Contractor workers with no face enrolled, for one contractor.
 *
 * A client who runs attendance entirely on the kiosk ends up with two kinds
 * of record: the workers they have enrolled, and rows from uploads that never
 * became real workers on site. This removes the second kind for one
 * contractor, on the client's instruction, once they have said which of the
 * unenrolled rows to keep.
 *
 * This deletes people, not duplicates: every row it removes is the only
 * record of that worker. So it is deliberately narrow.
 *
 *   --contractor <name>   required, exactly as it reads on the user record
 *   --keep <codes>        comma-separated employee codes to spare
 *   --apply               actually remove them; without it, nothing changes
 *
 * A worker is kept, whatever the flags say, when a face is enrolled against
 * them (FaceDesk or the older mobile enrolment), and when anything else in
 * the database references them — a punch, a payroll line, an approval. Those
 * are reported instead, because deleting them would strand the record that
 * points at them.
 *
 * Connection comes from DB_HOST/DB_PORT/DB_USER/DB_PASS/DB_NAME, as the app's.
 */
const { Client } = require('pg');

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const valueOf = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : null);
const contractor = valueOf('--contractor');
const keepCodes = String(valueOf('--keep') || '')
  .split(',')
  .map((c) => c.trim())
  .filter(Boolean);

// Same two enrolment sources the duplicate cleanup reads, and the same reason
// for looking them up separately: a relation named in the statement is
// resolved while parsing, so a missing table cannot be guarded inside it.
const FACE_SOURCES = [
  {
    table: 'facedesk_employee_face_profiles',
    exists: `EXISTS (
        SELECT 1 FROM facedesk_employee_face_profiles p
         WHERE p.employee_id = ce.id AND p.subject_type = 'CONTRACTOR'
           AND p.enrollment_status = 'ENROLLED')`,
  },
  {
    table: 'contractor_face_enrollments',
    exists: `EXISTS (
        SELECT 1 FROM contractor_face_enrollments e
         WHERE e.contractor_employee_id = ce.id AND e.is_active IS TRUE)`,
  },
];

async function faceEnrolledSql(db) {
  const present = [];
  for (const source of FACE_SOURCES) {
    const { rows } = await db.query('SELECT to_regclass($1) IS NOT NULL AS present', [
      'public.' + source.table,
    ]);
    if (rows[0].present) present.push(source.exists);
  }
  return present.length ? present.join('\n      OR ') : 'false';
}

async function referencesTo(db, worker) {
  const { rows: byId } = await db.query(
    `SELECT table_name, column_name
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND column_name LIKE '%contractor_employee_id'
        AND table_name <> 'contractor_employees'`,
  );
  const found = [];
  for (const r of byId) {
    const { rows: hit } = await db.query(
      `SELECT 1 FROM "${r.table_name}" WHERE "${r.column_name}" = $1 LIMIT 1`,
      [worker.id],
    );
    if (hit.length) found.push(r.table_name);
  }
  const { rows: approvals } = await db.query(
    `SELECT 1 FROM approval_requests
      WHERE target_entity_type = 'CONTRACTOR_EMPLOYEE'
        AND target_entity_id = $1::uuid LIMIT 1`,
    [worker.id],
  );
  if (approvals.length) found.push('approval_requests');
  // FaceDesk names a worker by a polymorphic employee_id rather than a
  // contractor_employee_id, so the scan above cannot see its profiles,
  // samples, attendance logs, reviews or corrections. A worker whose profile
  // is BLOCKED or DEACTIVATED reads as unenrolled and would otherwise be
  // deleted, leaving that face data — and the punches behind it — pointing at
  // a worker who no longer exists. Only tables that qualify the id by
  // subject_type, or FaceDesk's own, are read this way: an employee_id
  // elsewhere belongs to the permanent employees table, not to this worker.
  const { rows: polymorphic } = await db.query(
    `SELECT c.table_name,
            EXISTS (
              SELECT 1 FROM information_schema.columns s
               WHERE s.table_schema = c.table_schema AND s.table_name = c.table_name
                 AND s.column_name = 'subject_type') AS has_subject
       FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.column_name = 'employee_id'
        AND (c.table_name LIKE 'facedesk%'
             OR EXISTS (
               SELECT 1 FROM information_schema.columns s
                WHERE s.table_schema = c.table_schema AND s.table_name = c.table_name
                  AND s.column_name = 'subject_type'))`,
  );
  for (const r of polymorphic) {
    const { rows: hit } = await db.query(
      `SELECT 1 FROM "${r.table_name}"
        WHERE employee_id = $1${r.has_subject ? " AND subject_type = 'CONTRACTOR'" : ''}
        LIMIT 1`,
      [worker.id],
    );
    if (hit.length) found.push(r.table_name);
  }
  if (!worker.employee_code) return [...new Set(found)];
  const { rows: byCode } = await db.query(
    `SELECT c.table_name
       FROM information_schema.columns c
       JOIN information_schema.columns k
         ON k.table_schema = c.table_schema AND k.table_name = c.table_name
        AND k.column_name = 'client_id'
      WHERE c.table_schema = 'public' AND c.column_name = 'employee_code'
        AND c.table_name NOT IN ('contractor_employees', 'employees')`,
  );
  for (const r of byCode) {
    const { rows: hit } = await db.query(
      `SELECT 1 FROM "${r.table_name}" WHERE employee_code = $1 AND client_id = $2 LIMIT 1`,
      [worker.employee_code, worker.client_id],
    );
    if (hit.length) found.push(r.table_name);
  }
  return [...new Set(found)];
}

(async () => {
  if (!contractor) {
    console.error('Name the contractor: --contractor "<name>"');
    process.exit(1);
  }
  const db = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASS,
    database: process.env.DB_NAME || 'statcompy',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  });
  await db.connect();
  try {
    const { rows: users } = await db.query('SELECT id, name FROM users WHERE name = $1', [
      contractor,
    ]);
    if (users.length !== 1) {
      console.error(
        users.length
          ? `"${contractor}" matches ${users.length} users; the name must pick exactly one.`
          : `No user is named "${contractor}".`,
      );
      process.exit(1);
    }
    const enrolledSql = await faceEnrolledSql(db);
    const active = `(ce.is_active IS TRUE OR ce.status IN ('ACTIVE', 'PENDING_DELETE'))`;
    const { rows: all } = await db.query(
      `SELECT ce.id, ce.client_id, ce.employee_code, ce.name, ce.created_at,
              (${enrolledSql}) AS face_enrolled
         FROM contractor_employees ce
        WHERE ${active} AND ce.contractor_user_id = $1
        ORDER BY ce.employee_code ASC`,
      [users[0].id],
    );
    const enrolled = all.filter((w) => w.face_enrolled);
    const spared = all.filter((w) => !w.face_enrolled && keepCodes.includes(w.employee_code));
    const targets = all.filter(
      (w) => !w.face_enrolled && !keepCodes.includes(w.employee_code),
    );
    const missing = keepCodes.filter((c) => !all.some((w) => w.employee_code === c));

    console.log(`${contractor}: ${all.length} active worker(s)`);
    console.log(`  ${enrolled.length} with a face enrolled — kept`);
    console.log(`  ${spared.length} named on --keep — kept`);
    console.log(`  ${targets.length} with no face enrolled — to remove\n`);
    // A code on --keep that matches nobody is a typo or a stale value, and the
    // worker it was meant to spare is sitting in targets right now. Warning
    // and carrying on would delete exactly the person this flag exists to
    // protect, so nothing runs until the list is right.
    if (missing.length) {
      console.error(
        `--keep names ${missing.join(', ')}, which no active worker of this contractor holds.\n` +
          'Nothing has been read further. Correct the code — the worker it was meant to spare\n' +
          'is otherwise in the list to remove.',
      );
      process.exit(1);
    }

    let removed = 0;
    const blocked = [];
    const enrolledMeanwhile = [];
    for (const worker of targets) {
      const refs = await referencesTo(db, worker);
      if (refs.length) {
        blocked.push({ worker, refs });
        continue;
      }
      if (apply) {
        // The client enrols while this runs, and every worker ahead of this
        // one costs a dozen reference queries, so minutes can pass between
        // reading the list and reaching this row. Re-test enrolment as part
        // of the delete itself: a face enrolled in that window means the row
        // no longer matches and survives.
        const { rowCount } = await db.query(
          `DELETE FROM contractor_employees ce WHERE ce.id = $1 AND NOT (${enrolledSql})`,
          [worker.id],
        );
        if (!rowCount) {
          enrolledMeanwhile.push(worker);
          console.log(
            `   keep: ${worker.employee_code || worker.id} — ${worker.name} — a face was enrolled while this ran`,
          );
          continue;
        }
        removed++;
      }
      console.log(`   remove: ${worker.employee_code || worker.id} — ${worker.name}`);
    }
    for (const { worker, refs } of blocked)
      console.log(
        `   keep: ${worker.employee_code || worker.id} — ${worker.name} — referenced by ${refs.join(', ')}`,
      );
    console.log(
      `\n${targets.length - blocked.length - enrolledMeanwhile.length} can be removed, ` +
        `${blocked.length} left in place because something references them` +
        (enrolledMeanwhile.length
          ? `, ${enrolledMeanwhile.length} because a face was enrolled while this ran`
          : '') +
        '.',
    );
    console.log(apply ? `${removed} removed.` : 'Nothing was changed. Re-run with --apply to remove them.');
  } finally {
    await db.end();
  }
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
