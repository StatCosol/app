// Disposable loopback PostgreSQL only. Build the backend before running.
const assert = require('node:assert/strict');
const { Client } = require('pg');
const { DataSource, Table } = require('typeorm');
const { PayrollService } = require('../dist/src/payroll/payroll.service');
const { PayrollClientConfigService } = require('../dist/src/payroll/payroll-client-config.service');
const { PayrollComponentMasterEntity } = require('../dist/src/payroll/entities/payroll-component-master.entity');
const { PayrollClientComponentOverrideEntity } = require('../dist/src/payroll/entities/payroll-client-component-override.entity');
const { PayrollConfigAuditEntity } = require('../dist/src/payroll/entities/payroll-config-audit.entity');
const config = { host: '127.0.0.1', port: 55439, user: 'monthly_close_test', database: 'postgres' };
const schema = `payroll_config_test_${Date.now()}`;
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

async function main() {
  const admin = new Client(config);
  await admin.connect();
  let ds;
  try {
    await admin.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public');
    await admin.query(`CREATE SCHEMA "${schema}"`);
    const entities = [PayrollComponentMasterEntity, PayrollClientComponentOverrideEntity, PayrollConfigAuditEntity];
    ds = new DataSource({ type: 'postgres', ...config, username: config.user, schema, extra: { options: `-c search_path=${schema},public` }, entities, synchronize: false });
    await ds.initialize();
    const runner = ds.createQueryRunner();
    try {
      for (const entity of entities) await runner.createTable(Table.create(ds.getMetadata(entity), ds.driver), true);
    } finally { await runner.release(); }
    const master = ds.getRepository(PayrollComponentMasterEntity);
    const overrides = ds.getRepository(PayrollClientComponentOverrideEntity);
    const audit = ds.getRepository(PayrollConfigAuditEntity);
    await master.save({ id: id(1), code: 'BASIC', name: 'Basic', componentType: 'EARNING', defaultFormula: 'GROSS * 0.5' });
    await overrides.save({ clientId: id(2), componentId: id(1), enabled: false, displayOrder: 7, labelOverride: 'Original', formulaOverride: 'GROSS * 0.4' });
    const clientConfigService = Object.assign(Object.create(PayrollClientConfigService.prototype), {
      compRepo: master, overrideRepo: overrides,
      scopeService: { assertPayrollAccessToClient: async () => {} },
    });
    const service = Object.assign(Object.create(PayrollService.prototype), { clientConfigService });
    const user = { id: id(3), roleCode: 'PAYROLL' };
    const save = patch => service.saveClientComponentOverrides(user, id(2), { items: [{ componentId: id(1), ...patch }] });
    await Promise.all([save({ labelOverride: 'Updated' }), save({ showOnPayslip: false })]);
    let row = await overrides.findOneByOrFail({ clientId: id(2) });
    assert.equal(row.labelOverride, 'Updated');
    assert.equal(row.showOnPayslip, false);
    assert.equal(row.enabled, false);
    assert.equal(row.formulaOverride, 'GROSS * 0.4');
    assert.equal(await audit.count(), 2);
    await save({ formulaOverride: null, labelOverride: '' });
    row = await overrides.findOneByOrFail({ clientId: id(2) });
    assert.equal(row.formulaOverride, null);
    assert.equal(row.labelOverride, null);
    assert.equal(row.displayOrder, 7);
    // Force history persistence to fail, then verify the override was rolled back.
    await ds.query(`ALTER TABLE payroll_config_audit_logs ADD CONSTRAINT reject_test_history CHECK (action = 'NEVER') NOT VALID`);
    await assert.rejects(save({ displayOrder: 99 }), /reject_test_history/);
    row = await overrides.findOneByOrFail({ clientId: id(2) });
    assert.equal(row.displayOrder, 7);
    assert.equal(await audit.count(), 3);
    console.log('PASS: concurrent partial saves preserve unrelated fields; explicit resets work; audit failure rolls back override changes.');
  } finally {
    if (ds?.isInitialized) await ds.destroy();
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.end();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
