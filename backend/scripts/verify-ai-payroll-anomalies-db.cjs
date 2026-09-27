// Synthetic loopback-only database. No production settings or payroll writes.
require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { DataSource, getMetadataArgsStorage } = require('typeorm');
const { PGlite } = require('./auditxpert-test-db.cjs');
const { AiPayrollAnomalyService } = require('../dist/src/ai/ai-payroll-anomaly.service');
const { AiPayrollAnomalyEntity } = require('../dist/src/ai/entities/ai-payroll-anomaly.entity');
const { ClientEntity } = require('../dist/src/clients/entities/client.entity');
const { PayrollRunEntity } = require('../dist/src/payroll/entities/payroll-run.entity');
const { PayrollRunEmployeeEntity } = require('../dist/src/payroll/entities/payroll-run-employee.entity');
const { EmployeeStatutoryEntity } = require('../dist/src/employees/entities/employee-statutory.entity');
const { EmployeeEntity } = require('../dist/src/employees/entities/employee.entity');

async function main() {
  const db = new PGlite();
  let ds;
  try {
    await db.ready;
    ds = new DataSource({
      type: 'postgres', host: '127.0.0.1',
      port: Number(process.env.AUDITXPERT_TEST_PORT || 55439),
      username: process.env.AUDITXPERT_TEST_USER || 'monthly_close_test',
      password: process.env.AUDITXPERT_TEST_PASSWORD,
      database: db.name, applicationName: 'ai-payroll-anomaly-regression',
      synchronize: true,
      entities: [ClientEntity, PayrollRunEntity, PayrollRunEmployeeEntity, EmployeeStatutoryEntity, AiPayrollAnomalyEntity],
    });
    await ds.initialize();
    await db.exec(`
      CREATE TABLE client_branches(id uuid PRIMARY KEY, statecode text);
      CREATE TABLE employees(id uuid PRIMARY KEY, client_id uuid NOT NULL,
        branch_id uuid, employee_code varchar(50), name varchar(250),
        is_active boolean DEFAULT true, date_of_joining date, monthly_gross numeric);
    `);
    const [a, b] = await ds.getRepository(ClientEntity).save([
      { clientCode: 'TEST-A', clientName: 'Synthetic A' },
      { clientCode: 'TEST-B', clientName: 'Synthetic B' },
    ]);
    const runRepo = ds.getRepository(PayrollRunEntity);
    const run = await runRepo.save({ id: 'abcdef01-1122-4334-8556-abcdef012345', clientId: a.id, periodYear: 2026, periodMonth: 9 });
    const foreign = await runRepo.save({ clientId: b.id, periodYear: 2026, periodMonth: 9 });
    const empty = await runRepo.save({ clientId: a.id, periodYear: 2026, periodMonth: 8 });
    const anomalyRepo = ds.getRepository(AiPayrollAnomalyEntity);
    const service = new AiPayrollAnomalyService(anomalyRepo, ds, {});

    for (const id of [foreign.id, randomUUID()]) {
      await assert.rejects(service.detectAnomalies(a.id, id), error => error.status === 400);
    }
    await assert.rejects(service.detectAnomalies(randomUUID(), run.id), error => error.status === 404);
    assert.equal(await anomalyRepo.count(), 0);

    // Current employee metadata has no salary columns used by these legacy rules.
    // A schema mismatch must not be reported as an empty successful scan.
    const columns = getMetadataArgsStorage().columns.filter(c => c.target === EmployeeEntity).map(c => c.options.name);
    assert.ok(!columns.includes('basic_salary') && !columns.includes('gross_salary'));
    await assert.rejects(service.detectAnomalies(a.id, run.id.toUpperCase()), error => error.driverError?.code === '42703');
    assert.equal(await anomalyRepo.count(), 0);

    // Compatibility fixture ONLY: exercise all result types and scope filters;
    // this is not a migration or a claim that production has these columns.
    await db.exec('ALTER TABLE employees ADD COLUMN basic_salary numeric, ADD COLUMN gross_salary numeric');
    const employees = Array.from({ length: 5 }, () => randomUUID());
    for (let i = 0; i < employees.length; i++) {
      const clientId = i === 4 ? b.id : a.id;
      await db.query(`INSERT INTO employees(id,client_id,employee_code,name,date_of_joining,basic_salary,gross_salary,is_active)
        VALUES ($1,$2,$3,'Synthetic employee',CURRENT_DATE-60,5000,30000,$4)`,
        [employees[i], clientId, `E${i}`, i !== 3]);
      await ds.getRepository(EmployeeStatutoryEntity).save({ employeeId: employees[i], clientId, pfWages: '6000' });
    }
    const memberRepo = ds.getRepository(PayrollRunEmployeeEntity);
    for (const [index, employeeId, clientId] of [[0, employees[0], a.id], [1, null, a.id], [3, employees[3], a.id], [4, employees[4], b.id]]) {
      await memberRepo.save({ runId: run.id, clientId, employeeId, employeeCode: `E${index}`, employeeName: 'Synthetic member' });
    }
    const results = await service.detectAnomalies(a.id.toUpperCase(), run.id.toUpperCase());
    assert.equal(results.length, 8);
    assert.deepEqual(new Set(results.map(r => r.employeeId)), new Set(employees.slice(0, 2)));
    assert.equal(new Set(results.map(r => r.anomalyType)).size, 4);
    for (const result of results) {
      const saved = await anomalyRepo.findOneByOrFail({ id: result.id });
      assert.equal(saved.clientId, a.id);
      assert.equal(saved.payrollRunId, run.id);
    }
    assert.deepEqual(await service.detectAnomalies(a.id, empty.id), []);
    const companyResults = await service.detectAnomalies(a.id);
    assert.equal(companyResults.length, 12);
    for (const row of companyResults) assert.equal(row.payrollRunId, null);

    const beforeFailure = await anomalyRepo.count();
    // The first rule finds results, but the second cannot complete: no partial save.
    await db.exec('DROP TABLE employee_statutory');
    await assert.rejects(service.detectAnomalies(a.id), error => error.driverError?.code === '42P01');
    assert.equal(await anomalyRepo.count(), beforeFailure);
    await ds.getRepository(ClientEntity).update(a.id, { isDeleted: true });
    await assert.rejects(service.detectAnomalies(a.id, run.id), error => error.status === 404);
    assert.equal(await anomalyRepo.count(), beforeFailure);
    console.log('PASS: AI anomaly ownership, uppercase UUIDs, run membership/code fallback, all result references, current-schema failure and late-query failure without partial writes.');
  } finally {
    if (ds?.isInitialized) await ds.destroy();
    await db.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
