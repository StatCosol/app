// Synthetic fixtures in a disposable loopback database; never reads application DB settings.
const assert = require('node:assert/strict');
const path = require('node:path');
const { DataSource, Table } = require('typeorm');
const { PGlite } = require('./auditxpert-test-db.cjs');
const { HelpdeskService } = require('../dist/src/helpdesk/helpdesk.service');
const { HelpdeskTicketEntity } = require('../dist/src/helpdesk/entities/helpdesk-ticket.entity');
const { ClientEntity } = require('../dist/src/clients/entities/client.entity');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

async function main() {
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
    });
    await ds.initialize();
    const runner = ds.createQueryRunner();
    try {
      for (const entity of [ClientEntity, HelpdeskTicketEntity]) {
        await runner.createTable(Table.create(ds.getMetadata(entity), ds.driver), true, false);
      }
    } finally { await runner.release(); }
    await db.exec(`
      CREATE TABLE roles(id uuid PRIMARY KEY, code text);
      CREATE TABLE users(id uuid PRIMARY KEY, role_id uuid, deleted_at timestamptz, is_active boolean DEFAULT true);
      CREATE TABLE client_assignments_current(client_id uuid, assigned_to_user_id uuid, assignment_type text);
      CREATE TABLE client_branches(id uuid PRIMARY KEY, clientid uuid, isactive boolean DEFAULT true, isdeleted boolean DEFAULT false);
      CREATE TABLE user_branches(user_id uuid, branch_id uuid);
    `);
    await db.query("INSERT INTO roles VALUES($1,'PF_TEAM'),($2,'CRM'),($3,'EMPLOYEE')", [id(1), id(2), id(3)]);
    await db.query('INSERT INTO users(id,role_id) VALUES($1,$4),($2,$5),($3,$6)', [id(11), id(12), id(13), id(1), id(2), id(3)]);
    await db.query("INSERT INTO client_assignments_current VALUES($1,$2,'CRM')", [id(20), id(12)]);
    await db.query('INSERT INTO client_branches(id,clientid) VALUES($1,$3),($2,$4)', [id(30), id(31), id(20), id(21)]);
    await db.query('INSERT INTO user_branches VALUES($1,$2)', [id(14), id(30)]);

    const repo = ds.getRepository(HelpdeskTicketEntity);
    const service = new HelpdeskService(repo, {}, {}, ds);
    const pf = { id: id(11), roleCode: 'PF_TEAM' };
    const admin = { id: id(10), roleCode: 'ADMIN' };
    const client = { id: id(14), clientId: id(20), roleCode: 'CLIENT', userType: 'MASTER' };
    const seed = { id: id(40), clientId: id(20), branchId: id(30), category: 'PF', status: 'IN_PROGRESS', priority: 'NORMAL', description: 'Synthetic support request', createdByUserId: client.id, assignedToUserId: pf.id };
    await repo.save(seed);
    await repo.save({ ...seed, id: id(41), clientId: id(21), branchId: id(31), category: 'COMPLIANCE' });
    await assert.rejects(service.listTickets({ ...client, clientId: null }, {}), /Client context required/);
    assert.deepEqual((await service.listTickets({ ...client, userType: 'BRANCH' }, {})).map(t => t.id), [seed.id]);
    assert.equal((await service.listTickets({ ...client, userType: 'BRANCH' }, { branchId: id(31) })).length, 0);
    assert.deepEqual((await service.listTickets(pf, {})).map(t => t.id), [seed.id]);
    await assert.rejects(service.assignTicket(id(41), { assignedToUserId: id(13) }), /requires an admin or assigned CRM/);
    await assert.rejects(service.assignTicket(id(41), { assignedToUserId: id(12) }), /not assigned to this client/);
    await repo.update(seed.id, { category: 'COMPLIANCE' });
    assert.equal((await service.assignTicket(seed.id, { assignedToUserId: id(12) })).assignedToUserId, id(12));

    // Both operations read the same snapshot before either writes to PostgreSQL.
    async function race(first, second, initialStatus = 'IN_PROGRESS') {
      await repo.update(seed.id, { category: 'PF', status: initialStatus, assignedToUserId: pf.id });
      let reads = 0;
      let release;
      const gate = new Promise(resolve => { release = resolve; });
      const racingRepo = new Proxy(repo, {
        get(target, key) {
          if (key === 'findOne') return async (...args) => {
            const ticket = await target.findOne(...args);
            if (++reads <= 2) { if (reads === 2) release(); await gate; }
            return ticket;
          };
          const value = target[key];
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
      const racing = new HelpdeskService(racingRepo, {}, {}, ds);
      const outcomes = await Promise.allSettled([first(racing), second(racing)]);
      assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1);
      assert.equal(outcomes.find(result => result.status === 'rejected').reason.getStatus(), 409);
      return repo.findOneByOrFail({ id: seed.id });
    }
    const result = await race(
      svc => svc.updateTicketStatusScoped(pf, seed.id, { status: 'RESOLVED' }),
      svc => svc.assignTicket(seed.id, { assignedToUserId: null }),
    );
    assert.ok((result.status === 'RESOLVED' && result.assignedToUserId === pf.id) || (result.status === 'IN_PROGRESS' && result.assignedToUserId === null));
    assert.equal(result.description, seed.description);
    const closed = await race(
      svc => svc.updateTicketStatusScoped(client, seed.id, { status: 'CLOSED' }),
      svc => svc.updateTicketStatusScoped(admin, seed.id, { status: 'OPEN' }),
      'RESOLVED',
    );
    assert.ok(['CLOSED', 'OPEN'].includes(closed.status));
    assert.equal(await repo.count(), 2);
    console.log('PASS: client/branch isolation, PF queue scope, assignee eligibility, concurrent reassignment/status conflicts, and client closure race');
  } finally {
    if (ds?.isInitialized) await ds.destroy();
    await db.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
