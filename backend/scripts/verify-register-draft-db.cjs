// Disposable PostgreSQL regression for historical payroll/profile joins.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { integratedRegisterDraft } = require('../dist/src/payroll/register-library/register-integrated-draft');
module.exports = async function verifyRegisterDraft(source) {
  const ds = source.createQueryRunner();
  await ds.connect();
  try {
  await ds.query(`CREATE TEMP TABLE payroll_run_employees (id uuid, run_id uuid, client_id uuid, branch_id uuid, employee_id uuid);
    CREATE TEMP TABLE payroll_run_component_values (run_employee_id uuid, run_id uuid, component_code text, amount numeric);
    CREATE TEMP TABLE employees (id uuid, client_id uuid, branch_id uuid, approval_status text, date_of_birth date, gender text, father_name text);
    CREATE TEMP TABLE employee_nominations (id uuid, employee_id uuid, client_id uuid, branch_id uuid, nomination_type text, status text, approved_at timestamptz, created_at timestamptz);
    CREATE TEMP TABLE employee_nomination_members (id uuid, nomination_id uuid, member_name text, address text);`);
  const enrollmentMigration = readFileSync(path.join(__dirname, '../migrations/20261009_employee_register_details.sql'), 'utf8');
  await ds.query(enrollmentMigration);
  await ds.query(enrollmentMigration);
  const clientId = randomUUID(), branchId = randomUUID(), runId = randomUUID();
  const rows = [];
  for (const kind of ['valid', 'other-branch', 'other-client', 'pending', 'unlinked']) {
    const id = randomUUID(), employeeId = randomUUID();
    await ds.query('INSERT INTO payroll_run_employees VALUES ($1,$2,$3,$4,$5)', [id, runId, clientId, branchId, kind === 'unlinked' ? null : employeeId]);
    await ds.query("INSERT INTO employees VALUES ($1,$2,$3,$4,'1990-01-01','MALE','Fictional parent','Sample home address','Diploma','SKILLED')", [employeeId, kind === 'other-client' ? randomUUID() : clientId, kind === 'other-branch' ? randomUUID() : branchId, kind === 'pending' ? 'PENDING' : 'APPROVED']);
    await ds.query("INSERT INTO payroll_run_component_values VALUES ($1,$2,'WORKED_DAYS',24)", [id, runId]);
    await ds.query("INSERT INTO payroll_run_component_values VALUES ($1,$2,'OT_AMOUNT',0)", [id, runId]);
    for (const variant of ['old', 'latest', 'draft', 'wrong-client', 'wrong-branch']) {
      const nominationId = randomUUID();
      await ds.query(`INSERT INTO employee_nominations VALUES ($1,$2,$3,$4,'SALARY',$5,$6,$6)`,
        [nominationId, employeeId, variant === 'wrong-client' ? randomUUID() : clientId,
          variant === 'wrong-branch' ? randomUUID() : branchId, variant === 'draft' ? 'DRAFT' : 'APPROVED',
          variant === 'old' ? '2026-01-01' : variant === 'latest' ? '2026-02-01' : '2026-03-01']);
      await ds.query('INSERT INTO employee_nomination_members VALUES ($1,$2,$3,$4)',
        [randomUUID(), nominationId, variant + ' nominee', 'Sample nominee address']);
    }
    rows.push({ id, employeeName: kind, employeeCode: kind, daysPresent: '26', otHours: '0', grossEarnings: '1000', netPay: '900' });
  }
  const result = await integratedRegisterDraft({ query: ds.query.bind(ds), getRepository: () => ({ findOneBy: async () => ({ clientName: 'Fictional client' }) }) }, { id: branchId, clientId }, { id: runId, periodYear: 2026, periodMonth: 3 }, rows);
  assert.equal(result.rows.length, 5);
  assert.equal(result.rows[0].sex, 'M');
  assert.equal(result.rows[0].address, 'Sample home address');
  assert.equal(result.rows[0].educationSkill, 'Diploma / SKILLED');
  assert.equal(result.rows[0].nominee, 'latest nominee — Sample nominee address');
  for (const row of result.rows.slice(1)) {
    for (const key of ['sex', 'address', 'educationSkill', 'nominee']) assert.equal(row[key], undefined);
  }
  for (const row of result.rows) assert.equal(Number(row.overtime), 0);
  for (const row of result.rows) { assert.equal(row.gross, '1000'); assert.equal(Number(row.daysWorked), 24); assert.equal(row.fine, undefined); }
  await ds.query('DROP TABLE pg_temp.payroll_run_employees; DROP TABLE pg_temp.employees; DROP TABLE pg_temp.payroll_run_component_values; DROP TABLE pg_temp.employee_nomination_members; DROP TABLE pg_temp.employee_nominations');
  } finally { await ds.release(); }
  console.log('PASS: register draft retains historical wages and loads only approved, exactly scoped linked profiles');
};
