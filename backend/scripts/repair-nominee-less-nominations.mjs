#!/usr/bin/env node
/**
 * Find — and on request repair — nominations left with no nominees by the
 * implicit-array-conversion bug (fixed in #667, live 2026-09-19).
 *
 * From 2026-05-09 the global validation pipe turned every nominee object into
 * `[]`. On the ESS side each nominee was then dropped for having no name and the
 * nomination saved anyway, SUBMITTED, possibly later APPROVED, with nobody
 * named. On the client/admin side the header saved and the nominee insert
 * failed, leaving a DRAFT with no nominees on every attempt. The nominee
 * details were never stored: they cannot be restored, only re-entered.
 *
 *   node scripts/repair-nominee-less-nominations.mjs            # dry run
 *   node scripts/repair-nominee-less-nominations.mjs --apply    # repair
 *
 * The dry run reads inside a READ ONLY transaction and prints counts and
 * nomination ids only — no names. --apply, in one transaction:
 *
 *   - SUBMITTED or APPROVED, no nominees → REJECTED with a reason that tells
 *     the employee what happened. ESS lets an employee resubmit a REJECTED
 *     nomination, and since the follow-up fix it cannot be resubmitted
 *     without a nominee. An approval of an empty nomination named nobody, so
 *     nothing valid is undone; approved_by / approved_at are kept for audit.
 *   - DRAFT with no nominees → left alone. The employee can still edit a
 *     draft, and cannot submit it empty any more.
 *
 * --delete-orphans additionally deletes client/admin-side DRAFTs with no
 * nominees that a later nomination of the same type, for the same employee,
 * WITH nominees has superseded — the debris of failed attempts. Off by default:
 * deletion is not reversible.
 */
import pg from 'pg';
import { config as loadEnv } from 'dotenv';

loadEnv();

const APPLY = process.argv.includes('--apply');
const DELETE_ORPHANS = process.argv.includes('--delete-orphans');
const WINDOW_START = '2026-05-09';
const REASON =
  'Your nominee details were not saved because of a system error ' +
  '(May–September 2026). Please add your nominees again and resubmit.';

if (DELETE_ORPHANS && !APPLY) {
  console.error('--delete-orphans only has an effect together with --apply');
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

const EMPTY = `NOT EXISTS (SELECT 1 FROM employee_nomination_members m
                            WHERE m.nomination_id = n.id)`;
const SUPERSEDED = `EXISTS (
  SELECT 1 FROM employee_nominations g
   WHERE g.employee_id = n.employee_id
     AND g.nomination_type = n.nomination_type
     AND g.created_at > n.created_at
     AND EXISTS (SELECT 1 FROM employee_nomination_members gm
                  WHERE gm.nomination_id = g.id))`;

async function survey() {
  const byStatus = await client.query(
    `SELECT n.status,
            CASE WHEN n.client_id IS NULL THEN 'client-admin' ELSE 'ess' END AS path,
            count(*)::int AS total,
            count(*) FILTER (WHERE ${EMPTY})::int AS no_nominees,
            count(*) FILTER (WHERE ${EMPTY} AND ${SUPERSEDED})::int AS no_nominees_superseded
       FROM employee_nominations n
      WHERE n.created_at >= $1
      GROUP BY 1, 2
      ORDER BY 2, 1`,
    [WINDOW_START],
  );
  const before = await client.query(
    `SELECT count(*)::int AS n FROM employee_nominations n
      WHERE n.created_at < $1 AND ${EMPTY}`,
    [WINDOW_START],
  );
  const affected = await client.query(
    `SELECT n.id, n.client_id, n.nomination_type, n.status,
            to_char(n.created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') AS created_ist,
            ${SUPERSEDED} AS superseded
       FROM employee_nominations n
      WHERE n.created_at >= $1 AND ${EMPTY}
      ORDER BY n.client_id NULLS FIRST, n.created_at`,
    [WINDOW_START],
  );
  const scopes = await client.query(
    `SELECT count(*)::int AS n FROM appraisal_cycle_scopes
      WHERE branch_id IS NULL AND department_id IS NULL
        AND designation_id IS NULL AND employment_type IS NULL`,
  );
  return {
    windowStart: WINDOW_START,
    byStatusAndPath: byStatus.rows,
    noNomineesBeforeWindow: before.rows[0].n,
    affected: affected.rows,
    appraisalScopesAllNull: scopes.rows[0].n,
  };
}

async function main() {
  await client.connect();
  try {
    await client.query(
      APPLY ? 'BEGIN' : 'BEGIN TRANSACTION READ ONLY',
    );
    const report = await survey();
    console.log(JSON.stringify({ mode: APPLY ? 'apply' : 'dry-run', ...report }, null, 2));

    if (!APPLY) {
      await client.query('ROLLBACK');
      console.log('\nDry run: nothing changed. Re-run with --apply to repair.');
      return;
    }

    const rejected = await client.query(
      `UPDATE employee_nominations n
          SET status = 'REJECTED',
              rejection_reason = $2,
              updated_at = now()
        WHERE n.created_at >= $1
          AND n.status IN ('SUBMITTED', 'APPROVED')
          AND ${EMPTY}
        RETURNING n.id`,
      [WINDOW_START, REASON],
    );
    let deleted = { rowCount: 0 };
    if (DELETE_ORPHANS) {
      deleted = await client.query(
        `DELETE FROM employee_nominations n
          WHERE n.created_at >= $1
            AND n.client_id IS NULL
            AND n.status = 'DRAFT'
            AND ${EMPTY}
            AND ${SUPERSEDED}
          RETURNING n.id`,
        [WINDOW_START],
      );
    }
    await client.query('COMMIT');
    console.log(
      JSON.stringify(
        {
          rejectedForResubmission: rejected.rowCount,
          orphanDraftsDeleted: deleted.rowCount,
        },
        null,
        2,
      ),
    );
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Nomination repair failed:', err.message);
  process.exit(1);
});
