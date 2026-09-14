// Real PostgreSQL option tests, isolated schema, fictional data, no file or mail delivery.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const { Client } = require('pg');
const { DataSource, Table } = require('typeorm');
const { ForbiddenException } = require('@nestjs/common');
const {
  OperationalScopeService,
} = require('../dist/src/access/operational-scope.service');
const { NoticesService } = require('../dist/src/notices/notices.service');
const { NoticeEntity } = require('../dist/src/notices/entities/notice.entity');
const {
  NoticeDocumentEntity,
} = require('../dist/src/notices/entities/notice-document.entity');
const {
  NoticeActivityLogEntity,
} = require('../dist/src/notices/entities/notice-activity-log.entity');
const {
  ChecklistsService,
} = require('../dist/src/checklists/checklists.service');
const {
  ChecklistsController,
} = require('../dist/src/checklists/checklists.controller');
const {
  BranchComplianceEntity,
} = require('../dist/src/checklists/entities/branch-compliance.entity');
const { ClientEntity } = require('../dist/src/clients/entities/client.entity');
const { BranchEntity } = require('../dist/src/branches/entities/branch.entity');
const { UserEntity } = require('../dist/src/users/entities/user.entity');
const cfg = {
  host: '127.0.0.1',
  port: Number(process.env.AUTOMATION_TEST_PORT || 55439),
  user: process.env.AUTOMATION_TEST_USER || 'register_test',
  password: process.env.AUTOMATION_TEST_PASSWORD || undefined,
  database: process.env.AUTOMATION_TEST_DATABASE || 'postgres',
};
async function main() {
  const admin = new Client(cfg);
  await admin.connect();
  const schema = 'notice_options_' + randomUUID().replaceAll('-', '');
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
    await admin.query('CREATE SCHEMA ' + schema);
    ds = new DataSource({
      type: 'postgres',
      ...cfg,
      username: cfg.user,
      schema,
      uuidExtension: 'pgcrypto',
      extra: { options: '-c search_path=' + schema + ',public' },
      entities: [path.join(__dirname, '../dist/src/**/*.entity.js')],
      synchronize: false,
    });
    await ds.initialize();
    const runner = ds.createQueryRunner();
    try {
      for (const entity of [
        ClientEntity,
        BranchEntity,
        UserEntity,
        NoticeEntity,
        NoticeDocumentEntity,
        NoticeActivityLogEntity,
        BranchComplianceEntity,
      ])
        await runner.createTable(
          Table.create(ds.getMetadata(entity), ds.driver),
          true,
          false,
        );
    } finally {
      await runner.release();
    }
    const company = randomUUID(),
      other = randomUUID(),
      b1 = randomUUID(),
      b2 = randomUUID(),
      b3 = randomUUID(),
      foreign = randomUUID(),
      actor = randomUUID();
    const branchCompany = new Map([
      [b1, company],
      [b2, company],
      [b3, company],
      [foreign, other],
    ]);
    const user = (roleCode, branchIds = [b1, b2]) => ({
      id: actor,
      userId: actor,
      roleCode,
      clientId: company,
      userType: roleCode === 'CLIENT' ? 'BRANCH' : null,
      branchIds,
    });
    const getScope = async (u) =>
      u.roleCode === 'ADMIN'
        ? { level: 'all' }
        : u.roleCode === 'CLIENT'
          ? { level: 'branches', clientId: company, branchIds: u.branchIds }
          : { level: 'clients', clientIds: u.empty ? [] : [company] };
    const access = {
      getScope,
      getCcoClientIds: async () => [company],
      assertClientAllowed: async (u, c) => {
        if (u.roleCode !== 'ADMIN' && c !== company)
          throw new ForbiddenException();
      },
      assertBranchAllowed: async (u, b) => {
        if (
          u.roleCode !== 'ADMIN' &&
          (branchCompany.get(b) !== company ||
            (u.roleCode === 'CLIENT' && !u.branchIds.includes(b)))
        )
          throw new ForbiddenException();
      },
      assertCcoClientAllowed: async (_u, c) => {
        if (c !== company) throw new ForbiddenException();
      },
      assertCcoBranchAllowed: async (_u, b) => {
        if (branchCompany.get(b) !== company) throw new ForbiddenException();
      },
    };
    const scope = new OperationalScopeService(access),
      nr = ds.getRepository(NoticeEntity),
      dr = ds.getRepository(NoticeDocumentEntity),
      lr = ds.getRepository(NoticeActivityLogEntity),
      cr = ds.getRepository(BranchComplianceEntity);
    const svc = new NoticesService(nr, dr, lr, scope),
      checklistSvc = new ChecklistsService(cr),
      controller = new ChecklistsController(checklistSvc, scope);
    const crm = user('CRM'),
      branch = user('CLIENT'),
      global = user('ADMIN');
    const dto = (clientId, branchId) => ({
      clientId,
      branchId,
      departmentName: 'Labour',
      subject: 'Fictional notice',
      noticeDate: '2026-09-01',
      receivedDate: '2026-09-02',
      responseDueDate: '2026-09-10',
    });
    const notices = [];
    for (const [c, b] of [
      [company, b1],
      [company, b2],
      [company, b3],
      [other, foreign],
      [company, null],
    ])
      notices.push(await svc.create(global, dto(c, b)));
    const own = notices[0],
      hidden = notices[3];
    await check('notice list: CRM sees only assigned company', async () =>
      assert.equal((await svc.list(crm, {})).length, 4),
    );
    await check('notice list: empty CRM assignments expose nothing', async () =>
      assert.equal((await svc.list({ ...crm, empty: true }, {})).length, 0),
    );
    await check(
      'notice list: all assigned branches retained; sibling and company-wide excluded',
      async () =>
        assert.deepEqual(
          (await svc.list(branch, {})).map((n) => n.branchId).sort(),
          [b1, b2].sort(),
        ),
    );
    await check(
      'notice list: empty branch assignments expose nothing',
      async () =>
        assert.equal((await svc.list(user('CLIENT', []), {})).length, 0),
    );
    await check('notice list: explicit foreign company rejected', async () =>
      assert.rejects(svc.list(crm, { clientId: other }), ForbiddenException),
    );
    await check('notice list: explicit unassigned sibling rejected', async () =>
      assert.rejects(svc.list(branch, { branchId: b3 }), ForbiddenException),
    );
    await check(
      'notice list: status and search filters work within scope',
      async () =>
        assert.equal(
          (await svc.list(crm, { status: 'RECEIVED', search: 'Fictional' }))
            .length,
          4,
        ),
    );
    await check('notice detail: foreign company rejected', async () =>
      assert.rejects(svc.getOne(crm, hidden.id), ForbiddenException),
    );
    await check('notice detail: unassigned sibling rejected', async () =>
      assert.rejects(svc.getOne(branch, notices[2].id), ForbiddenException),
    );
    await check('notice detail: second assigned branch allowed', async () =>
      assert.equal((await svc.getOne(branch, notices[1].id)).id, notices[1].id),
    );
    await check(
      'notice create: foreign company rejected before record or log is saved',
      async () => {
        const before = await nr.count(),
          logs = await lr.count();
        await assert.rejects(
          svc.create(crm, dto(other, foreign)),
          ForbiddenException,
        );
        assert.equal(await nr.count(), before);
        assert.equal(await lr.count(), logs);
      },
    );
    await check('notice update: foreign record remains unchanged', async () => {
      await assert.rejects(
        svc.update(crm, hidden.id, {
          subject: 'Forbidden edit',
          status: 'CLOSED',
        }),
        ForbiddenException,
      );
      assert.equal(
        (await nr.findOneByOrFail({ id: hidden.id })).status,
        'RECEIVED',
      );
    });
    await check(
      'notice update: assigned record closes and records actor',
      async () => {
        await svc.update(crm, own.id, {
          status: 'CLOSED',
          closureRemarks: 'Sample resolved',
        });
        const n = await nr.findOneByOrFail({ id: own.id });
        assert.equal(n.status, 'CLOSED');
        assert.equal(n.closedByUserId, actor);
        assert.equal(
          await lr.countBy({ noticeId: own.id, action: 'STATUS_CHANGE' }),
          1,
        );
      },
    );
    await check(
      'notice document: foreign record rejected before document insertion',
      async () => {
        await assert.rejects(
          svc.uploadDocument(
            crm,
            hidden.id,
            'SUPPORTING',
            'sample.pdf',
            '/synthetic/sample.pdf',
          ),
          ForbiddenException,
        );
        assert.equal(await dr.count(), 0);
      },
    );
    await check(
      'notice document: assigned upload metadata and activity visible in detail',
      async () => {
        await svc.uploadDocument(
          crm,
          own.id,
          'SUPPORTING',
          'sample.pdf',
          '/synthetic/sample.pdf',
        );
        const n = await svc.getOne(crm, own.id);
        assert.equal(n.documents.length, 1);
        assert.ok(n.activityLog.some((l) => l.action === 'DOCUMENT_UPLOADED'));
      },
    );
    await check(
      'notice KPIs: totals and closed counts cover all assigned branches',
      async () => {
        const k = await svc.getKpis(branch);
        assert.equal(k.total, 2);
        assert.equal(k.closed, 1);
      },
    );
    await check(
      'notice KPIs: explicit foreign company cannot bypass assignment',
      async () => assert.rejects(svc.getKpis(crm, other), ForbiddenException),
    );
    await check('notice KPIs: empty assignments count zero', async () =>
      assert.equal((await svc.getKpis({ ...crm, empty: true })).total, 0),
    );
    await check(
      'notice administration: global role sees every seeded record',
      async () => assert.equal((await svc.list(global, {})).length, 5),
    );
    const items = [];
    for (const [clientId, branchId] of [
      [company, b1],
      [company, b2],
      [other, foreign],
    ])
      items.push(
        await cr.save({
          clientId,
          branchId,
          isApplicable: true,
          status: 'PENDING',
          source: 'SAMPLE',
        }),
      );
    await check(
      'checklist branch: second assigned branch is available',
      async () =>
        assert.equal((await controller.getByBranch(b2, branch)).length, 1),
    );
    await check('checklist branch: sibling branch rejected', async () =>
      assert.rejects(controller.getByBranch(b3, branch), ForbiddenException),
    );
    await check('checklist summary: foreign branch rejected', async () =>
      assert.rejects(
        controller.branchSummary(foreign, crm),
        ForbiddenException,
      ),
    );
    await check('checklist summary: assigned branch counts status', async () =>
      assert.equal((await controller.branchSummary(b1, branch)).PENDING, 1),
    );
    await check(
      'checklist client: foreign company rejected for CRM and CCO',
      async () => {
        for (const u of [crm, user('CCO')])
          await assert.rejects(
            controller.getByClient(other, u),
            ForbiddenException,
          );
      },
    );
    await check(
      'checklist client: assigned company returns both branches',
      async () =>
        assert.equal((await controller.getByClient(company, crm)).length, 2),
    );
    await check(
      'checklist update: foreign record remains pending',
      async () => {
        await assert.rejects(
          controller.updateItem(items[2].id, crm, { status: 'COMPLETED' }),
          ForbiddenException,
        );
        assert.equal(
          (await cr.findOneByOrFail({ id: items[2].id })).status,
          'PENDING',
        );
      },
    );
    await check(
      'checklist update: assigned record persists changes and status filter finds it',
      async () => {
        await controller.updateItem(items[0].id, crm, {
          status: 'COMPLETED',
          reason: 'Verified sample',
        });
        assert.equal(
          (await controller.getByBranch(b1, crm, 'COMPLETED')).length,
          1,
        );
        assert.equal((await controller.branchSummary(b1, crm)).COMPLETED, 1);
      },
    );
    await check(
      'checklist update: extra JSON cannot transfer company, branch or compliance ownership',
      async () => {
        await controller.updateItem(items[0].id, crm, {
          clientId: other,
          branchId: foreign,
          complianceId: randomUUID(),
          reason: 'Safe edit',
        });
        const row = await cr.findOneByOrFail({ id: items[0].id });
        assert.equal(row.clientId, company);
        assert.equal(row.branchId, b1);
        assert.equal(row.complianceId, null);
        assert.equal(row.reason, 'Safe edit');
      },
    );
    await check('checklist update: missing record rejected', async () =>
      assert.rejects(
        controller.updateItem(randomUUID(), crm, { status: 'COMPLETED' }),
        /not found/,
      ),
    );
    console.log(
      JSON.stringify(
        {
          scope:
            'Real services and PostgreSQL; assignment adapter supplies fictional scope; no HTTP JWT or file bytes tested.',
          results,
        },
        null,
        2,
      ),
    );
    if (results.some((r) => r.status === 'FAIL')) process.exitCode = 1;
  } finally {
    if (ds?.isInitialized) await ds.destroy();
    await admin.query('DROP SCHEMA IF EXISTS ' + schema + ' CASCADE');
    await admin.end();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
