// After backend build; disposable local database only. Never reads production credentials.
const assert = require('node:assert/strict'),
  path = require('node:path');
const { Client } = require('pg'),
  { DataSource, Table } = require('typeorm');
const {
  AccessScopeService,
} = require('../dist/src/access/access-scope.service');
const { UserEntity } = require('../dist/src/users/entities/user.entity');
const { ClientEntity } = require('../dist/src/clients/entities/client.entity');
const { BranchEntity } = require('../dist/src/branches/entities/branch.entity');
const {
  SystemTaskEntity,
} = require('../dist/src/automation/entities/system-task.entity');
const {
  TaskCenterService,
} = require('../dist/src/task-center/task-center.service');
const {
  TaskEngineService,
} = require('../dist/src/automation/services/task-engine.service');
const {
  TaskCenterController,
} = require('../dist/src/task-center/task-center.controller');
const {
  OperationalScopeService,
} = require('../dist/src/access/operational-scope.service');
const {
  operationalDate,
  addCalendarDays,
} = require('../dist/src/common/operational-date');
const { AuditEntity } = require('../dist/src/audits/entities/audit.entity');
const connection = {
  host: '127.0.0.1',
  port: Number(process.env.AUTOMATION_TEST_PORT || 55439),
  user: process.env.AUTOMATION_TEST_USER || 'monthly_close_test',
  password: process.env.AUTOMATION_TEST_PASSWORD || undefined,
  database: process.env.AUTOMATION_TEST_DATABASE || 'postgres',
};
const schema = `work_queue_${Date.now()}`,
  id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
async function main() {
  const admin = new Client(connection);
  await admin.connect();
  let ds;
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    ds = new DataSource({
      type: 'postgres',
      ...connection,
      username: connection.user,
      schema,
      extra: { options: `-c search_path=${schema},public` },
      entities: [path.join(__dirname, '../dist/src/**/*.entity.js')],
      synchronize: false,
    });
    await ds.initialize();
    const entities = [UserEntity, ClientEntity, BranchEntity, SystemTaskEntity];
    const runner = ds.createQueryRunner();
    try {
      for (const entity of entities)
        await runner.createTable(
          Table.create(ds.getMetadata(entity), ds.driver),
          true,
        );
    } finally {
      await runner.release();
    }
    // Fill only required scalar fixture fields using actual metadata; no invented production columns.
    async function seed(entity, values) {
      const row = { ...values };
      for (const c of ds.getMetadata(entity).columns) {
        if (
          c.propertyName in row ||
          c.isNullable ||
          c.isGenerated ||
          c.default !== undefined ||
          c.isCreateDate ||
          c.isUpdateDate ||
          !c.isInsert
        )
          continue;
        row[c.propertyName] = c.enum
          ? c.enum[0]
          : c.type === 'uuid'
            ? id(999)
            : [
                  Number,
                  'int',
                  'integer',
                  'smallint',
                  'bigint',
                  'numeric',
                  'decimal',
                  'float',
                ].includes(c.type)
              ? 0
              : [Boolean, 'boolean'].includes(c.type)
                ? true
                : c.type === 'date'
                  ? '2026-02-01'
                  : c.isArray
                    ? []
                    : `fixture-${values.id}-${c.propertyName}`;
        if (c.length)
          row[c.propertyName] = String(row[c.propertyName]).slice(
            0,
            Number(c.length),
          );
      }
      await ds.getRepository(entity).insert(row);
    }
    await seed(ClientEntity, {
      id: id(1),
      clientCode: 'C1',
      clientName: 'One',
    });
    for (const n of [11, 12])
      await seed(BranchEntity, {
        id: id(n),
        clientId: id(1),
        branchName: `Branch ${n}`,
      });
    const today = operationalDate();
    const repo = ds.getRepository(SystemTaskEntity);
    for (const [n, branch, status, dueDate] of [
      [101, 11, 'OPEN', addCalendarDays(today, -1)],
      [102, 12, 'IN_PROGRESS', today],
      [103, 11, 'AWAITING_REUPLOAD', today],
      [104, 12, 'CLOSED', today],
      [105, 11, 'CANCELLED', addCalendarDays(today, -1)],
      [106, 12, 'OPEN', null],
    ])
      await repo.insert({
        id: id(n),
        clientId: id(1),
        branchId: id(branch),
        taskType: 'COMPLIANCE',
        module: 'COMPLIANCE',
        title: 'Task ' + n,
        assignedRole: 'BRANCH',
        dueDate,
        status,
      });
    const scope = new OperationalScopeService(
      new AccessScopeService(
        {},
        {},
        ds.getRepository(ClientEntity),
        ds.getRepository(BranchEntity),
        {},
      ),
    );
    const controller = new TaskCenterController(
      new TaskCenterService(ds),
      scope,
    );
    const user = {
      id: id(31),
      userId: id(31),
      roleCode: 'CLIENT',
      userType: 'BRANCH',
      clientId: id(1),
      branchIds: [id(11), id(12)],
    };
    const result = await controller.workspace(user, {});
    assert.deepEqual(result.summary, {
      all: 6,
      active: 4,
      overdue: 1,
      soon: 2,
      returned: 1,
      closed: 1,
    });
    assert.equal(result.pagination.total, 4);
    assert.equal(result.items[0].id, id(101));
    assert.equal(result.branches.length, 2);
    for (const view of [
      'all',
      'active',
      'overdue',
      'soon',
      'returned',
      'closed',
    ]) {
      const r = await controller.workspace(user, { view, limit: 2 });
      assert.equal(r.pagination.total, r.summary[view]);
      assert.ok(r.items.length <= 2);
    }
    assert.equal(
      (await controller.workspace(user, { branchId: id(12) })).pagination.total,
      2,
    );
    assert.equal(
      (await controller.workspace(user, { branchId: id(12) })).branches.length,
      2,
    );
    assert.equal(
      (
        await controller.workspace(user, {
          month: today.slice(0, 7),
          q: 'Task 102',
        })
      ).pagination.total,
      1,
    );
    assert.equal(
      (await controller.workspace(user, { q: "' OR 1=1 --" })).pagination.total,
      0,
    );
    assert.equal(
      (await controller.workspace(user, { page: 999, limit: 2 })).pagination
        .page,
      2,
    );
    assert.equal(
      (await controller.workspace({ ...user, branchIds: [] }, {})).summary.all,
      0,
    );
    await assert.rejects(
      controller.workspace(user, { branchId: id(99) }),
      /scope/,
    );
    await ds.query(
      `INSERT INTO system_tasks(id,client_id,branch_id,task_type,module,title,assigned_role,status,due_date)
    SELECT md5('work-fixture-'||n)::uuid,$1,$2,'COMPLIANCE','COMPLIANCE','Bulk task '||n,'BRANCH','OPEN',$3::date FROM generate_series(1,5000) n`,
      [id(1), id(11), today],
    );
    const start = Date.now();
    const bulk = await controller.workspace(user, { limit: 25 });
    assert.equal(bulk.summary.active, 5004);
    assert.equal(bulk.pagination.total, 5004);
    assert.equal(bulk.items.length, 25);
    console.log(
      'PASS: counts/list reconciliation, exact filters, empty/multi-branch scope, facets, terminal states, pagination and 5000-row fixture; query ms=' +
        (Date.now() - start),
    );
    const engine = new TaskEngineService(ds, {});
    const activity = {
      module: 'COMPLIANCE',
      referenceId: id(900),
      referenceType: 'DUPLICATE_CHECK',
      assignedRole: 'BRANCH',
      clientId: id(1),
      branchId: id(11),
      title: 'One assigned activity',
      description: 'Concurrency fixture',
    };
    const simultaneous = await Promise.all(
      Array.from({ length: 20 }, () => engine.createTask(activity)),
    );
    assert.equal(new Set(simultaneous.map((t) => t.id)).size, 1);
    const original = simultaneous[0];
    assert.equal(
      (
        await engine.createTask({
          ...activity,
          title: 'Changed wording',
          dueDate: new Date(),
        })
      ).id,
      original.id,
    );
    const anotherBranch = await engine.createTask({
      ...activity,
      branchId: id(12),
    });
    assert.notEqual(anotherBranch.id, original.id);
    const anotherRole = await engine.createTask({
      ...activity,
      assignedRole: 'CRM',
    });
    assert.notEqual(anotherRole.id, original.id);
    const anotherPerson = await engine.createTask({
      ...activity,
      assignedUserId: id(21),
    });
    assert.notEqual(anotherPerson.id, original.id);
    await ds.query("UPDATE system_tasks SET status='IN_PROGRESS' WHERE id=$1", [
      original.id,
    ]);
    assert.equal((await engine.createTask(activity)).status, 'IN_PROGRESS');
    await ds.query("UPDATE system_tasks SET status='CLOSED' WHERE id=$1", [
      original.id,
    ]);
    const reopened = await engine.createTask(activity);
    assert.notEqual(reopened.id, original.id);
    await ds.query("UPDATE system_tasks SET status='CANCELLED' WHERE id=$1", [
      reopened.id,
    ]);
    assert.notEqual((await engine.createTask(activity)).id, reopened.id);
    const queue = await controller.workspace(user, {
      q: activity.title,
      view: 'active',
    });
    assert.equal(queue.pagination.total, 2);
    assert.equal(queue.summary.active, 2);
    console.log(
      'PASS: 20 concurrent creators produce one task; retries preserve progress; distinct branches, roles and recipients remain separate; terminal history retained; My Work totals reconcile.',
    );
  } finally {
    if (ds?.isInitialized) await ds.destroy();
    await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.end();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
