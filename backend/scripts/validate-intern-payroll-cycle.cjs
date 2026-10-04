// Runs entirely inside a rolled-back schema on the supplied test database.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

async function main() {
  if (!process.env.TEST_DATABASE_URL) throw new Error('Set TEST_DATABASE_URL to an isolated test database');
  const db = new Client({ connectionString: process.env.TEST_DATABASE_URL });
  await db.connect();
  try {
    await db.query('BEGIN');
    await db.query(`CREATE SCHEMA intern_cycle_test_${process.pid}`);
    await db.query(`SET LOCAL search_path TO intern_cycle_test_${process.pid}`);
    await db.query(`
      CREATE TABLE employees(id uuid PRIMARY KEY, client_id uuid, branch_id uuid,
        monthly_gross numeric(12,2), is_active boolean DEFAULT true);
      CREATE TABLE payroll_runs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_id uuid NOT NULL,
        branch_id uuid, period_year int NOT NULL, period_month int NOT NULL,
        CONSTRAINT legacy_period_key UNIQUE(client_id, branch_id, period_year, period_month));
      INSERT INTO employees(id, client_id) VALUES ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002');
      INSERT INTO payroll_runs(client_id, period_year, period_month) VALUES ('00000000-0000-0000-0000-000000000002', 2026, 10);
    `);
    const migration = fs.readFileSync(path.join(__dirname, '../migrations/20261004_intern_payroll_cycle.sql'), 'utf8');
    await db.query(migration);
    await db.query(migration);
    assert.equal((await db.query('SELECT payroll_category FROM employees')).rows[0].payroll_category, 'REGULAR');
    assert.equal((await db.query('SELECT payroll_category FROM payroll_runs')).rows[0].payroll_category, 'REGULAR');
    await db.query(`INSERT INTO employees(id, client_id, branch_id, monthly_gross, payroll_category)
      VALUES ('00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000002',
              '00000000-0000-0000-0000-000000000003', 15000.50, 'INTERN')`);
    const intern = (await db.query("SELECT branch_id, monthly_gross FROM employees WHERE payroll_category = 'INTERN'")).rows[0];
    assert.equal(intern.branch_id, '00000000-0000-0000-0000-000000000003');
    assert.equal(Number(intern.monthly_gross), 15000.50);
    await db.query("UPDATE employees SET monthly_gross = 16000.75 WHERE payroll_category = 'INTERN'");
    assert.equal(Number((await db.query("SELECT monthly_gross FROM employees WHERE payroll_category = 'INTERN'")).rows[0].monthly_gross), 16000.75);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM employees WHERE payroll_category = 'REGULAR'")).rows[0].n, 1);
    await db.query(`INSERT INTO payroll_runs(client_id, period_year, period_month, payroll_category)
      VALUES ('00000000-0000-0000-0000-000000000002', 2026, 10, 'INTERN')`);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM payroll_runs')).rows[0].n, 2);
    for (const category of ['REGULAR', 'INTERN']) {
      await db.query('SAVEPOINT duplicate_test');
      await assert.rejects(db.query(`INSERT INTO payroll_runs(client_id, period_year, period_month, payroll_category)
        VALUES ('00000000-0000-0000-0000-000000000002', 2026, 10, $1)`, [category]), { code: '23505' });
      await db.query('ROLLBACK TO SAVEPOINT duplicate_test');
    }
    await db.query(`INSERT INTO payroll_runs(client_id, branch_id, period_year, period_month, payroll_category)
      VALUES ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003', 2026, 10, 'REGULAR'),
             ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003', 2026, 10, 'INTERN')`);
    await db.query('SAVEPOINT category_test');
    await assert.rejects(db.query("UPDATE employees SET payroll_category = 'OTHER'"), { code: '23514' });
    await db.query('ROLLBACK TO SAVEPOINT category_test');
    await db.query('SAVEPOINT run_category_test');
    await assert.rejects(db.query("UPDATE payroll_runs SET payroll_category = 'OTHER'"), { code: '23514' });
    await db.query('ROLLBACK TO SAVEPOINT run_category_test');
    console.log('Intern payroll migration passed: defaults, idempotence, branch/stipend persistence, parallel categories, branch scope, duplicate rejection and category constraints.');
  } finally {
    await db.query('ROLLBACK');
    await db.end();
  }
}
main().catch(err => { console.error(err.message); process.exitCode = 1; });
