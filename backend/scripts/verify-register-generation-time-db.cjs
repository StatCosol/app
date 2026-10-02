const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { DataSource } = require('typeorm');
const { PGlite } = require('./auditxpert-test-db.cjs');
const { GENERATED_REGISTER_SQL, registerSourceType } = require('../dist/src/payroll/register-provenance');
const { PayrollRegistersService } = require('../dist/src/payroll/payroll-registers.service');
const { RegistersRecordEntity } = require('../dist/src/payroll/entities/registers-record.entity');

async function main() {
  const db = new PGlite();
  let ds;
  try {
    await db.ready;
    ds = new DataSource({
      type: 'postgres', host: '127.0.0.1', port: Number(process.env.AUDITXPERT_TEST_PORT || 55439),
      username: process.env.AUDITXPERT_TEST_USER || 'monthly_close_test', password: process.env.AUDITXPERT_TEST_PASSWORD,
      database: db.name, synchronize: true, entities: [RegistersRecordEntity],
    });
    await ds.initialize();
    await require('./verify-register-draft-db.cjs')(ds);
    // The new state bindings must be selectable for review, never enabled by the package.
    await ds.query(`CREATE TABLE unit_compliance_master (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),code text UNIQUE,name text,category text,state_code text,frequency text,applies_to text,is_active boolean);
      CREATE TABLE compliance_package (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),code text);
      CREATE TABLE package_compliance (package_id uuid,compliance_id uuid,included_by_default boolean DEFAULT true,PRIMARY KEY(package_id,compliance_id));
      INSERT INTO compliance_package(code) VALUES ('DEFAULT_INDIA');`);
    const stateMigration=readFileSync(path.join(__dirname,'../migrations/20261002_seven_state_register_applicability.sql'),'utf8');
    await ds.query(stateMigration);await ds.query(stateMigration);
    assert.equal(Number((await ds.query('SELECT count(*) AS n FROM unit_compliance_master'))[0].n),5);
    assert.equal(Number((await ds.query('SELECT count(*) AS n FROM package_compliance WHERE included_by_default'))[0].n),0);
    console.log('PASS: seven-state applicability migration is idempotent and requires review');
    // Model the existing production schema, with an approved historical record.
    await ds.query('ALTER TABLE registers_records DROP COLUMN generated_at');
    const id = randomUUID();
    const createdAt = new Date('2026-09-01T00:00:00Z');
    await ds.query(`INSERT INTO registers_records
      (id, client_id, category, title, prepared_by_user_id, file_name, file_path, file_type, file_size, approval_status, approved_at, created_at)
      VALUES ($1,$2,'REGISTER','Test evidence',$3,'test.xlsx','/old.xlsx','application/octet-stream',10,'APPROVED',$4,$4)`,
      [id, randomUUID(), randomUUID(), createdAt]);
    const migration = readFileSync(path.join(__dirname, '../migrations/20261001_register_generated_at.sql'), 'utf8');
    await ds.query(migration);
    await ds.query(migration);
    const repo = ds.getRepository(RegistersRecordEntity);
    const legacy = await repo.findOneByOrFail({ id });
    assert.equal(legacy.generatedAt, null);
    assert.equal(legacy.createdAt.toISOString(), createdAt.toISOString());
    const generatedAt = new Date('2026-10-01T08:30:00Z');
    const preparer = randomUUID();
    await repo.save(repo.create({ id, filePath: '/replacement.xlsx', fileSize: '20',
      preparedByUserId: preparer, generatedAt, approvalStatus: 'PENDING', approvedAt: null, approvedByUserId: null }));
    const replacement = await repo.findOneByOrFail({ id });
    assert.equal(await repo.count(), 1);
    assert.equal(replacement.createdAt.toISOString(), createdAt.toISOString());
    assert.equal(replacement.generatedAt.toISOString(), generatedAt.toISOString());
    assert.equal(replacement.preparedByUserId, preparer);
    assert.equal(replacement.filePath, '/replacement.xlsx');
    assert.equal(replacement.approvalStatus, 'PENDING');
    assert.equal(replacement.approvedAt, null);
    // Re-running the deployment migration must not alter replacement evidence.
    await ds.query(migration);
    assert.equal((await repo.findOneByOrFail({ id })).generatedAt.toISOString(), generatedAt.toISOString());
    // Synthetic historical files exercise real PostgreSQL source and approval filters.
    const clientId = randomUUID(), branchId = randomUUID();
    const base = { clientId, branchId, category: 'REGISTER', title: 'Historical wages register',
      preparedByUserId: randomUUID(), payrollInputId: null, registerType: 'WAGE_REGISTER',
      periodYear: 2026, periodMonth: 3, fileName: 'wages.xlsx', fileType: 'application/octet-stream',
      fileSize: '10', approvalStatus: 'PENDING',
      filePath: '/app/uploads/registers/' + clientId + '/wages.xlsx' };
    const historical = await repo.save(repo.create(base));
    const fixtures = [
      { ...base, filePath: 'C:\\app\\uploads\\registers\\' + clientId + '\\wages.xlsx' },
      { ...base, filePath: '/app/uploads/registers-records/123_wages.xlsx' },
      { ...base, registerType: null, filePath: '' },
      { ...base, filePath: '/app/uploads/registers/' + randomUUID() + '/wages.xlsx' },
      { ...base, filePath: '/app/uploads/registers/' + clientId + '/other.xlsx' },
      { ...base, category: 'RECORD', registerType: 'ECR', filePath: '/app/uploads/pf-ecr/123_wages.xlsx' },
      { ...base, category: 'RECORD', registerType: 'ESI', filePath: '/app/uploads/esi/123_wages.xlsx' },
      { ...base, category: 'RECORD', registerType: 'ECR', filePath: '/app/uploads/pf-ecr/manual_wages.xlsx' },
      { ...base, category: 'RECORD', registerType: 'ESI', filePath: '/app/uploads/pf-ecr/123_wages.xlsx' },
      { ...base, fileName: '../wages.xlsx' },
      { ...base, filePath: '/app/myuploads/registers/' + clientId + '/wages.xlsx' },
      { ...base, category: 'RECORD' },
      { ...base, clientId: randomUUID() },
    ];
    await repo.save(fixtures.map(row => repo.create(row)));
    const all = await repo.find();
    for (const source of ['GENERATED', 'MANUAL']) {
      const actual = await repo.createQueryBuilder('r')
        .where(source === 'GENERATED' ? GENERATED_REGISTER_SQL : 'NOT ' + GENERATED_REGISTER_SQL).getMany();
      const expected = all.filter(row => registerSourceType(row) === source);
      assert.deepEqual(actual.map(row => row.id).sort(), expected.map(row => row.id).sort());
    }
    const service = new PayrollRegistersService(repo, {}, {}, {}, {
      findOne: async () => ({ settings: { allowBranchPayrollAccess: true,
        allowBranchWageRegisters: true, allowBranchSalaryRegisters: true } }),
    }, {});
    const user = { id: randomUUID(), roleCode: 'CLIENT', clientId, userType: 'MASTER', branchIds: [branchId] };
    const query = { sourceType: 'GENERATED', category: 'REGISTER', periodYear: 2026, periodMonth: 3 };
    const masterRows = await service.clientListRegistersRecords(user, query);
    assert.ok(masterRows.some(row => row.id === historical.id && row.sourceType === 'GENERATED'));
    assert.ok(masterRows.every(row => row.clientId === clientId));
    const branchUser = { ...user, userType: 'BRANCH' };
    assert.deepEqual(await service.clientListRegistersRecords(branchUser, query), []);
    assert.deepEqual(await service.clientRegistersAvailability(branchUser, query), { total: 2, approved: 0, pending: 2, rejected: 0 });
    assert.deepEqual(await service.clientRegistersAvailability(branchUser, { ...query, periodMonth: 4 }), { total: 0, approved: 0, pending: 0, rejected: 0 });
    assert.deepEqual(await service.clientRegistersAvailability({ ...branchUser, branchIds: [randomUUID()] }, query), { total: 0, approved: 0, pending: 0, rejected: 0 });
    // Approval changes only this disposable test database.
    await repo.update(historical.id, { approvalStatus: 'APPROVED' });
    const branchRows = await service.clientListRegistersRecords(branchUser, query);
    assert.deepEqual(branchRows.map(row => row.id), [historical.id]);
    assert.deepEqual(await service.clientListRegistersRecords(branchUser, { ...query, periodMonth: 4 }), []);
    assert.deepEqual(await service.clientListRegistersRecords({ ...branchUser, branchIds: [randomUUID()] }, query), []);
    assert.deepEqual(await service.clientRegistersAvailability(branchUser, query), { total: 2, approved: 1, pending: 1, rejected: 0 });
    assert.deepEqual(await service.clientRegistersAvailability(branchUser, { ...query, sourceType: 'MANUAL' }),
      { total: 6, approved: 0, pending: 6, rejected: 0 });
    await require('./verify-register-roundtrip-db.cjs')(ds);
    console.log('PASS: scoped preparation/approval counts match filters while pending files stay out of branch lists');
    console.log('PASS: historical generated files agree in SQL/API classification; client, branch, month and approval scope are enforced');
    console.log('PASS: legacy schema migration is idempotent; replacement saves generation time while preserving record identity and creation history');
  } finally {
    if (ds?.isInitialized) await ds.destroy();
    await db.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
