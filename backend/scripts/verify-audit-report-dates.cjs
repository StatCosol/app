// Run against an explicitly selected, disposable localhost PostgreSQL server.
// Temporary tables only; never loads application environment or connection data.
const assert = require('node:assert/strict');
const path = require('node:path');
const { Client } = require('pg');
require('ts-node').register({ transpileOnly: true, project: path.join(__dirname, '../tsconfig.json') });
const { transitionGovernedReport } = require('../src/audits/report-governance');
const port = Number(process.env.AUDIT_REPORT_DATE_TEST_PORT);
if (!Number.isInteger(port) || port < 1024 || port === 5432) {
  throw new Error('Set AUDIT_REPORT_DATE_TEST_PORT to a disposable local server port');
}
const db = new Client({ host: '127.0.0.1', port, user: 'audit_date_test', database: 'postgres', connectionTimeoutMillis: 5000 });
let passed = 0;
async function main() {
  await db.connect();
  await db.query('BEGIN');
  await db.query(`CREATE TEMP TABLE audit_reports (
    id text PRIMARY KEY, status text, held_at timestamptz,
    approved_by_user_id text, approved_date date, published_date date,
    finalized_at timestamptz, updated_at timestamptz)`);
  // Execute the actual conditional UPDATE. Replace only the database clock in
  // this test adapter so both sides of midnight are deterministic.
  let instant;
  const source = { query: async (sql, params) => {
    const clockParameter = `$${params.length + 1}::timestamptz`;
    return (await db.query(sql.replace(/NOW\(\)/g, clockParameter), [...params, instant])).rows;
  }};
  for (const zone of ['UTC', 'America/Los_Angeles', 'Asia/Kolkata']) {
    await db.query("SELECT set_config('TimeZone', $1, true)", [zone]);
    for (const [at, date] of [
      ['2026-11-16T18:29:59Z', '2026-11-16'],
      ['2026-11-16T18:30:00Z', '2026-11-17'],
      ['2026-12-31T18:30:00Z', '2027-01-01'],
      ['2028-02-28T18:30:00Z', '2028-02-29'],
    ]) {
      instant = at;
      for (const publish of ['publishCrm', 'publishAdmin']) {
        await db.query('TRUNCATE audit_reports');
        await db.query("INSERT INTO audit_reports (id,status,finalized_at) VALUES ('test','SUBMITTED',$1)", [at]);
        await transitionGovernedReport(source, { id: 'test', status: 'SUBMITTED' }, 'approve', 'test-reviewer');
        await transitionGovernedReport(source, { id: 'test', status: 'APPROVED' }, publish);
        const { rows: [row] } = await db.query(`SELECT status, approved_by_user_id,
          approved_date::text, published_date::text,
          (finalized_at AT TIME ZONE 'Asia/Kolkata')::date::text AS finalized_date
          FROM audit_reports`);
        assert.deepEqual(row, { status: 'PUBLISHED', approved_by_user_id: 'test-reviewer', approved_date: date, published_date: date, finalized_date: date });
        passed++;
      }
    }
  }
  for (const action of ['approve', 'publishCrm', 'publishAdmin']) {
    const status = action === 'approve' ? 'SUBMITTED' : 'APPROVED';
    await db.query('TRUNCATE audit_reports');
    await db.query("INSERT INTO audit_reports (id,status,held_at) VALUES ('test',$1,NOW())", [status]);
    await assert.rejects(() => transitionGovernedReport(source, { id: 'test', status }, action), /Report changed/);
    assert.equal((await db.query('SELECT status FROM audit_reports')).rows[0].status, status);
    await db.query("UPDATE audit_reports SET held_at=NULL,status='DRAFT'");
    await assert.rejects(() => transitionGovernedReport(source, { id: 'test', status }, action), /Report changed/);
    assert.equal((await db.query('SELECT status FROM audit_reports')).rows[0].status, 'DRAFT');
    passed += 2;
  }
  await db.query('ROLLBACK');
  console.log(`${passed} audit report date/transition checks passed; temporary fixtures rolled back.`);
}
main().catch(async error => { console.error(error.message); process.exitCode = 1; await db.query('ROLLBACK').catch(() => {}); }).finally(() => db.end());
