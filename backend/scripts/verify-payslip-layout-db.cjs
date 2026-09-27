const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { DataSource } = require('typeorm');
const { PGlite } = require('./auditxpert-test-db.cjs');
const { PayrollService } = require('../dist/src/payroll/payroll.service');
const { PayrollClientPayslipLayoutEntity } = require('../dist/src/payroll/entities/payroll-client-payslip-layout.entity');
const { PayrollConfigAuditEntity } = require('../dist/src/payroll/entities/payroll-config-audit.entity');
const { defaultPayslipLayout } = require('../dist/src/payroll/utils/payslip-layout');

async function main() {
  const db = new PGlite();
  let ds;
  try {
    await db.ready;
    ds = new DataSource({
      type: 'postgres', host: '127.0.0.1', port: Number(process.env.AUDITXPERT_TEST_PORT || 55439),
      username: process.env.AUDITXPERT_TEST_USER || 'monthly_close_test', password: process.env.AUDITXPERT_TEST_PASSWORD,
      database: db.name, synchronize: true, entities: [PayrollClientPayslipLayoutEntity, PayrollConfigAuditEntity],
    });
    await ds.initialize();
    const clientId = randomUUID(); const user = { id: randomUUID(), roleCode: 'PAYROLL' };
    const repo = ds.getRepository(PayrollClientPayslipLayoutEntity);
    const historyRepo = ds.getRepository(PayrollConfigAuditEntity);
    const service = Object.assign(Object.create(PayrollService.prototype), {
      layoutRepo: repo,
      scopeService: { assertPayrollAccessToClient: async (_user, requested) => { if (requested !== clientId) throw new Error('Outside client scope'); } },
      getClientEffectiveComponents: async () => [{ code: 'BASIC', enabled: true }],
    });
    const first = defaultPayslipLayout(); first.settings.enabled = true; first.sections[0].title = 'First layout';
    const second = defaultPayslipLayout(); second.sections[0].title = 'Second layout';
    await Promise.all([first, second].map(layout => service.saveClientPayslipLayout(user, clientId, { layout })));
    assert.equal(await repo.count(), 1);
    const history = await historyRepo.find(); assert.equal(history.length, 2);
    const created = history.find(h => h.action === 'CREATE'); const updated = history.find(h => h.action === 'UPDATE');
    assert.deepEqual(updated.oldValues.layoutJson, created.newValues.layoutJson);
    const saved = await service.getClientPayslipLayout(user, clientId);
    assert.deepEqual(saved, updated.newValues.layoutJson);
    await assert.rejects(service.saveClientPayslipLayout(user, randomUUID(), { layout: first }), /Outside client scope/);
    assert.equal(await repo.count(), 1);
    await db.exec(`CREATE FUNCTION reject_layout_history() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected history failure'; END $$;
      CREATE TRIGGER reject_history BEFORE INSERT ON payroll_config_audit_logs FOR EACH ROW EXECUTE FUNCTION reject_layout_history();`);
    await assert.rejects(service.saveClientPayslipLayout(user, clientId, { layout: first }), /injected history failure/);
    assert.deepEqual(await service.getClientPayslipLayout(user, clientId), saved);
    assert.equal(await historyRepo.count(), 2);
    console.log('PASS: concurrent layout saves, exact before/after history, cross-client denial, and rollback when history fails');
  } finally {
    if (ds?.isInitialized) await ds.destroy();
    await db.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
