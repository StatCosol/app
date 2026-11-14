/* Synthetic local/CI database only. No application environment is loaded. */
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Client } = require('pg');
require('ts-node/register/transpile-only');
const { CrmComplianceTrackerController } = require('../src/crm/crm-compliance-tracker.controller');
const { actualAuditSql } = require('../src/common/actual-records');

async function main() {
  const url = process.env.AUDIT_CLOSURES_TEST_URL;
  if (!url || !['localhost', '127.0.0.1'].includes(new URL(url).hostname))
    throw new Error('AUDIT_CLOSURES_TEST_URL must identify an isolated local PostgreSQL instance');
  const db = new Client({ connectionString: url });
  await db.connect();
  try {
    await db.query('BEGIN');
    await db.query(`CREATE TEMP TABLE clients(id uuid PRIMARY KEY, client_name text);
      CREATE TEMP TABLE client_branches(id uuid PRIMARY KEY, branchname text);
      CREATE TEMP TABLE users(id uuid PRIMARY KEY, name text);
      CREATE TEMP TABLE client_assignments_current(client_id uuid, assigned_to_user_id uuid, assignment_type text);
      CREATE TEMP TABLE audits(id uuid PRIMARY KEY, client_id uuid, branch_id uuid, contractor_user_id uuid, notes text, audit_code text, audit_type text, status text);
      CREATE TEMP TABLE audit_observations(id uuid PRIMARY KEY, audit_id uuid, observation text, risk text, status text);`);
    const crm = randomUUID(), otherCrm = randomUUID(), client = randomUUID(), otherClient = randomUUID(), branch = randomUUID();
    const legacyBranch = '94ad1c42-ea05-460e-b494-0a7e634de127';
    await db.query('INSERT INTO clients VALUES($1,$2),($3,$4)', [client, 'Synthetic client A', otherClient, 'Synthetic client B']);
    await db.query('INSERT INTO client_branches VALUES($1,$2),($3,$4)', [branch, 'Synthetic unit', legacyBranch, 'Legacy fixture unit']);
    await db.query("INSERT INTO client_assignments_current VALUES($1,$2,'CRM'),($3,$4,'CRM'),($3,$2,'AUDITOR')", [client, crm, otherClient, otherCrm]);
    const audits = [
      ['mixed', client, branch, 'Actual audit with a test certificate', 'AUD-2099-real', 'IN_PROGRESS'],
      ['test-audit', client, branch, 'TEST ONLY synthetic', 'AUD-test', 'IN_PROGRESS'],
      ['legacy', client, legacyBranch, null, 'AX-2099-48EF3CF2FE89', 'IN_PROGRESS'],
      ['same-code-other-branch', client, branch, null, 'AX-2099-48EF3CF2FE89', 'COMPLETED'],
      ['test-observations-only', client, branch, null, 'AUD-fixtures', 'IN_PROGRESS'],
      ['unassigned', otherClient, branch, null, 'AUD-other', 'IN_PROGRESS'],
      ['cancelled', client, branch, null, 'AUD-cancelled', 'CANCELLED'],
      ['empty', client, branch, null, 'AUD-empty', 'PLANNED'],
    ].map(([label, ...values]) => ({ label, id: randomUUID(), values }));
    for (const audit of audits) {
      const [c, b, notes, code, status] = audit.values;
      await db.query('INSERT INTO audits VALUES($1,$2,$3,NULL,$4,$5,$6,$7)', [audit.id, c, b, notes, code, 'CONTRACTOR', status]);
    }
    const add = async (label, text, risk, status) => db.query('INSERT INTO audit_observations VALUES($1,$2,$3,$4,$5)', [randomUUID(), audits.find(a => a.label === label).id, text, risk, status]);
    await add('mixed', 'Test certificate is missing', 'HIGH', 'OPEN');
    await add('mixed', 'Actual issue corrected', 'LOW', 'CLOSED');
    await add('mixed', 'TEST ONLY hidden critical', 'CRITICAL', 'OPEN');
    await add('mixed', 'TEST-BRANCH-UI-20261026 Synthetic correction workflow check', 'HIGH', 'RESOLVED');
    for (const label of ['test-audit', 'legacy', 'same-code-other-branch', 'unassigned', 'cancelled'])
      await add(label, 'Observation', 'LOW', 'OPEN');
    await add('test-observations-only', 'SYNTHETIC TEST ONLY hidden', 'CRITICAL', 'OPEN');
    const snapshot = async () => (await db.query(`SELECT json_build_object('audits',(SELECT json_agg(a ORDER BY id) FROM audits a),'observations',(SELECT json_agg(o ORDER BY id) FROM audit_observations o)) AS data`)).rows[0].data;
    const before = await snapshot();
    // The CRM queue applies this same predicate before count/pagination. Future
    // periods and identical codes outside the verified fixture branch remain real.
    const queue = async test => (await db.query(`SELECT id FROM audits a WHERE client_id = $1 AND ${test ? 'NOT ' : ''}${actualAuditSql('a')} ORDER BY id`, [client])).rows.map(r => r.id);
    const testIds = audits.filter(a => ['test-audit', 'legacy'].includes(a.label)).map(a => a.id).sort();
    const actualIds = audits.filter(a => !['test-audit', 'legacy', 'unassigned'].includes(a.label)).map(a => a.id).sort();
    assert.deepEqual(await queue(true), testIds);
    assert.deepEqual(await queue(false), actualIds);
    const controller = new CrmComplianceTrackerController({ many: async (sql, params) => (await db.query(sql, params)).rows }, {});
    const list = async (who, filter = {}) => (await controller.auditClosures({ id: who }, filter)).data;
    const rows = await list(crm);
    assert.deepEqual(rows.map(r => r.auditId).sort(), audits.filter(a => ['mixed', 'same-code-other-branch'].includes(a.label)).map(a => a.id).sort());
    const mixed = rows.find(r => r.auditCode === 'AUD-2099-real');
    assert.deepEqual([mixed.criticalOpen,mixed.majorOpen,mixed.minorOpen,mixed.totalObservations,mixed.closedObservations,mixed.closurePct], ['0','1','0','2','1',50]);
    assert.deepEqual(await list(crm, { clientId: client }), rows);
    assert.deepEqual(await list(crm, { clientId: otherClient }), []);
    assert.deepEqual(await list(randomUUID()), []);
    assert.deepEqual((await list(otherCrm)).map(r => r.auditId), [audits.find(a => a.label === 'unassigned').id]);
    assert.deepEqual(await snapshot(), before, 'List queries must preserve all historical records');
    console.log('PASS: CRM actual/test queue separation, closure fixture exclusions, mixed observation counts/percentage, client/role isolation, cancelled/empty audits and unchanged history.');
  } finally {
    await db.query('ROLLBACK');
    await db.end();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
