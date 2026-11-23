// Synthetic fixtures in a disposable loopback database; never reads application DB settings.
const assert = require('node:assert/strict');
const path = require('node:path');
const { DataSource, Table } = require('typeorm');
const { PGlite } = require('./auditxpert-test-db.cjs');
const { HelpdeskService } = require('../dist/src/helpdesk/helpdesk.service');
const { HelpdeskTicketEntity } = require('../dist/src/helpdesk/entities/helpdesk-ticket.entity');
const { ClientEntity } = require('../dist/src/clients/entities/client.entity');
const { HelpdeskMessageEntity } = require('../dist/src/helpdesk/entities/helpdesk-message.entity');
const { HelpdeskMessageFileEntity } = require('../dist/src/helpdesk/entities/helpdesk-message-file.entity');
const { FilesService } = require('../dist/src/files/files.service');
const { RegistrationRequestsController } = require('../dist/src/helpdesk/registration-requests.controller');
const fs = require('node:fs');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

async function main(poolSize) {
  const db = new PGlite();
  let ds;
  try {
    await db.ready;
    ds = new DataSource({
      type: 'postgres', host: '127.0.0.1',
      port: Number(process.env.AUDITXPERT_TEST_PORT || 55439),
      username: process.env.AUDITXPERT_TEST_USER || 'monthly_close_test',
      password: process.env.AUDITXPERT_TEST_PASSWORD, database: db.name,
      entities: [path.join(__dirname, '../dist/src/**/*.entity.js')], synchronize: false,
      // Review transactions must not acquire a second pooled connection.
      extra: { max: poolSize, connectionTimeoutMillis: 1000 },
    });
    await ds.initialize();
    const runner = ds.createQueryRunner();
    try {
      for (const entity of [ClientEntity, HelpdeskTicketEntity, HelpdeskMessageEntity, HelpdeskMessageFileEntity]) {
        await runner.createTable(Table.create(ds.getMetadata(entity), ds.driver), true, false);
      }
    } finally { await runner.release(); }
    await db.exec(`
      CREATE TABLE roles(id uuid PRIMARY KEY, code text);
      CREATE TABLE users(id uuid PRIMARY KEY, role_id uuid, name text DEFAULT 'Sample user', deleted_at timestamptz, is_active boolean DEFAULT true);
      CREATE TABLE client_assignments_current(client_id uuid, assigned_to_user_id uuid, assignment_type text);
      CREATE TABLE client_branches(id uuid PRIMARY KEY, clientid uuid, isactive boolean DEFAULT true, isdeleted boolean DEFAULT false);
      CREATE TABLE user_branches(user_id uuid, branch_id uuid);
      CREATE TABLE audits(id uuid PRIMARY KEY, client_id uuid, branch_id uuid, notes text, audit_code text);
      CREATE TABLE audit_observations(id uuid PRIMARY KEY, audit_id uuid, observation text);
    `);
    await db.query("INSERT INTO roles VALUES($1,'PF_TEAM'),($2,'CRM'),($3,'EMPLOYEE')", [id(1), id(2), id(3)]);
    await db.query('INSERT INTO users(id,role_id) VALUES($1,$4),($2,$5),($3,$6)', [id(11), id(12), id(13), id(1), id(2), id(3)]);
    await db.query("INSERT INTO client_assignments_current VALUES($1,$2,'CRM')", [id(20), id(12)]);
    await db.query('INSERT INTO client_branches(id,clientid) VALUES($1,$3),($2,$4)', [id(30), id(31), id(20), id(21)]);
    await db.query('INSERT INTO user_branches VALUES($1,$2)', [id(14), id(30)]);

    const repo = ds.getRepository(HelpdeskTicketEntity);
    const messages = ds.getRepository(HelpdeskMessageEntity);
    const attachments = ds.getRepository(HelpdeskMessageFileEntity);
    const service = new HelpdeskService(repo, messages, attachments, ds);
    const pf = { id: id(11), roleCode: 'PF_TEAM' };
    const admin = { id: id(10), roleCode: 'ADMIN' };
    const client = { id: id(14), clientId: id(20), roleCode: 'CLIENT', userType: 'MASTER' };

    await db.exec(fs.readFileSync(path.join(__dirname, '../migrations/20261123_registration_request_test_scope.sql'), 'utf8'));
    // Reapplying the additive migration is safe and leaves classification unchanged.
    await db.exec(fs.readFileSync(path.join(__dirname, '../migrations/20261123_registration_request_test_scope.sql'), 'utf8'));
    const actual = await service.createTicket(client, { category: 'COMPLIANCE', subCategory: 'REGISTRATION_APPLY', branchId: id(30), description: 'Registration ID: NEW\nNotes: Customer asked to test an alarm', isTest: false });
    const snapshot = JSON.stringify(await repo.findOneBy({ id: actual.id }));
    const baseline = await service.adminStats();
    const controller = new RegistrationRequestsController(service);
    const branch = { ...client, userType: 'BRANCH' };
    const crm = { id: id(12), roleCode: 'CRM' };
    const ticket = await controller.create(branch, { branchId: id(30), recordScope: 'TEST', registrationType: 'Factory licence workflow fixture', authority: 'Synthetic authority', notes: 'TEST ONLY: no statutory application\nFirst submission' });
    assert.equal(ticket.isTest, true);
    assert.equal(ticket.slaDueAt, null);
    const query = { branchId: id(30), recordScope: 'TEST' };
    for (const user of [client, branch, crm]) {
      assert.deepEqual((await controller.list(user, query)).map(t => t.id), [ticket.id]);
      assert.deepEqual((await controller.list(user, { ...query, recordScope: 'ACTUAL' })).map(t => t.id), [actual.id]);
    }
    assert.equal((await service.adminListTickets({})).total, 1);
    assert.equal((await service.adminListTickets({ recordScope: 'TEST' })).total, 1);
    assert.deepEqual(await service.adminStats(), baseline);
    await assert.rejects(db.query('UPDATE helpdesk_tickets SET is_test=false WHERE id=$1', [ticket.id]), /immutable/);
    await assert.rejects(db.query('UPDATE helpdesk_tickets SET category=\'GENERIC\' WHERE id=$1', [ticket.id]), /registration action/);
    const act = (user, expectedStatus, action, remarks) => controller.action(user, ticket.id, { expectedStatus, action, remarks, recordScope: 'TEST' });
    await act(crm, 'OPEN', 'CORRECTION', 'TEST ONLY: correct the authority name');
    for (const user of [client, branch]) {
      const detail = await controller.detail(user, ticket.id);
      assert.equal(detail.ticket.status, 'AWAITING_CLIENT');
      assert.equal(detail.messages[0].message, '[CORRECTION] TEST ONLY: correct the authority name');
    }
    await act(branch, 'AWAITING_CLIENT', 'RESUBMIT', 'TEST ONLY: corrected authority and submitted evidence\nSecond line retained');
    await act(crm, 'IN_PROGRESS', 'APPROVE', 'TEST ONLY: corrected request reviewed and approved; no licence issued');
    for (const user of [client, branch, crm]) {
      const detail = await controller.detail(user, ticket.id);
      assert.equal(detail.ticket.status, 'RESOLVED');
      assert.equal(detail.messages.length, 3);
      assert.match(detail.messages[1].message, /Second line retained/);
      assert.match(detail.messages[2].message, /approved/);
    }
    await assert.rejects(act(branch, 'RESOLVED', 'RESUBMIT', 'No reopening'), /not available/);
    await assert.rejects(act(crm, 'IN_PROGRESS', 'APPROVE', 'Duplicate'), /Request changed/);
    await assert.rejects(controller.detail({ ...client, clientId: id(21) }, ticket.id), /Not your client/);
    await assert.rejects(controller.detail({ id: id(99), roleCode: 'CRM' }, ticket.id), /Not assigned/);
    assert.deepEqual(await service.adminStats(), baseline);
    assert.equal(JSON.stringify(await repo.findOneBy({ id: actual.id })), snapshot);
    // Forced message failure must roll back the state transition too.
    const second = await controller.create(branch, { branchId: id(30), recordScope: 'TEST', registrationType: 'Rollback fixture', authority: 'Synthetic', notes: 'TEST ONLY' });
    await db.exec('CREATE TABLE branch_registrations(id uuid PRIMARY KEY, client_id uuid, branch_id uuid, status text, type text, registration_number text, remarks text)');
    await db.query("INSERT INTO branch_registrations VALUES($1,$3,$4,'ACTIVE','Actual licence',NULL,NULL),($2,$3,$4,'ACTIVE','TEST ONLY licence',NULL,NULL)", [id(70), id(71), client.clientId, id(30)]);
    const linkedRequest = (isTest, registration) => service.createTicket(branch, { category: 'COMPLIANCE', subCategory: 'REGISTRATION_RENEW', branchId: id(30), isTest, description: 'Registration ID: ' + registration });
    await assert.rejects(linkedRequest(true, id(70)), /same actual.test scope/);
    await assert.rejects(linkedRequest(false, id(71)), /same actual.test scope/);
    const linked = await linkedRequest(true, id(71)); assert.equal(linked.isTest, true);
    await db.exec('ALTER TABLE branch_registrations ADD COLUMN authority text, ADD COLUMN expiry_date date');
    await db.query("UPDATE branch_registrations SET authority='Synthetic authority', expiry_date='2026-10-31' WHERE id=$1", [id(71)]);
    const licenceSnapshot = JSON.stringify(await db.query('SELECT * FROM branch_registrations ORDER BY id'));
    for (const user of [client, branch]) {
      assert.deepEqual((await controller.renewalOptions(user, { branchId: id(30), recordScope: 'TEST' })).map(r => r.id), [id(71)]);
      assert.deepEqual((await controller.renewalOptions(user, { branchId: id(30), recordScope: 'ACTUAL' })).map(r => r.id), [id(70)]);
    }
    await assert.rejects(controller.renewalOptions(branch, { branchId: id(31), recordScope: 'TEST' }), /outside your scope/);
    const renewalDto = { branchId: id(30), recordScope: 'TEST', action: 'RENEW', registrationId: id(71), registrationType: 'Untrusted title', authority: 'Untrusted authority', notes: 'TEST ONLY renewal request' };
    await assert.rejects(controller.create(branch, { ...renewalDto, registrationId: id(70) }), /same actual.test scope/);
    const renewal = await controller.create(branch, renewalDto);
    assert.equal(renewal.slaDueAt, null);
    assert.equal(renewal.subCategory, 'REGISTRATION_RENEW');
    assert.match(renewal.description, /TEST ONLY licence/); assert.doesNotMatch(renewal.description, /Untrusted/);
    for (const [user, expectedStatus, action] of [[crm, 'OPEN', 'REVIEW'], [crm, 'IN_PROGRESS', 'CORRECTION'], [client, 'AWAITING_CLIENT', 'RESUBMIT'], [crm, 'IN_PROGRESS', 'APPROVE']]) {
      await controller.action(user, renewal.id, { expectedStatus, action, remarks: 'TEST ONLY renewal ' + action, recordScope: 'TEST' });
    }
    for (const user of [client, branch, crm]) {
      const report = await controller.detail(user, renewal.id);
      assert.equal(report.ticket.status, 'RESOLVED'); assert.equal(report.messages.length, 4);
    }
    assert.equal(JSON.stringify(await db.query('SELECT * FROM branch_registrations ORDER BY id')), licenceSnapshot);
    assert.deepEqual(await service.adminStats(), baseline);
    const before = await messages.count({ where: { ticketId: second.id } });
    await db.exec(`CREATE FUNCTION reject_fixture_message() RETURNS trigger AS $$ BEGIN IF NEW.message LIKE '%force rollback%' THEN RAISE EXCEPTION 'synthetic failure'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql;
      CREATE TRIGGER reject_fixture_message BEFORE INSERT ON helpdesk_messages FOR EACH ROW EXECUTE FUNCTION reject_fixture_message();`);
    await assert.rejects(controller.action(crm, second.id, { ...{ expectedStatus: 'OPEN', recordScope: 'TEST', action: 'REVIEW' }, remarks: 'force rollback' }), /synthetic failure/);
    assert.equal((await repo.findOneBy({ id: second.id })).status, 'OPEN');
    assert.equal(await messages.count({ where: { ticketId: second.id } }), before);
    const race = await Promise.allSettled(['REVIEW', 'CORRECTION'].map(action => controller.action(crm, second.id, { expectedStatus: 'OPEN', recordScope: 'TEST', action, remarks: 'Concurrent fixture action' })));
    assert.equal(race.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal(race.filter(r => r.status === 'rejected').length, 1);
    assert.equal(await messages.count({ where: { ticketId: second.id } }), 1);
    assert.equal(JSON.stringify(await repo.findOneBy({ id: actual.id })), snapshot);
    assert.deepEqual(await service.adminStats(), baseline);
    console.log(`PASS (pool size ${poolSize}): registration application and renewal submission, correction, resubmission, approval, Client/Branch/CRM history, default queue isolation, unchanged actual row/counts and licence expiry dates, immutable classification, cross-tenant permissions, atomic rollback and concurrent review serialization. Disposable local fixtures only.`);
  } finally {
    if (ds?.isInitialized) await ds.destroy();
    await db.close();
  }
}
main(1).then(() => main(2)).catch(error => { console.error(error); process.exitCode = 1; });
