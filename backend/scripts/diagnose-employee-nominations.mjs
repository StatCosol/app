#!/usr/bin/env node
/**
 * Where did an employee's nominations go? Read-only.
 *
 *   node scripts/diagnose-employee-nominations.mjs --name "Nampally Kiran Kumar"
 *   node scripts/diagnose-employee-nominations.mjs --code SBS0001
 *
 * Runs inside a READ ONLY transaction and prints, for every employee record
 * matching the name or code:
 *   - the record (client, branch, active) — more than one means duplicates;
 *   - the ESS logins linked to it via users.employee_id — ESS saves a
 *     nomination against the LOGIN's employee record, the branch desk shows
 *     the record it opened, so a login linked to another record hides it;
 *   - every nomination on it: type, status, dates, client/branch, nominees.
 * The reading of each case is printed alongside. No nominee names are shown.
 */
import pg from 'pg';
import { config as loadEnv } from 'dotenv';

loadEnv();
const arg = (flag) => {
  const i = process.argv.indexOf(flag);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const name = arg('--name');
const code = arg('--code');
if (!name && !code) {
  console.error('Pass --name "<employee name>" or --code <employee code>');
  process.exit(2);
}

const client = new pg.Client({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'statcompy',
  ssl:
    String(process.env.DB_SSL || '').toLowerCase() === 'true' ||
    process.env.DB_SSL_CA_PATH
      ? { rejectUnauthorized: false }
      : undefined,
});

async function main() {
  await client.connect();
  try {
    await client.query('BEGIN TRANSACTION READ ONLY');
    const emps = (
      await client.query(
        `SELECT e.id, e.employee_code, e.name, e.client_id, e.branch_id,
                e.is_active, b.branchname AS branch_name
           FROM employees e
           LEFT JOIN client_branches b ON b.id = e.branch_id
          WHERE ($1::text IS NOT NULL AND e.name ILIKE '%' || $1 || '%')
             OR ($2::text IS NOT NULL AND e.employee_code = $2)
          ORDER BY e.name, e.employee_code`,
        [name ?? null, code ?? null],
      )
    ).rows;
    if (!emps.length) {
      console.log('No employee record matches.');
      return;
    }
    if (emps.length > 1)
      console.log(
        `NOTE: ${emps.length} employee records match — nominations saved on one are not shown on another.\n`,
      );

    for (const e of emps) {
      console.log(
        `EMPLOYEE ${e.employee_code} "${e.name}" id=${e.id} branch=${e.branch_name ?? e.branch_id ?? '-'} active=${e.is_active}`,
      );
      const logins = (
        await client.query(
          `SELECT u.id, u.email, u.is_active, r.code AS role
             FROM users u LEFT JOIN roles r ON r.id = u.role_id
            WHERE u.employee_id = $1`,
          [e.id],
        )
      ).rows;
      console.log(
        logins.length
          ? `  ESS logins linked: ${logins.map((u) => `${u.email} (${u.role}, active=${u.is_active})`).join('; ')}`
          : '  ESS logins linked: NONE — an ESS nomination by this person was saved on a different record, or they have no ESS login',
      );
      const noms = (
        await client.query(
          `SELECT n.id, n.nomination_type, n.status,
                  to_char(n.created_at AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD HH24:MI') AS created_ist,
                  to_char(n.submitted_at AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD HH24:MI') AS submitted_ist,
                  n.client_id, n.branch_id,
                  (SELECT count(*)::int FROM employee_nomination_members m WHERE m.nomination_id = n.id) AS nominees
             FROM employee_nominations n
            WHERE n.employee_id = $1
            ORDER BY n.created_at`,
          [e.id],
        )
      ).rows;
      if (!noms.length) console.log('  Nominations: none on this record');
      for (const n of noms) {
        const why = [];
        if (n.status === 'DRAFT')
          why.push('DRAFT — never submitted, so it is in no approvals queue');
        if (!n.nominees)
          why.push(
            n.created_ist < '2026-09-19'
              ? 'no nominees — saved while the pipe bug dropped them (#667); must be re-entered'
              : 'no nominees',
          );
        if (n.client_id && n.client_id !== e.client_id)
          why.push('nomination client differs from the employee client');
        if (n.branch_id && e.branch_id && n.branch_id !== e.branch_id)
          why.push('nomination branch differs from the employee branch (moved?) — a branch desk of the new branch will not see it pending');
        console.log(
          `  NOMINATION ${n.nomination_type} ${n.status} created=${n.created_ist} submitted=${n.submitted_ist ?? '-'} nominees=${n.nominees} id=${n.id}` +
            (why.length ? `\n    -> ${why.join('\n    -> ')}` : ''),
        );
      }
      console.log('');
    }

    // ESS logins whose own name matches but are linked to some other record.
    if (name) {
      const stray = (
        await client.query(
          `SELECT u.email, u.employee_id, e2.employee_code AS linked_code, e2.name AS linked_name
             FROM users u
             LEFT JOIN employees e2 ON e2.id = u.employee_id
            WHERE u.name ILIKE '%' || $1 || '%'
              AND (u.employee_id IS NULL OR NOT (u.employee_id = ANY($2::uuid[])))`,
          [name, emps.map((e) => e.id)],
        )
      ).rows;
      for (const s of stray)
        console.log(
          `LOGIN ${s.email} carries this name but is linked to ${s.employee_id ? `${s.linked_code} "${s.linked_name}"` : 'NO employee record'} — its ESS nominations go there`,
        );
    }
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    await client.end();
  }
}

main().catch((err) => {
  console.error('Diagnosis failed:', err.message);
  process.exit(1);
});
