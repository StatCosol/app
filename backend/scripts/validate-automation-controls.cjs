const { AuditEntity } = require('../dist/src/audits/entities/audit.entity');
const {
  AuditNonComplianceEntity,
} = require('../dist/src/audits/entities/audit-non-compliance.entity');
const {
  AuditScheduleEntity,
} = require('../dist/src/automation/entities/audit-schedule.entity');
const {
  NotificationEntity,
} = require('../dist/src/notifications/entities/notification.entity');
const {
  NotificationMessageEntity,
} = require('../dist/src/notifications/entities/notification-message.entity');
const {
  ComplianceNotificationCenterEntity,
} = require('../dist/src/returns/entities/compliance-notification-center.entity');
const {
  ComplianceReturnEntity,
} = require('../dist/src/returns/entities/compliance-return.entity');
const {
  BranchRegistrationEntity,
} = require('../dist/src/branches/entities/branch-registration.entity');
const {
  ContractorDocumentEntity,
} = require('../dist/src/contractor/entities/contractor-document.entity');
const {
  ClientAssignmentCurrentEntity,
} = require('../dist/src/assignments/entities/client-assignment-current.entity');
// After backend build; disposable local database only. Never reads production credentials.
const assert = require('node:assert/strict'),
  path = require('node:path');
const { Client } = require('pg'),
  { DataSource, Table } = require('typeorm');
const { UserEntity } = require('../dist/src/users/entities/user.entity');
const { ClientEntity } = require('../dist/src/clients/entities/client.entity');
const { BranchEntity } = require('../dist/src/branches/entities/branch.entity');
const {
  SystemTaskEntity,
} = require('../dist/src/automation/entities/system-task.entity');
const {
  TaskEngineService,
} = require('../dist/src/automation/services/task-engine.service');
const connection = {
  host: '127.0.0.1',
  port: 55439,
  user: 'monthly_close_test',
  database: 'postgres',
};
const schema = `automation_control_${Date.now()}`,
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
    const entities = [
      UserEntity,
      ClientEntity,
      BranchEntity,
      SystemTaskEntity,
      NotificationEntity,
      NotificationMessageEntity,
      ComplianceNotificationCenterEntity,
      ComplianceReturnEntity,
      BranchRegistrationEntity,
      ContractorDocumentEntity,
      ClientAssignmentCurrentEntity,
      AuditEntity,
      AuditNonComplianceEntity,
      AuditScheduleEntity,
    ];
    const runner = ds.createQueryRunner();
    try {
      for (const entity of entities) {
        const table = Table.create(ds.getMetadata(entity), ds.driver);
        table.schema = schema;
        table.name = ds.getMetadata(entity).tableName;
        await runner.createTable(table, true);
      }
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
    const fs = require('node:fs');
    const {
      AutomationNotificationService,
    } = require('../dist/src/automation/services/automation-notification.service');
    const {
      RenewalFilingEngineService,
    } = require('../dist/src/automation/services/renewal-filing-engine.service');
    const {
      ExpiryEngineService,
    } = require('../dist/src/automation/services/expiry-engine.service');
    const {
      ReturnsFilingEngineService,
    } = require('../dist/src/automation/services/returns-filing-engine.service');
    const {
      NonComplianceEngineService,
    } = require('../dist/src/automation/services/non-compliance-engine.service');
    const {
      DueRemindersJob,
    } = require('../dist/src/automation/jobs/due-reminders.job');
    const {
      AutomationControlService,
    } = require('../dist/src/automation/control-center.service');
    const { operationalDate } = require('../dist/src/common/operational-date');
    for (const file of [
      '20260912_automation_delivery_dedup.sql',
      '20260912b_automation_control_center.sql',
    ]) {
      const sql = fs.readFileSync(
        path.join(__dirname, '../migrations', file),
        'utf8',
      );
      await ds.query(sql);
      await ds.query(sql);
    }
    for (const n of [1, 2])
      await seed(ClientEntity, {
        id: id(n),
        clientCode: `CTRL${n}`,
        clientName: `Company ${n}`,
      });
    for (const [n, client] of [
      [11, 1],
      [12, 1],
      [21, 2],
    ])
      await seed(BranchEntity, {
        id: id(n),
        clientId: id(client),
        branchName: `Branch ${n}`,
      });
    for (const n of [31, 32])
      await seed(UserEntity, {
        id: id(n),
        clientId: id(1),
        email: `control${n}@example.invalid`,
      });
    const actor = id(31),
      today = operationalDate();
    for (const [n, client, branch] of [
      [101, 1, 11],
      [102, 1, 12],
      [103, 2, 21],
      [104, 1, null],
    ])
      await seed(SystemTaskEntity, {
        id: id(n),
        module: 'COMPLIANCE',
        taskType: 'COMPLIANCE',
        title: `Task ${n}`,
        assignedRole: 'BRANCH',
        assignedUserId: id(32),
        clientId: id(client),
        branchId: branch ? id(branch) : null,
        dueDate: today,
      });
    const notifications = new AutomationNotificationService(ds),
      tasks = new TaskEngineService(ds, {});
    const renewals = new RenewalFilingEngineService(ds, tasks),
      expiry = new ExpiryEngineService(ds, tasks, notifications, renewals);
    const filing = new ReturnsFilingEngineService(ds, tasks, notifications);
    const nc = new NonComplianceEngineService(
      ds.getRepository(AuditNonComplianceEntity),
      ds.getRepository(AuditEntity),
      tasks,
      notifications,
      ds,
    );
    const due = new DueRemindersJob(tasks, notifications, ds);
    const service = new AutomationControlService(
      ds,
      expiry,
      renewals,
      tasks,
      filing,
      nc,
      due,
    );
    const overview = await service.overview();
    assert.equal(overview.controls.length, 4);
    for (const ruleKey of ['expiry', 'filing_overdue', 'nc_reminders']) {
      const empty = await service.preview({ ruleKey });
      assert.ok(empty.groups.every((g) => g.count === 0));
    }
    const root = overview.controls.find((c) => c.rule_key === 'task_reminders');
    const preview = await service.preview({ ruleKey: 'task_reminders' });
    assert.equal(preview.groups[0].count, 4);
    assert.equal(
      (await ds.query('SELECT COUNT(*)::int AS n FROM notifications'))[0].n,
      0,
    );
    await assert.rejects(
      service.save(
        {
          ruleKey: 'task_reminders',
          clientId: id(1),
          branchId: id(21),
          enabled: false,
          localTime: '08:00',
          version: 0,
        },
        actor,
      ),
      /Branch does not belong/,
    );
    const company = await service.save(
      {
        ruleKey: 'task_reminders',
        clientId: id(2),
        enabled: false,
        localTime: '08:00',
        version: 0,
      },
      actor,
    );
    const branch = await service.save(
      {
        ruleKey: 'task_reminders',
        clientId: id(1),
        branchId: id(12),
        enabled: false,
        localTime: '08:00',
        version: 0,
      },
      actor,
    );
    const scoped = await service.preview({ ruleKey: 'task_reminders' });
    assert.equal(scoped.groups[0].count, 2); // branch 11 and company-level task; exclusions preserve NULL branches.
    assert.equal(
      (
        await service.preview({
          ruleKey: 'task_reminders',
          clientId: id(1),
          branchId: id(12),
        })
      ).plan.enabled,
      false,
    );
    await assert.rejects(
      service.run(root.id, id(500), actor, preview.plan.digest),
      /changed/,
    );
    await assert.rejects(
      service.run(
        branch.id,
        id(501),
        actor,
        (
          await service.preview({
            ruleKey: 'task_reminders',
            clientId: id(1),
            branchId: id(12),
          })
        ).plan.digest,
      ),
      /paused/,
    );
    const first = await service.run(
      root.id,
      id(502),
      actor,
      scoped.plan.digest,
    );
    assert.equal(first.status, 'SUCCEEDED');
    assert.equal(first.result.remindersSent, 2);
    assert.equal(
      (await service.run(root.id, id(502), actor, scoped.plan.digest)).id,
      first.id,
    );
    assert.equal(
      (await ds.query('SELECT COUNT(*)::int AS n FROM notifications'))[0].n,
      2,
    );
    assert.equal(
      (await ds.query('SELECT COUNT(*)::int AS n FROM automation_runs'))[0].n,
      1,
    );
    await assert.rejects(
      service.save(
        {
          ruleKey: 'task_reminders',
          clientId: id(2),
          enabled: true,
          localTime: '09:00',
          version: 0,
        },
        actor,
      ),
      /Settings changed/,
    );
    await service.inherit(branch.id, branch.version, actor);
    assert.equal(
      (await service.preview({ ruleKey: 'task_reminders' })).groups[0].count,
      3,
    );
    await assert.rejects(
      service.inherit(root.id, root.version, actor),
      /Default settings/,
    );
    const original = due.handle.bind(due);
    let release, entered;
    const started = new Promise((resolve) => (entered = resolve));
    const gate = new Promise((resolve) => (release = resolve));
    due.handle = async (scope) => {
      entered();
      await gate;
      return { remindersSent: 0, failures: 0 };
    };
    const fresh = await service.preview({ ruleKey: 'task_reminders' });
    const pending = service.run(root.id, id(503), actor, fresh.plan.digest);
    await started;
    await assert.rejects(
      service.run(root.id, id(504), actor, fresh.plan.digest),
      /already running/,
    );
    await assert.rejects(
      service.save(
        {
          ruleKey: 'task_reminders',
          enabled: false,
          localTime: '08:00',
          version: root.version,
        },
        actor,
      ),
      /running/,
    );
    release();
    await pending;
    due.handle = async () => {
      throw new Error('fixture operation failed');
    };
    const failed = await service.run(
      root.id,
      id(505),
      actor,
      fresh.plan.digest,
    );
    assert.equal(failed.status, 'FAILED');
    assert.match(failed.error_message, /Execution failed/);
    due.handle = original;
    const retried = await service.retry(failed.id, id(506), actor);
    assert.equal(retried.status, 'SUCCEEDED');
    assert.equal(retried.retry_of, failed.id);
    assert.equal(
      (await ds.query('SELECT COUNT(*)::int AS n FROM notifications'))[0].n,
      3,
    ); // only newly inherited branch 12 is delivered.
    await assert.rejects(
      service.retry(first.id, id(507), actor),
      /Only failed/,
    );
    due.handle = async () => ({ failures: 1, remindersSent: 0 });
    const partial = await service.run(
      root.id,
      id(508),
      actor,
      fresh.plan.digest,
    );
    assert.equal(partial.status, 'PARTIAL');
    due.handle = original;
    await ds.query(
      "UPDATE automation_runs SET status='RUNNING',finished_at=NULL WHERE id=$1",
      [partial.id],
    );
    await service.run(root.id, id(509), actor, fresh.plan.digest);
    assert.equal(
      (
        await ds.query('SELECT status FROM automation_runs WHERE id=$1', [
          partial.id,
        ])
      )[0].status,
      'INTERRUPTED',
    );
    const paused = await service.save(
      {
        ruleKey: 'task_reminders',
        enabled: false,
        localTime: '00:00',
        version: root.version,
      },
      actor,
    );
    const child = await service.save(
      {
        ruleKey: 'task_reminders',
        clientId: id(1),
        branchId: id(11),
        enabled: true,
        localTime: '00:00',
        version: 0,
      },
      actor,
    );
    const childPreview = await service.preview({
      ruleKey: 'task_reminders',
      clientId: id(1),
      branchId: id(11),
    });
    assert.equal(childPreview.plan.enabled, false);
    await assert.rejects(
      service.run(child.id, id(510), actor, childPreview.plan.digest),
      /paused/,
    );
    await assert.rejects(service.retry(failed.id, id(511), actor), /paused/);
    await service.save(
      {
        ruleKey: 'task_reminders',
        enabled: true,
        localTime: '00:00',
        version: paused.version,
      },
      actor,
    );
    await service.inherit(child.id, child.version, actor);
    await assert.rejects(service.retry(failed.id, id(512), actor), /changed/);
    for (const row of (await service.overview()).controls.filter(
      (c) => !c.client_id && c.rule_key !== 'task_reminders',
    ))
      await service.save(
        {
          ruleKey: row.rule_key,
          enabled: false,
          localTime: row.local_time,
          version: row.version,
        },
        actor,
      );
    await service.tick();
    await service.tick();
    assert.equal(
      (
        await ds.query(
          "SELECT COUNT(*)::int AS n FROM automation_runs WHERE trigger_type='SCHEDULED'",
        )
      )[0].n,
      1,
    );
    assert.ok((await service.changes()).every((c) => c.actor_id === actor));
    assert.ok((await service.history()).total >= 7);
    await seed(AuditScheduleEntity, {
      id: id(700),
      clientId: id(1),
      branchId: id(11),
      auditorId: id(32),
      scheduleDate: today,
      dueDate: today,
    });
    assert.equal(
      (await due.getSchedules({ clientId: id(1), branchId: id(11) })).length,
      1,
    );
    assert.equal(
      (await due.getSchedules({ clientId: id(1), branchId: id(12) })).length,
      0,
    );
    assert.equal((await due.handle({ branchId: id(11) })).auditReminders, 1);
    assert.equal((await due.handle({ branchId: id(11) })).auditReminders, 0);
    console.log(
      'PASS: preview is read-only; company/branch exclusions and NULL scope; stale preview/version rejection; real scoped delivery; manual idempotency; global pause; inherited settings; concurrent-run exclusion; failure/partial/interruption history; safe retry; once-per-day scheduler and audit attribution.',
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
