const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { DataSource } = require('typeorm');
const { PGlite } = require('./auditxpert-test-db.cjs');
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
    console.log('PASS: legacy schema migration is idempotent; replacement saves generation time while preserving record identity and creation history');
  } finally {
    if (ds?.isInitialized) await ds.destroy();
    await db.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
