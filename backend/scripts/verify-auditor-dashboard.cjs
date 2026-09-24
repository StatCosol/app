// Build the backend first, then run with an installed @electric-sql/pglite
// module (optionally pass its absolute path as argv[2]). Uses only a fresh
// in-memory PostgreSQL database; never reads application connection settings.
const assert = require('node:assert/strict');
const { PGlite } = require(process.argv[2] || '@electric-sql/pglite');
const { AUDITOR_AUDITS_SQL, AUDITOR_SUMMARY_SQL } = require('../dist/src/auditor/sql/auditor-dashboard.sql');
const uuid = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

(async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE TABLE audits (id uuid, assigned_auditor_id uuid, client_id uuid,
        branch_id uuid, audit_type text, period_code text, due_date date,
        status text, score int, updated_at timestamp);
      CREATE TABLE clients (id uuid, client_name text);
      CREATE TABLE client_branches (id uuid, branchname text);
      CREATE TABLE audit_observations (audit_id uuid, status text, risk text);
    `);
    const statuses = ['PLANNED', 'ASSIGNED', 'IN_PROGRESS', 'CORRECTION_PENDING',
      'REVERIFICATION_PENDING', 'COMPLETED', 'SUBMITTED', 'CLOSED', 'CANCELLED'];
    const active = statuses.slice(0, 5);
    let serial = 100;
    // Every status has an overdue, today, within-window and boundary record.
    for (const status of statuses) {
      for (const days of [-1, 0, 29, 30]) {
        await db.query(`INSERT INTO audits VALUES ($1,$2,$3,NULL,'CONTRACTOR','2026-09',
          CURRENT_DATE + $4::int,$5,0,CURRENT_TIMESTAMP)`,
          [uuid(serial++), uuid(1), uuid(10), days, status]);
      }
    }
    // Foreign auditor must never appear; another client is included only
    // without a client filter. Null branches must not drop valid assignments.
    await db.query(`INSERT INTO audits VALUES
      ($1,$2,$3,NULL,'CONTRACTOR','2026-09',CURRENT_DATE,'PLANNED',0,CURRENT_TIMESTAMP),
      ($4,$5,$6,NULL,'CONTRACTOR','2026-09',CURRENT_DATE,'PLANNED',0,CURRENT_TIMESTAMP)`,
      [uuid(900), uuid(2), uuid(10), uuid(901), uuid(1), uuid(11)]);
    const rows = async (tab, client = uuid(10), from = null, to = null, limit = 500, offset = 0) =>
      (await db.query(AUDITOR_AUDITS_SQL, [uuid(1), client, from, to, 30, tab, limit, offset])).rows;
    const summary = (await db.query(AUDITOR_SUMMARY_SQL, [uuid(1), uuid(10), null, null, 30])).rows[0];
    const working = await rows('ACTIVE');
    assert.equal(working.length, 20);
    assert.deepEqual([...new Set(working.map(r => r.status))].sort(), [...active].sort());
    assert.ok(working.every(r => r.branchId === null));
    assert.equal((await rows('OVERDUE')).length, 5);
    assert.equal((await rows('DUE_SOON')).length, 10);
    assert.equal(Number(summary.assigned_audits_count), working.length);
    assert.equal(Number(summary.overdue_audits_count), 5);
    assert.equal(Number(summary.due_soon_audits_count), 10);
    const completed = await rows('COMPLETED');
    assert.equal(completed.length, 12);
    assert.deepEqual([...new Set(completed.map(r => r.status))].sort(), ['CLOSED', 'COMPLETED', 'SUBMITTED']);
    const allClients = await rows('ACTIVE', null);
    assert.equal(allClients.length, 21);
    assert.ok(!allClients.some(r => r.auditId === uuid(900)));
    assert.ok(allClients.some(r => r.auditId === uuid(901)));
    const today = (await db.query("SELECT CURRENT_DATE::text AS today")).rows[0].today;
    assert.equal((await rows('ACTIVE', uuid(10), today, today)).length, 5);
    const page = await rows('ACTIVE', uuid(10), null, null, 3, 0);
    assert.equal(page.length, 3);
    assert.equal((await rows('ACTIVE', uuid(10), null, null, 500, 20)).length, 0);
    console.log('PASS: audit workflow statuses, summary parity, deadline boundaries, null branches, auditor/client/date scope and pagination.');
  } finally {
    await db.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
