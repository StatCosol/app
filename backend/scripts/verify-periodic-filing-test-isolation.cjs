// Runs only against the disposable loopback test database; never reads app DB settings.
const assert = require('node:assert/strict');
const path = require('node:path');
const { DataSource, Table } = require('typeorm');
const { PGlite } = require('./auditxpert-test-db.cjs');
const { BranchComplianceService } = require('../dist/src/branch-compliance/branch-compliance.service');
const { ComplianceDocumentEntity } = require('../dist/src/branch-compliance/entities/compliance-document.entity');
const { ComplianceReturnMasterEntity } = require('../dist/src/branch-compliance/entities/compliance-return-master.entity');
const { BranchEntity } = require('../dist/src/branches/entities/branch.entity');
const { ClientEntity } = require('../dist/src/clients/entities/client.entity');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
async function main() {
  const db = new PGlite(); let ds;
  try {
    await db.ready;
    ds = new DataSource({ type: 'postgres', host: '127.0.0.1',
      port: Number(process.env.AUDITXPERT_TEST_PORT || 55439),
      username: process.env.AUDITXPERT_TEST_USER || 'monthly_close_test',
      password: process.env.AUDITXPERT_TEST_PASSWORD, database: db.name,
      entities: [path.join(__dirname, '../dist/src/**/*.entity.js')], synchronize: false });
    await ds.initialize();
    const runner = ds.createQueryRunner();
    try {
      for (const entity of [ClientEntity, BranchEntity, ComplianceReturnMasterEntity, ComplianceDocumentEntity])
        await runner.createTable(Table.create(ds.getMetadata(entity), ds.driver), true, false);
    } finally { await runner.release(); }
    const docs = ds.getRepository(ComplianceDocumentEntity);
    const masters = ds.getRepository(ComplianceReturnMasterEntity);
    const client = { userId: id(1), id: id(1), clientId: id(2), roleCode: 'CLIENT', userType: 'MASTER' };
    const branch = { ...client, userType: 'BRANCH', branchIds: [id(3)] };
    const crm = { userId: id(4), id: id(4), roleCode: 'CRM' };
    const scope = {
      assertClientAllowed: async (_, clientId) => assert.equal(clientId, client.clientId),
      getScope: async () => ({}),
      applyToQb: qb => qb.andWhere('d.company_id = :allowedClient', { allowedClient: client.clientId })
    };
    const mail = { sendMcdRejection: async () => { throw new Error('Synthetic review must not send mail'); } };
    const svc = new BranchComplianceService(docs, masters, { getUserBranchIds: async () => [id(3)] }, ds, { log: async () => {} }, mail, scope);
    // Access and storage are local adapters; business queries and lifecycle use PostgreSQL.
    svc.assertBranchAccess = async (actor, branchId) => {
      assert.equal(actor.clientId, client.clientId); assert.equal(branchId, id(3));
    };
    let stored = 0;
    svc.saveFile = async () => `/synthetic-only/fixture-${++stored}.pdf`;
    const file = { originalname: 'filing.pdf', mimetype: 'application/pdf', buffer: Buffer.from('%PDF-synthetic') };
    let checks = 0;
    for (const [frequency, period, queryPeriod] of [
      ['YEARLY', {}, {}], ['QUARTERLY', { periodQuarter: 2 }, { quarter: 2 }],
      ['HALF_YEARLY', { periodHalf: 1 }, { half: 1 }]
    ]) {
      const returnCode = 'FIXTURE_' + frequency;
      await masters.save({ returnCode, returnName: 'Synthetic filing', frequency, lawArea: 'TEST', appliesTo: 'BOTH', dueDay: 10, isActive: true });
      const dto = { branchId: id(3), returnCode, frequency, periodYear: 2025, ...period };
      const actual = await svc.uploadDocument(branch, { ...dto, recordScope: 'ACTUAL' }, file);
      const baseline = JSON.stringify(await docs.findOneBy({ id: actual.id }));
      const kpis = await svc.getBranchDashboardKpis(branch, id(3), 2025);
      const badges = await svc.getSidebarBadges(id(3), id(2), 2025);
      const risk = await svc.calculateRiskExposure(id(3), id(2), 2025);
      const crmKpis = await svc.getCrmDashboardKpis(crm, { year: 2025 });
      const test = await svc.uploadDocument(branch, { ...dto, recordScope: 'TEST' }, file);
      assert.notEqual(test.id, actual.id); assert.equal(test.uploadedFileName, 'TEST ONLY - filing.pdf'); checks += 2;
      const q = { branchId: id(3), year: 2025, frequency, ...queryPeriod };
      for (const [method, actor] of [['listForBranch', branch], ['listForClient', client], ['listForCrmReview', crm], ['listForAuditor', crm]]) {
        assert.deepEqual((await svc[method](actor, q)).data.map(d => d.id), [actual.id]);
        assert.deepEqual((await svc[method](actor, { ...q, recordScope: 'TEST' })).data.map(d => d.id), [test.id]); checks += 2;
      }
      assert.equal((await svc.getChecklist(branch, q)).data.find(d => d.returnCode === returnCode).document.id, actual.id);
      assert.equal((await svc.getChecklist(branch, { ...q, recordScope: 'TEST' })).data.find(d => d.returnCode === returnCode).document.id, test.id); checks += 2;
      await svc.reviewDocument(crm, test.id, { status: 'REUPLOAD_REQUIRED', remarks: 'TEST ONLY: replace attachment' });
      assert.equal((await svc.listForBranch(branch, { ...q, recordScope: 'TEST' })).data[0].remarks, 'TEST ONLY: replace attachment'); checks++;
      await docs.update(test.id, { dueDate: new Date().toISOString().slice(0, 10) });
      assert.equal((await svc.getDocsDueSoon(0)).some(d => d.id === test.id), false);
      await docs.update(test.id, { dueDate: '2020-01-01' });
      await svc.markOverdueDocuments();
      assert.equal((await docs.findOneBy({ id: test.id })).status, 'REUPLOAD_REQUIRED'); checks += 2;
      const corrected = await svc.uploadDocument(branch, { ...dto, recordScope: 'TEST', remarks: 'TEST ONLY: corrected' }, { ...file, originalname: 'corrected.pdf' });
      assert.equal(corrected.id, test.id); assert.equal(corrected.version, 2); assert.equal(corrected.status, 'RESUBMITTED'); checks += 3;
      await svc.reviewDocument(crm, test.id, { status: 'APPROVED', remarks: 'TEST ONLY: approved fixture' });
      for (const [method, actor] of [['listForBranch', branch], ['listForClient', client]]) {
        const doc = (await svc[method](actor, { ...q, recordScope: 'TEST' })).data[0];
        assert.equal(doc.isLocked, true); assert.equal(doc.status, 'APPROVED'); assert.equal(doc.uploadedFileName, 'TEST ONLY - corrected.pdf'); checks += 3;
      }
      await assert.rejects(svc.uploadDocument(branch, { ...dto, recordScope: 'TEST' }, file), /locked/); checks++;
      assert.equal(JSON.stringify(await docs.findOneBy({ id: actual.id })), baseline);
      assert.deepEqual(await svc.getBranchDashboardKpis(branch, id(3), 2025), kpis);
      assert.deepEqual(await svc.getSidebarBadges(id(3), id(2), 2025), badges);
      assert.deepEqual(await svc.calculateRiskExposure(id(3), id(2), 2025), risk);
      assert.deepEqual(await svc.getCrmDashboardKpis(crm, { year: 2025 }), crmKpis); checks += 5;
    }
    console.log(JSON.stringify({ passed: true, assertions: checks, frequencies: ['YEARLY','QUARTERLY','HALF_YEARLY'], actualRecordsUnchanged: true, storage: 'local stub', database: 'disposable loopback PostgreSQL' }));
  } finally { if (ds?.isInitialized) await ds.destroy(); await db.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
