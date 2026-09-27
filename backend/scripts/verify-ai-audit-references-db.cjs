require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { DataSource } = require('typeorm');
const { PGlite } = require('./auditxpert-test-db.cjs');
const { AiAuditService } = require('../dist/src/ai/ai-audit.service');
const { AiAuditObservationEntity } = require('../dist/src/ai/entities/ai-audit-observation.entity');
const { ClientEntity } = require('../dist/src/clients/entities/client.entity');

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
      database: db.name, applicationName: 'ai-audit-reference-regression',
      // Synchronize only the UUID-named disposable test database.
      synchronize: true, entities: [ClientEntity, AiAuditObservationEntity],
    });
    await ds.initialize();
    await db.exec(`
      CREATE TABLE client_branches(id uuid PRIMARY KEY, clientid uuid REFERENCES clients, branchname text, statecode text, city text, isdeleted boolean DEFAULT false);
      CREATE TABLE audits(id uuid PRIMARY KEY, client_id uuid REFERENCES clients, branch_id uuid REFERENCES client_branches);
    `);
    const clients = await ds.getRepository(ClientEntity).save([
      { clientCode: 'TEST-A', clientName: 'Synthetic company A' },
      { clientCode: 'TEST-B', clientName: 'Synthetic company B' },
    ]);
    const branchA = 'aabbccdd-1122-4334-8556-abcdef012345';
    const auditA = 'abcdef01-1122-4334-8556-abcdef012345';
    const [branchB, otherA, auditB, companyAudit] = Array.from({ length: 4 }, () => randomUUID());
    for (const [id, clientId, name, state] of [
      [branchA, clients[0].id, 'Branch A', 'TS'],
      [branchB, clients[1].id, 'Branch B', 'KA'],
      [otherA, clients[0].id, 'Other branch A', 'AP'],
    ]) await db.query("INSERT INTO client_branches(id,clientid,branchname,statecode,city) VALUES ($1,$2,$3,$4,'Test city')", [id, clientId, name, state]);
    for (const [id, clientId, branchId] of [[auditA, clients[0].id, branchA], [auditB, clients[1].id, branchB], [companyAudit, clients[0].id, null]]) {
      await db.query('INSERT INTO audits VALUES ($1,$2,$3)', [id, clientId, branchId]);
    }
    let providerChecks = 0;
    const repo = ds.getRepository(AiAuditObservationEntity);
    const service = new AiAuditService(repo, ds, { isReady: async () => { providerChecks++; return false; } });
    const input = { clientId: clients[0].id, auditId: auditA, findingDescription: ' Synthetic finding ' };
    for (const changes of [
      { auditId: auditB }, { auditId: randomUUID() },
      { branchId: otherA }, { branchId: branchB },
      { auditId: auditA.toUpperCase(), branchId: otherA.toUpperCase() },
      { auditId: undefined, branchId: branchB },
      { auditId: undefined, branchId: randomUUID() },
    ]) await assert.rejects(service.generateObservation({ ...input, ...changes }), error => error.status === 400);
    assert.equal(await repo.count(), 0);
    assert.equal(providerChecks, 0);

    const inferred = await service.generateObservation(input);
    const saved = await repo.findOneByOrFail({ id: inferred.id });
    assert.equal(saved.branchId, branchA);
    assert.equal(saved.auditId, auditA);
    assert.equal(saved.clientId, clients[0].id);
    assert.equal(saved.applicableState, 'TS');
    assert.equal(saved.findingDescription, 'Synthetic finding');
    await service.generateObservation({ ...input, branchId: branchA });
    const uppercase = await service.generateObservation({ ...input, auditId: auditA.toUpperCase(), branchId: branchA.toUpperCase() });
    const canonical = await repo.findOneByOrFail({ id: uppercase.id });
    assert.equal(canonical.auditId, auditA);
    assert.equal(canonical.branchId, branchA);
    const company = await service.generateObservation({ ...input, auditId: companyAudit });
    assert.equal(company.branchId, null);
    const specific = await service.generateObservation({ ...input, auditId: companyAudit, branchId: otherA });
    assert.equal(specific.branchId, otherA);
    const standalone = await service.generateObservation({ ...input, auditId: undefined });
    assert.equal(standalone.auditId, null);

    const count = await repo.count();
    const checks = providerChecks;
    await db.query('UPDATE client_branches SET isdeleted=true WHERE id=$1', [branchA]);
    await assert.rejects(service.generateObservation(input), error => error.status === 400);
    await ds.getRepository(ClientEntity).update(clients[0].id, { isDeleted: true });
    await assert.rejects(service.generateObservation(input), error => error.status === 404);
    assert.equal(await repo.count(), count);
    assert.equal(providerChecks, checks);
    console.log('PASS: real PostgreSQL/TypeORM AI audit references, cross-company and branch mismatch rejection without writes/provider calls, inferred branch/state, standalone and company-wide compatibility, deleted-owner rejection.');
  } finally {
    if (ds?.isInitialized) await ds.destroy();
    await db.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
