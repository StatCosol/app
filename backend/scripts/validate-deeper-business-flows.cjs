// Real business operations on an isolated PostgreSQL schema; no outbound services.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Client } = require('pg');
const { DataSource } = require('typeorm');
const {
  ClientDepartmentContactEntity: Contact,
} = require('../dist/src/client-contacts/client-department-contact.entity');
const {
  ThresholdMasterEntity: Threshold,
} = require('../dist/src/masters/entities/threshold-master.entity');
const {
  EmployeeNominationEntity: Nomination,
} = require('../dist/src/employees/entities/employee-nomination.entity');
const {
  EmployeeNominationMemberEntity: Member,
} = require('../dist/src/employees/entities/employee-nomination-member.entity');
const {
  SlaTaskEntity: Sla,
} = require('../dist/src/sla/entities/sla-task.entity');
const {
  ClientContactsService,
} = require('../dist/src/client-contacts/client-contacts.service');
const {
  ThresholdResolverService,
} = require('../dist/src/masters/services/threshold-resolver.service');
const {
  NominationsService,
} = require('../dist/src/nominations/nominations.service');
const {
  NominationsController,
} = require('../dist/src/nominations/nominations.controller');
const { SlaService } = require('../dist/src/sla/sla.service');
const { CalendarService } = require('../dist/src/calendar/calendar.service');
const cfg = {
  host: '127.0.0.1',
  port: Number(process.env.AUTOMATION_TEST_PORT || 55439),
  user: process.env.AUTOMATION_TEST_USER || 'register_test',
  password: process.env.AUTOMATION_TEST_PASSWORD || undefined,
  database: process.env.AUTOMATION_TEST_DATABASE || 'postgres',
};
(async () => {
  const control = new Client(cfg);
  await control.connect();
  const schema = 'business_flow_' + randomUUID().replaceAll('-', '');
  let ds;
  const results = [];
  const check = async (name, fn) => {
    try {
      await fn();
      results.push({ name, status: 'PASS' });
    } catch (e) {
      results.push({ name, status: 'FAIL', error: e.message });
    }
  };
  try {
    await control.query('CREATE SCHEMA ' + schema);
    ds = new DataSource({
      type: 'postgres',
      ...cfg,
      username: cfg.user,
      uuidExtension: 'pgcrypto',
      schema,
      extra: { options: '-c search_path=' + schema },
      entities: [Contact, Threshold, Nomination, Member, Sla],
    });
    await ds.initialize();
    await ds.synchronize();
    const company = randomUUID(),
      otherCompany = randomUUID(),
      b1 = randomUUID(),
      b2 = randomUUID(),
      foreign = randomUUID(),
      emp = randomUUID(),
      actor = randomUUID();
    const contacts = new ClientContactsService(ds.getRepository(Contact));
    const first = await contacts.create(
      {
        clientId: company,
        department: 'HR',
        name: ' Alice ',
        email: 'alice@example.invalid',
      },
      actor,
    );
    await contacts.create({
      clientId: otherCompany,
      department: 'HR',
      name: 'Other',
      email: 'other@example.invalid',
    });
    await check(
      'contact: empty allowed-client set returns no records',
      async () =>
        assert.equal((await contacts.listByDepartment('HR', [])).length, 0),
    );
    await check(
      'contact: assigned-client filter excludes other company',
      async () =>
        assert.deepEqual(
          (await contacts.listByDepartment('HR', [company])).map((x) => x.id),
          [first.id],
        ),
    );
    await check(
      'contact: trimmed/case-insensitive duplicate is rejected',
      async () =>
        assert.rejects(
          contacts.create({
            clientId: company,
            department: 'HR',
            name: 'Duplicate',
            email: ' ALICE@example.invalid ',
          }),
          (e) => e.getStatus?.() === 400,
        ),
    );
    for (const row of await ds
      .getRepository(Contact)
      .findBy({ clientId: company }))
      if (row.id !== first.id) await ds.getRepository(Contact).delete(row.id);
    await check(
      'contact: deactivate, omit from active emails, then reactivate',
      async () => {
        await contacts.update(first.id, { isActive: false }, actor);
        assert.deepEqual(await contacts.getActiveEmails(company, 'HR'), []);
        await contacts.update(first.id, { isActive: true }, actor);
        assert.ok(
          (await contacts.getActiveEmails(company, 'HR')).includes(
            'alice@example.invalid',
          ),
        );
      },
    );
    const thresholds = new ThresholdResolverService(
      ds.getRepository(Threshold),
    );
    await ds.getRepository(Threshold).save([
      {
        code: 'SAMPLE',
        valueNumber: '10',
        stateCode: null,
        effectiveFrom: '2026-01-01',
      },
      {
        code: 'SAMPLE',
        valueNumber: '20',
        stateCode: 'TS',
        effectiveFrom: '2026-06-01',
        effectiveTo: '2026-06-30',
      },
      {
        code: 'SAMPLE',
        valueNumber: '30',
        stateCode: 'TS',
        effectiveFrom: '2026-07-01',
      },
      {
        code: 'SAMPLE',
        valueNumber: '99',
        stateCode: 'TS',
        effectiveFrom: '2026-08-01',
        isActive: false,
      },
    ]);
    for (const [state, date, value] of [
      ['TS', '2026-05-31', 10],
      ['TS', '2026-06-30', 20],
      ['TS', '2026-07-01', 30],
      ['AP', '2026-09-01', 10],
    ])
      await check('threshold: ' + state + ' ' + date, async () =>
        assert.equal(await thresholds.getNumber('SAMPLE', state, date), value),
      );
    await check('threshold: missing configuration fails explicitly', async () =>
      assert.rejects(
        thresholds.getNumber('MISSING', 'TS', '2026-09-01'),
        (e) => e.getStatus?.() === 404,
      ),
    );
    await ds.query(
      'CREATE TABLE sample_employees(id uuid,client_id uuid,branch_id uuid)',
    );
    await ds.query('INSERT INTO sample_employees VALUES($1,$2,$3)', [
      emp,
      company,
      b2,
    ]);
    const employeeRepo = {
      findOne: async ({ where }) =>
        (
          await ds.query(
            'SELECT id,client_id AS "clientId",branch_id AS "branchId" FROM sample_employees WHERE id=$1 AND client_id=$2',
            [where.id, where.clientId],
          )
        )[0] || null,
    };
    const nominations = new NominationsService(
      employeeRepo,
      ds.getRepository(Nomination),
      ds.getRepository(Member),
      {},
    );
    const controller = new NominationsController(nominations);
    const user = {
      id: actor,
      userId: actor,
      clientId: company,
      roleCode: 'CLIENT',
      userType: 'BRANCH',
      branchIds: [b1, b2],
    };
    await check('nomination: second assigned branch is readable', async () =>
      assert.equal((await controller.get(user, emp, 'PF')).employeeId, emp),
    );
    await check(
      'nomination: branch user with no assignments is denied',
      async () =>
        assert.rejects(
          controller.get({ ...user, branchIds: [] }, emp, 'PF'),
          (e) => e.getStatus?.() === 403,
        ),
    );
    await check('nomination: foreign branch is denied', async () =>
      assert.rejects(
        controller.get({ ...user, branchIds: [foreign] }, emp, 'PF'),
        (e) => e.getStatus?.() === 403,
      ),
    );
    await check('nomination: foreign company is denied', async () =>
      assert.rejects(
        controller.get({ ...user, clientId: otherCompany }, emp, 'PF'),
        (e) => e.getStatus?.() === 404,
      ),
    );
    const ctx = { userId: actor, clientId: company, roleCode: 'CLIENT' };
    await check('nomination: missing company context is rejected', async () => {
      await assert.rejects(
        controller.get({ ...user, clientId: null }, emp, 'PF'),
        (e) => e.getStatus?.() === 403,
      );
    });
    const draft = {
      employeeId: emp,
      nominationType: 'PF',
      witnessName: 'Original witness',
      nominees: [{ memberName: 'Original nominee', sharePct: '100' }],
    };
    const saved = await nominations.saveNomination(ctx, draft);
    for (const share of ['-1', '101', 'NaN', 'Infinity', 'abc'])
      await check(
        'nomination: invalid share ' + share + ' fails before writes',
        async () => {
          await nominations.saveNomination(ctx, draft);
          await assert.rejects(
            nominations.saveNomination(ctx, {
              ...draft,
              nominees: [{ memberName: 'Invalid', sharePct: share }],
            }),
            (e) => e.getStatus?.() === 400,
          );
          assert.equal(
            (await nominations.getNomination(ctx, emp, 'PF')).nominees[0]
              .memberName,
            'Original nominee',
          );
        },
      );
    await check(
      'nomination: two shares totaling 100 succeed; excess cents fail',
      async () => {
        await nominations.saveNomination(ctx, {
          ...draft,
          nominees: [
            { memberName: 'First', sharePct: '60' },
            { memberName: 'Second', sharePct: '40' },
          ],
        });
        await assert.rejects(
          nominations.saveNomination(ctx, {
            ...draft,
            nominees: [
              { memberName: 'First', sharePct: '60' },
              { memberName: 'Second', sharePct: '40.01' },
            ],
          }),
          (e) => e.getStatus?.() === 400,
        );
        const members = (await nominations.getNomination(ctx, emp, 'PF'))
          .nominees;
        assert.equal(members.length, 2);
        assert.equal(
          members.reduce((n, m) => n + Number(m.sharePct), 0),
          100,
        );
      },
    );
    // Restore fixture after deliberately probing unsafe legacy writes.
    await nominations.saveNomination(ctx, draft);
    await check(
      'nomination: failed replacement retains header and existing nominees',
      async () => {
        await ds.query(
          "ALTER TABLE employee_nomination_members ADD CONSTRAINT test_reject_member CHECK (member_name <> 'FAIL_STORAGE')",
        );
        try {
          await assert.rejects(
            nominations.saveNomination(ctx, {
              ...draft,
              witnessName: 'Changed witness',
              nominees: [{ memberName: 'FAIL_STORAGE', sharePct: '100' }],
            }),
          );
          const row = await nominations.getNomination(ctx, emp, 'PF');
          assert.equal(row.witnessName, 'Original witness');
          assert.equal(row.nominees[0]?.memberName, 'Original nominee');
        } finally {
          await ds.query(
            'ALTER TABLE employee_nomination_members DROP CONSTRAINT test_reject_member',
          );
        }
      },
    );
    await check(
      'nomination: concurrent first saves produce one complete record',
      async () => {
        await ds.query(
          `CREATE FUNCTION delay_nomination_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(0.1); RETURN NEW; END $$`,
        );
        await ds.query(
          'CREATE TRIGGER slow_nomination_insert BEFORE INSERT ON employee_nominations FOR EACH ROW EXECUTE FUNCTION delay_nomination_insert()',
        );
        const input = { ...draft, nominationType: 'ESI' };
        await Promise.all([
          nominations.saveNomination(ctx, input),
          nominations.saveNomination(ctx, input),
        ]);
        const rows = await ds
          .getRepository(Nomination)
          .findBy({ employeeId: emp, nominationType: 'ESI' });
        assert.equal(rows.length, 1);
        assert.equal(
          await ds.getRepository(Member).countBy({ nominationId: rows[0].id }),
          1,
        );
      },
    );
    await check(
      'nomination: saved record retains employee company and branch',
      async () => {
        await nominations.saveNomination(ctx, draft);
        const row = await ds
          .getRepository(Nomination)
          .findOneBy({ id: saved.nominationId });
        assert.equal(row.clientId, company);
        assert.equal(row.branchId, b2);
      },
    );
    for (const status of ['SUBMITTED', 'APPROVED'])
      await check(
        'nomination: ' + status + ' snapshot cannot be overwritten',
        async () => {
          await ds
            .getRepository(Nomination)
            .update(saved.nominationId, { status });
          await assert.rejects(
            nominations.saveNomination(ctx, {
              ...draft,
              witnessName: 'Changed protected record',
            }),
            (e) => e.getStatus?.() === 400,
          );
          assert.equal(
            (
              await ds
                .getRepository(Nomination)
                .findOneBy({ id: saved.nominationId })
            ).status,
            status,
          );
          assert.equal(
            (await nominations.getNomination(ctx, emp, 'PF')).nominees[0]
              .memberName,
            'Original nominee',
          );
        },
      );
    await check(
      'nomination: correcting rejection clears prior review fields and creates draft',
      async () => {
        await ds
          .getRepository(Nomination)
          .update(saved.nominationId, {
            status: 'REJECTED',
            approvedAt: new Date(),
            approvedByUserId: actor,
            rejectionReason: 'Correct share',
          });
        await nominations.saveNomination(ctx, draft);
        const row = await ds
          .getRepository(Nomination)
          .findOneBy({ id: saved.nominationId });
        assert.equal(row.status, 'DRAFT');
        assert.equal(row.approvedAt, null);
        assert.equal(row.rejectionReason, null);
      },
    );
    const scope = {
      where: async () => ({ clientId: company }),
      assertRecord: async (u, row) => {
        if (row.clientId !== u.clientId) throw new Error('outside scope');
      },
    };
    const sla = new SlaService(ds.getRepository(Sla), scope);
    const task = await ds.getRepository(Sla).save({
      clientId: company,
      branchId: b2,
      title: 'Sample deadline',
      module: 'RETURNS',
      dueDate: '2000-01-01',
      status: 'OPEN',
    });
    await check('SLA: overdue classification, close and reopen', async () => {
      assert.equal(
        (await sla.list(company, user, {})).items[0].status,
        'OVERDUE',
      );
      await sla.update(company, user, task.id, { status: 'CLOSED' });
      assert.ok(
        (await ds.getRepository(Sla).findOneBy({ id: task.id })).closedAt,
      );
      await sla.update(company, user, task.id, { status: 'OPEN' });
      assert.equal(
        (await ds.getRepository(Sla).findOneBy({ id: task.id })).closedAt,
        null,
      );
    });
    await check('SLA: branch user cannot change deadline', async () =>
      assert.rejects(
        sla.update(company, user, task.id, { dueDate: '2026-12-01' }),
        (e) => e.getStatus?.() === 403,
      ),
    );
    await check('SLA: invalid date rejected without mutation', async () => {
      await assert.rejects(
        sla.update(company, { ...user, roleCode: 'CRM' }, task.id, {
          dueDate: '2026-02-30',
        }),
        (e) => e.getStatus?.() === 400,
      );
      assert.equal(
        (await ds.getRepository(Sla).findOneBy({ id: task.id })).dueDate,
        '2000-01-01',
      );
    });
    await ds.query(
      'CREATE TABLE client_branches(id uuid, clientid uuid, branchname text)',
    );
    await ds.query(
      "INSERT INTO client_branches VALUES($1,$3,'First'),($2,$3,'Second')",
      [b1, b2, company],
    );
    await ds.query(
      'CREATE TABLE branch_registrations(id uuid,type text,registration_number text,authority text,expiry_date date,branch_id uuid,client_id uuid,status text)',
    );
    for (const [branch, client, date, status] of [
      [b1, company, '2026-09-30', 'ACTIVE'],
      [b2, company, '2026-09-01', 'ACTIVE'],
      [foreign, otherCompany, '2026-09-15', 'ACTIVE'],
      [b1, company, '2026-10-01', 'ACTIVE'],
      [b1, company, '2026-09-02', 'DELETED'],
    ])
      await ds.query(
        "INSERT INTO branch_registrations VALUES($1,'SAMPLE',NULL,NULL,$2,$3,$4,$5)",
        [randomUUID(), date, branch, client, status],
      );
    const calendar = new CalendarService(ds, {}, {});
    const params = {
      clientId: company,
      branchIds: [b1, b2],
      from: '2026-09-01',
      to: '2026-09-30',
      module: 'REGISTRATION',
    };
    await check(
      'calendar: includes both branch/date boundaries, sorts and excludes deleted/foreign',
      async () => {
        const r = await calendar.getCalendar(params);
        assert.deepEqual(
          r.items.map((x) => x.branchName),
          ['Second', 'First'],
        );
        assert.deepEqual(
          r.items.map((x) => x.date),
          ['2026-09-01', '2026-09-30'],
        );
      },
    );
    await check(
      'calendar: denied explicit branch returns no records',
      async () =>
        assert.deepEqual(
          (await calendar.getCalendar({ ...params, branchId: foreign })).items,
          [],
        ),
    );
  } finally {
    if (ds?.isInitialized) await ds.destroy();
    await control.query('DROP SCHEMA ' + schema + ' CASCADE');
    await control.end();
  }
  console.log(JSON.stringify({ results }, null, 2));
  if (results.some((r) => r.status === 'FAIL')) process.exitCode = 1;
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
