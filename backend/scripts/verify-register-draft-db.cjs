// Disposable PostgreSQL regression for historical payroll/profile joins.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { integratedRegisterDraft } = require('../dist/src/payroll/register-library/register-integrated-draft');
module.exports = async function verifyRegisterDraft(source) {
  const ds = source.createQueryRunner();
  await ds.connect();
  try {
  await ds.query(`CREATE TEMP TABLE payroll_run_employees (id uuid, run_id uuid, client_id uuid, branch_id uuid, employee_id uuid);
    CREATE TEMP TABLE employees (id uuid, client_id uuid, branch_id uuid, approval_status text, date_of_birth date, gender text, father_name text);`);
  const clientId = randomUUID(), branchId = randomUUID(), runId = randomUUID();
  const rows = [];
  for (const kind of ['valid', 'other-branch', 'other-client', 'pending', 'unlinked']) {
    const id = randomUUID(), employeeId = randomUUID();
    await ds.query('INSERT INTO payroll_run_employees VALUES ($1,$2,$3,$4,$5)', [id, runId, clientId, branchId, kind === 'unlinked' ? null : employeeId]);
    await ds.query("INSERT INTO employees VALUES ($1,$2,$3,$4,'1990-01-01','MALE','Fictional parent')", [employeeId, kind === 'other-client' ? randomUUID() : clientId, kind === 'other-branch' ? randomUUID() : branchId, kind === 'pending' ? 'PENDING' : 'APPROVED']);
    rows.push({ id, employeeName: kind, employeeCode: kind, daysPresent: '26', otHours: '0', grossEarnings: '1000', netPay: '900' });
  }
  const result = await integratedRegisterDraft({ query: ds.query.bind(ds), getRepository: () => ({ findOneBy: async () => ({ clientName: 'Fictional client' }) }) }, { id: branchId, clientId }, { id: runId, periodYear: 2026, periodMonth: 3 }, rows);
  assert.equal(result.rows.length, 5);
  assert.equal(result.rows[0].sex, 'M');
  for (const row of result.rows.slice(1)) assert.equal(row.sex, undefined);
  for (const row of result.rows) { assert.equal(row.gross, '1000'); assert.equal(row.fine, undefined); }
  await ds.query('DROP TABLE pg_temp.payroll_run_employees; DROP TABLE pg_temp.employees');
  } finally { await ds.release(); }
  console.log('PASS: register draft retains historical wages and loads only approved, exactly scoped linked profiles');
};
