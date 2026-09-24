#!/usr/bin/env node
/**
 * Contractor workers registered more than once.
 *
 * The duplicate-registration check was dropped in June (#227) and restored in
 * this change, so files uploaded twice in between created every worker twice.
 * This finds those copies and, when asked, removes them.
 *
 * Two workers are the same person when they share an Aadhaar within a client,
 * or — with no Aadhaar — the same name under the same contractor at the same
 * branch.
 *
 * The record kept is the one whose face is enrolled, since that is what the
 * kiosk matches a punch to and re-enrolling a face is work on site. Where no
 * copy is enrolled, the oldest is kept, being the one attendance and payroll
 * are most likely to point at. Either way a copy that something already
 * references is left in place and reported rather than deleted.
 *
 *   node scripts/clean-duplicate-contractor-workers.cjs                 # report only
 *   node scripts/clean-duplicate-contractor-workers.cjs --client <uuid> # one client
 *   node scripts/clean-duplicate-contractor-workers.cjs --apply         # remove them
 *
 * Connection comes from DB_HOST/DB_PORT/DB_USER/DB_PASS/DB_NAME, as the app's.
 */
const { Client } = require('pg');

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const clientArg = args[args.indexOf('--client') + 1];
const clientId = args.includes('--client') ? clientArg : null;

/**
 * A face the kiosk can already match: FaceDesk, or the older mobile enrolment.
 *
 * Either module may not be installed, and a missing table cannot be guarded
 * inside the statement: PostgreSQL resolves every relation named in it while
 * parsing, long before a CASE branch is evaluated, so the query would fail
 * with "relation does not exist" whatever the guard said. The tables are
 * looked up first instead and the query built from the ones that are there.
 */
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

async function faceSourcesPresent(db) {
  const present = [];
  for (const source of FACE_SOURCES) {
    const { rows } = await db.query('SELECT to_regclass($1) IS NOT NULL AS present', [
      'public.' + source.table,
    ]);
    if (rows[0].present) present.push(source);
  }
  return present;
}

function groupsSql(present) {
  // No enrolment table at all: nobody is enrolled, and the oldest is kept.
  const faceEnrolled = present.length
    ? present.map((s) => s.exists).join('\n      OR ')
    : 'false';
  return `
  SELECT
    COALESCE(
      NULLIF(regexp_replace(COALESCE(ce.aadhaar, ''), '\\D', '', 'g'), ''),
      'name:' || ce.contractor_user_id || ':' || ce.branch_id || ':' ||
        lower(btrim(regexp_replace(ce.name, '\\s+', ' ', 'g')))
    ) AS person,
    ce.client_id,
    ce.id, ce.employee_code, ce.name, ce.branch_id, ce.created_at,
    ce.aadhaar, ce.pan, ce.bank_account, ce.punch_code,
    (
      ${faceEnrolled}
    ) AS face_enrolled
  FROM contractor_employees ce
  WHERE (ce.is_active IS TRUE OR ce.status IN ('ACTIVE', 'PENDING_DELETE'))
    AND ($1::uuid IS NULL OR ce.client_id = $1)
  ORDER BY ce.created_at ASC, ce.employee_code ASC
`;
}

/**
 * Anything pointing at this worker, so a copy in use is never deleted.
 *
 * Nothing holds a foreign key to contractor_employees, so the columns are
 * found by name: the id itself, and the worker's code within the same client
 * (punches, payroll and attendance all record the code rather than the id).
 */
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
  // A delete request names the worker by target_entity_id, which no column
  // name would reveal; deleting under it would strand the request.
  const { rows: approvals } = await db.query(
    `SELECT 1 FROM approval_requests
      WHERE target_entity_type = 'CONTRACTOR_EMPLOYEE'
        AND target_entity_id = $1::uuid LIMIT 1`,
    [worker.id],
  );
  if (approvals.length) found.push('approval_requests');
  if (!worker.employee_code) return found;
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
  return found;
}

(async () => {
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
    const present = await faceSourcesPresent(db);
    if (!present.length)
      console.log(
        'Neither enrolment table is installed here, so no face can be read. The oldest copy is kept instead.\n',
      );
    const { rows } = await db.query(groupsSql(present), [clientId]);
    const groups = new Map();
    for (const r of rows) {
      const key = r.client_id + '|' + r.person;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r);
    }
    const duplicated = [...groups.values()].filter((g) => g.length > 1);
    if (!duplicated.length) {
      console.log('No contractor worker is registered more than once.');
      return;
    }
    let removable = 0, referenced = 0, removed = 0, manyEnrolled = 0, enrolledKept = 0;
    console.log(`${duplicated.length} worker(s) registered more than once:\n`);
    for (const group of duplicated) {
      // The enrolled face wins; otherwise the oldest, the group already being
      // in registration order.
      const enrolled = group.filter((r) => r.face_enrolled);
      if (enrolled.length > 1) manyEnrolled++;
      const keep = enrolled[0] ?? group[0];
      const extras = group.filter((r) => r !== keep);
      const why = keep.face_enrolled
        ? 'face enrolled'
        : `registered ${keep.created_at.toISOString().slice(0, 10)}`;
      console.log(`${keep.name}  (keeping ${keep.employee_code || keep.id}, ${why})`);
      for (const extra of extras) {
        const refs = await referencesTo(db, extra);
        // Details the copy holds and the kept record does not: worth moving
        // over before the copy goes.
        const extraOnly = ['aadhaar', 'pan', 'bank_account', 'punch_code']
          .filter((f) => String(extra[f] ?? '').trim() && !String(keep[f] ?? '').trim());
        // Two enrolled faces for one person: removing either loses a face the
        // kiosk matches, so both stay and the office decides.
        if (extra.face_enrolled) {
          enrolledKept++;
          console.log(`   keep too: ${extra.employee_code || extra.id} — a face is enrolled against this one as well`);
          continue;
        }
        if (refs.length) {
          referenced++;
          console.log(`   keep too: ${extra.employee_code || extra.id} — referenced by ${refs.join(', ')}`);
          continue;
        }
        removable++;
        if (extraOnly.length)
          console.log(`   remove: ${extra.employee_code || extra.id} — first copy across ${extraOnly.join(', ')} from it`);
        else console.log(`   remove: ${extra.employee_code || extra.id}`);
        if (apply) {
          await db.query('DELETE FROM contractor_employees WHERE id = $1', [extra.id]);
          removed++;
        }
      }
    }
    console.log(
      `\n${removable} copy(ies) can be removed, ${referenced} left in place because something references them` +
        (enrolledKept ? `, ${enrolledKept} because a face is enrolled against them too` : '') +
        '.',
    );
    if (manyEnrolled)
      console.log(
        `${manyEnrolled} worker(s) carry an enrolled face on more than one record. Both are kept: the kiosk matches either, so remove one only after deciding which face to keep.`,
      );
    console.log(apply ? `${removed} removed.` : 'Nothing was changed. Re-run with --apply to remove them.');
  } finally {
    await db.end();
  }
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
