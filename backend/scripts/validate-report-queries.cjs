// After backend build; disposable local database only. Never reads production credentials.
//
// The reporting SQL, executed against real Postgres. These queries named
// columns that do not exist (c."clientName", b."clientId", ct.law_name) or
// aggregated a uuid (max(re.employee_id)), so every one of them answered 500:
// Form 16 and the DTSS PDF from the app, the overdue-audit and
// assignment-health reports and their Excel exports directly. A unit test
// cannot catch that — only the database can.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

const connection = {
  host: '127.0.0.1',
  port: Number(process.env.AUTOMATION_TEST_PORT || 55439),
  user: process.env.AUTOMATION_TEST_USER || 'monthly_close_test',
  password: process.env.AUTOMATION_TEST_PASSWORD || undefined,
  database: process.env.AUTOMATION_TEST_DATABASE || 'postgres',
};
const schema = `report_sql_${Date.now()}`;
const SRC = path.join(__dirname, '..', 'src');

/** Pull the SQL out of the source, so the test runs what the app runs. */
function sqlFrom(file, marker, opts = {}) {
  const text = fs.readFileSync(path.join(SRC, file), 'utf8');
  const at = text.indexOf(marker);
  assert.ok(at > -1, `${file}: marker not found: ${marker}`);
  const start = text.indexOf('`', at);
  const end = text.indexOf('`', start + 1);
  assert.ok(start > -1 && end > start, `${file}: template literal not found`);
  // Drop interpolated fragments (e.g. an optional "AND to_char(...) = $2").
  let sql = text.slice(start + 1, end).replace(/\$\{[^}]*\}/g, '');
  for (const [k, v] of Object.entries(opts.replace ?? {})) sql = sql.split(k).join(v);
  return sql;
}

const DDL = `
CREATE TABLE clients (id uuid PRIMARY KEY, client_name varchar, is_deleted boolean DEFAULT false, assigned_crm_id uuid, assigned_auditor_id uuid, created_at timestamptz DEFAULT now());
CREATE TABLE client_branches (id uuid PRIMARY KEY, clientid uuid, branchname varchar, branch_code varchar, isdeleted boolean DEFAULT false, is_active boolean DEFAULT true, statecode varchar);
CREATE TABLE users (id uuid PRIMARY KEY, name varchar, email varchar, role_id uuid, is_active boolean DEFAULT true, deleted_at timestamptz, owner_cco_id uuid);
CREATE TABLE audits (id uuid PRIMARY KEY, client_id uuid, branch_id uuid, audit_type varchar, status varchar, due_date date, assigned_auditor_id uuid, created_at timestamptz DEFAULT now());
CREATE TABLE client_assignments_current (id uuid DEFAULT gen_random_uuid(), client_id uuid, assignment_type varchar, assigned_to_user_id uuid, start_date timestamptz DEFAULT now());
CREATE TABLE compliance_master (id uuid PRIMARY KEY, law_name varchar, law_family varchar);
CREATE TABLE compliance_tasks (id bigserial PRIMARY KEY, client_id uuid, branch_id uuid, compliance_id uuid, title varchar, status varchar, frequency varchar, due_date date);
`;

async function main() {
  const admin = new Client(connection);
  await admin.connect();
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    const db = new Client({ ...connection, options: `-c search_path=${schema}` });
    await db.connect();
    try {
      await db.query(DDL);
      const C = '11111111-1111-4111-8111-111111111111';
      const B = '22222222-2222-4222-8222-222222222201';
      const CM = '33333333-3333-4333-8333-333333333301';
      await db.query(`INSERT INTO clients (id, client_name) VALUES ($1,'E2E Industries')`, [C]);
      await db.query(`INSERT INTO client_branches (id, clientid, branchname) VALUES ($1,$2,'Branch One')`, [B, C]);
      await db.query(`INSERT INTO compliance_master (id, law_name) VALUES ($1,'Factories Act')`, [CM]);
      await db.query(
        `INSERT INTO compliance_tasks (client_id, branch_id, compliance_id, title, status, frequency, due_date)
         VALUES ($1,$2,$3,'Return filing','PENDING','MONTHLY', current_date)`, [C, B, CM]);
      await db.query(
        `INSERT INTO audits (id, client_id, branch_id, audit_type, status, due_date)
         VALUES (gen_random_uuid(),$1,$2,'STATUTORY','OPEN', current_date - 10)`, [C, B]);

      // 1. Overdue audits (report + Excel export share these columns).
      const overdue = sqlFrom('reports/audit-report.controller.ts', "@Get('overdue')");
      let rows = (await db.query(overdue + " ORDER BY days_overdue DESC")).rows;
      assert.equal(rows.length, 1, 'overdue audits returned no row');
      assert.equal(rows[0].client_name, 'E2E Industries');
      assert.equal(rows[0].branch_name, 'Branch One');

      const U = '44444444-4444-4444-8444-444444444401';
      await db.query(
        `INSERT INTO users (id, name, email) VALUES ($1,'CRM User','crm@e2e.test')`,
        [U],
      );
      await db.query(
        `INSERT INTO client_assignments_current (client_id, assignment_type, assigned_to_user_id)
         VALUES ($1,'CRM',$2)`,
        [C, U],
      );

      // 2. Assignment health.
      const health = sqlFrom('reports/assignment-report.controller.ts', "@Get('health')");
      await db.query(health);

      // 3. DTSS task list (the PDF report).
      const dtss = sqlFrom(
        'reports/pdf-report.controller.ts',
        'const tasks = await this.ds.query(',
      );
      rows = (await db.query(dtss, [C])).rows;
      assert.equal(rows.length, 1);
      assert.equal(rows[0].lawName, 'Factories Act', 'DTSS lost the law name');
      assert.equal(rows[0].branchName, 'Branch One');

      // 4. Form 16 aggregates a uuid column; max(uuid) does not exist.
      await db.query(`CREATE TABLE re (id uuid, employee_id uuid, employee_code varchar)`);
      await db.query(`INSERT INTO re VALUES (gen_random_uuid(), gen_random_uuid(), 'E1')`);
      const form16Agg = fs
        .readFileSync(path.join(SRC, 'payroll/payroll-reports.service.ts'), 'utf8')
        .match(/'(MAX\(re\.[^']+)'/)[1];
      rows = (await db.query(`SELECT ${form16Agg} FROM re GROUP BY employee_code`)).rows;
      assert.ok(rows[0].employee_id, 'Form 16 employee id aggregate returned nothing');

      console.log(
        'PASS: report SQL runs on real Postgres — overdue audits and assignment health resolve client/branch columns, the DTSS list keeps the law name, and the Form 16 aggregate works on a uuid column.',
      );
    } finally {
      await db.end();
    }
  } finally {
    await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.end();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
