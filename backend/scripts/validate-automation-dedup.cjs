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
const schema = `automation_dedup_${Date.now()}`,
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
      ExpiryRemindersJob,
    } = require('../dist/src/automation/jobs/expiry-reminders.job');
    const clock = require('../dist/src/common/operational-date');
    const originalDate = clock.operationalDate;
    const migration = fs.readFileSync(
      path.join(
        __dirname,
        '../migrations/20260912_automation_delivery_dedup.sql',
      ),
      'utf8',
    );
    await ds.query(migration);
    await ds.query(migration);
    await seed(ClientEntity, {
      id: id(1),
      clientCode: 'AUTO1',
      clientName: 'Automation fixture',
    });
    for (const n of [11, 12])
      await seed(BranchEntity, {
        id: id(n),
        clientId: id(1),
        branchName: `Branch ${n}`,
      });
    for (const n of [31, 32])
      await seed(UserEntity, {
        id: id(n),
        clientId: id(1),
        email: `auto${n}@example.invalid`,
      });
    await seed(ClientAssignmentCurrentEntity, {
      id: id(40),
      clientId: id(1),
      assignmentType: 'CRM',
      assignedToUserId: id(31),
      startDate: new Date(),
    });
    const service = new AutomationNotificationService(ds);
    const tasks = new TaskEngineService(ds, {});
    const renewals = new RenewalFilingEngineService(ds, tasks);
    const expiry = new ExpiryEngineService(ds, tasks, service, renewals);
    const job = new ExpiryRemindersJob(expiry);
    const count = async (table, where = 'TRUE', params = []) =>
      Number(
        (
          await ds.query(
            `SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`,
            params,
          )
        )[0].n,
      );
    const task = {
      id: id(100),
      title: 'Same title',
      dueDate: '2026-12-22',
      assignedUserId: id(31),
      assignedRole: 'BRANCH',
      clientId: id(1),
      branchId: id(11),
    };
    try {
      clock.operationalDate = () => '2026-12-20';
      for (const [n, dueDate] of [
        [108, '2026-12-19'],
        [109, '2026-12-20'],
        [110, '2026-12-21'],
      ])
        await seed(SystemTaskEntity, {
          id: id(n),
          module: 'COMPLIANCE',
          taskType: 'COMPLIANCE',
          assignedRole: 'BRANCH',
          title: 'Date boundary fixture',
          dueDate,
        });
      assert.deepEqual(
        (await tasks.getOverdueTasks()).map((t) => t.id),
        [id(108)],
      );
      assert.deepEqual(
        (await tasks.getTasksDueSoon()).map((t) => t.id),
        [id(109), id(110)],
      );
      const results = await Promise.all(
        Array.from({ length: 20 }, () => service.sendTaskDueReminder(task)),
      );
      assert.equal(results.filter(Boolean).length, 1);
      assert.equal(await count('notifications'), 1);
      assert.equal(await count('notification_messages'), 1);
      assert.equal(await count('compliance_notification_center'), 1);
      const ticket = (await ds.query('SELECT * FROM notifications'))[0];
      assert.equal(ticket.assigned_to_user_id, id(31));
      assert.equal(ticket.created_by_role, 'SYSTEM');
      assert.equal(ticket.read_at, null);
      await service.sendTaskDueReminder({ ...task, title: 'Changed wording' });
      assert.equal(await count('notifications'), 1);
      await service.sendTaskDueReminder({ ...task, assignedUserId: id(32) });
      assert.equal(await count('notifications'), 2);
      assert.equal(await count('compliance_notification_center'), 1);
      await service.sendTaskDueReminder({ ...task, id: id(101) });
      await service.sendTaskDueReminder({ ...task, branchId: id(12) });
      assert.equal(await count('notifications'), 4);
      assert.equal(await count('compliance_notification_center'), 3);
      clock.operationalDate = () => '2026-12-21';
      await service.sendTaskDueReminder(task);
      assert.equal(await count('notifications'), 5);
      clock.operationalDate = () => '2026-12-20';
      const before = [
        await count('notifications'),
        await count('notification_messages'),
        await count('automation_delivery_receipts'),
      ];
      await ds.query(
        `CREATE FUNCTION reject_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."entityId"='${id(102)}'::uuid THEN RAISE EXCEPTION 'fixture delivery failure'; END IF; RETURN NEW; END $$`,
      );
      await ds.query(
        'CREATE TRIGGER reject_delivery BEFORE INSERT ON compliance_notification_center FOR EACH ROW EXECUTE FUNCTION reject_fixture()',
      );
      await assert.rejects(
        service.sendTaskDueReminder({ ...task, id: id(102) }),
        /fixture delivery failure/,
      );
      assert.deepEqual(
        [
          await count('notifications'),
          await count('notification_messages'),
          await count('automation_delivery_receipts'),
        ],
        before,
      );
      await ds.query(
        'DROP TRIGGER reject_delivery ON compliance_notification_center',
      );
      await service.sendTaskDueReminder({ ...task, id: id(102) });
      assert.equal(await count('notifications'), before[0] + 1);
      const beforeOverdue = await count('notifications');
      await Promise.all([
        service.sendOverdueEscalation({
          ...task,
          id: id(104),
          referenceId: id(103),
          referenceType: 'RENEWAL_FILING',
        }),
        service.sendReturnOverdueAlert({
          filingId: id(103),
          userId: id(31),
          role: 'CRM',
          returnType: 'Renewal',
          periodLabel: 'December',
          branchName: 'Branch',
          daysOverdue: 2,
          clientId: id(1),
          branchId: id(11),
        }),
      ]);
      assert.equal(await count('notifications'), beforeOverdue + 1);
      assert.equal(
        await count('compliance_notification_center', '"entityId"=$1', [
          id(103),
        ]),
        1,
      );
      const schedule = {
        scheduleId: id(105),
        auditorUserId: id(31),
        clientName: 'Fixture',
        auditType: 'Labour',
        scheduleDate: '2026-12-21',
        dueDate: '2026-12-24',
        clientId: id(1),
      };
      await Promise.all([
        service.sendScheduleNotice(schedule),
        service.sendScheduleNotice(schedule),
      ]);
      assert.equal(
        await count('notifications', 'subject LIKE $1', ['Audit scheduled:%']),
        1,
      );
      await service.sendNcReminder({
        ncId: id(106),
        userId: id(31),
        clientId: id(1),
        subject: 'NC fixture',
        message: 'Fix evidence',
      });
      await service.sendNcReminder({
        ncId: id(106),
        userId: id(31),
        clientId: id(1),
        subject: 'NC fixture',
        message: 'Fix evidence',
      });
      assert.equal(
        await count('notifications', 'subject=$1', ['NC fixture']),
        1,
      );
      const report = {
        auditId: id(107),
        auditCode: 'A1',
        score: 80,
        clientId: id(1),
        branchId: id(11),
      };
      await Promise.all([
        service.sendAuditReportReady(report),
        service.sendAuditReportReady(report),
      ]);
      assert.equal(
        await count('compliance_notification_center', '"entityId"=$1', [
          id(107),
        ]),
        2,
      );
      console.log(
        'PASS: concurrent delivery, next-day reminders, distinct sources/scopes/recipients, unread recipient routing, all-channel rollback and retry, cross-job filing dedup, NC and audit reminders.',
      );

      const due = '2027-01-05';
      for (const [n, type] of [
        [201, 'PF'],
        [202, 'PF'],
        [203, 'ESI'],
      ])
        await ds.query(
          `INSERT INTO branch_registrations(id,client_id,branch_id,type,expiry_date,status) VALUES ($1,$2,$3,$4,$5,'ACTIVE')`,
          [id(n), id(1), id(11), type, due],
        );
      await seed(ComplianceReturnEntity, {
        id: id(210),
        clientId: id(1),
        branchId: id(11),
        lawType: 'RENEWAL',
        returnType: 'RENEWAL-ESI',
        periodYear: 2027,
        periodMonth: 1,
        dueDate: due,
        status: 'PENDING',
      });
      await seed(ContractorDocumentEntity, {
        id: id(220),
        contractorUserId: id(32),
        clientId: id(1),
        branchId: id(11),
        expiryDate: due,
        title: 'License',
      });
      await seed(SystemTaskEntity, {
        id: id(230),
        module: 'RENEWAL',
        taskType: 'RENEWAL',
        referenceType: 'LICENSE_EXPIRY',
        referenceId: id(220),
        assignedRole: 'CONTRACTOR',
        assignedUserId: id(32),
        clientId: id(1),
        branchId: null,
        contractorId: id(32),
        dueDate: due,
        status: 'IN_PROGRESS',
        title: 'Old license task',
      });
      await seed(SystemTaskEntity, {
        id: id(231),
        module: 'RENEWAL',
        taskType: 'RENEWAL',
        referenceType: 'CONTRACTOR_DOC_EXPIRY',
        referenceId: id(220),
        assignedRole: 'CONTRACTOR',
        assignedUserId: id(32),
        clientId: id(1),
        branchId: id(11),
        dueDate: due,
        status: 'OPEN',
        title: 'Duplicate document task',
      });
      await seed(SystemTaskEntity, {
        id: id(232),
        module: 'RENEWAL',
        taskType: 'RENEWAL',
        referenceType: 'REGISTRATION_EXPIRY',
        referenceId: id(201),
        assignedRole: 'BRANCH',
        clientId: id(1),
        branchId: id(11),
        dueDate: due,
        status: 'OPEN',
        title: 'Old registration task',
      });
      await Promise.all([
        expiry.generateExpiryAlerts(),
        job.handle(),
        renewals.generateRenewalFilings(),
      ]);
      assert.equal(await count('compliance_returns'), 3);
      assert.equal(await count('registration_renewal_links'), 3);
      assert.equal(
        await count(
          'compliance_returns',
          'period_year=2027 AND period_month=1',
        ),
        3,
      );
      assert.equal(
        (
          await ds.query(
            'SELECT filing_id FROM registration_renewal_links WHERE registration_id=$1',
            [id(203)],
          )
        )[0].filing_id,
        id(210),
      );
      assert.equal(
        await count('system_tasks', "reference_type='RENEWAL_FILING'"),
        3,
      );
      assert.equal(
        await count(
          'system_tasks',
          "reference_type='CONTRACTOR_DOC_EXPIRY' AND status NOT IN ('CLOSED','CANCELLED')",
        ),
        1,
      );
      const old = (
        await ds.query('SELECT * FROM system_tasks WHERE id=$1', [id(230)])
      )[0];
      assert.equal(old.status, 'IN_PROGRESS');
      assert.equal(old.branch_id, id(11));
      assert.equal(
        (
          await ds.query('SELECT status FROM system_tasks WHERE id=$1', [
            id(231),
          ])
        )[0].status,
        'CANCELLED',
      );
      const legacy = (
        await ds.query('SELECT * FROM system_tasks WHERE id=$1', [id(232)])
      )[0];
      assert.equal(legacy.status, 'CANCELLED');
      assert.match(legacy.description, /Superseded by renewal filing/);
      const totalTasks = await count('system_tasks');
      await ds.query("UPDATE compliance_returns SET status='APPROVED'");
      await ds.query(
        "UPDATE system_tasks SET status='CLOSED' WHERE reference_type IN ('RENEWAL_FILING','CONTRACTOR_DOC_EXPIRY') AND status<>'CANCELLED'",
      );
      await expiry.generateExpiryAlerts();
      assert.equal(await count('system_tasks'), totalTasks);
      const receiptCount = await count('automation_delivery_receipts');
      await job.handle();
      assert.equal(await count('automation_delivery_receipts'), receiptCount);

      await ds.query(
        'UPDATE contractor_documents SET expiry_date=$2 WHERE id=$1',
        [id(220), '2027-01-06'],
      );
      await expiry.generateExpiryAlerts();
      await expiry.generateExpiryAlerts();
      assert.equal(
        await count(
          'system_tasks',
          "reference_type='CONTRACTOR_DOC_EXPIRY' AND due_date='2027-01-06'",
        ),
        1,
      );
      assert.equal(
        (
          await ds.query('SELECT status FROM system_tasks WHERE id=$1', [
            id(230),
          ])
        )[0].status,
        'CLOSED',
      );
      await ds.query(
        `INSERT INTO branch_registrations(id,client_id,branch_id,type,expiry_date,status) VALUES ($1,$2,$3,'ROLLBACK',$4,'ACTIVE')`,
        [id(240), id(1), id(11), due],
      );
      const originalCreate = tasks.createTask.bind(tasks);
      tasks.createTask = async (p, manager) => {
        if (p.title.includes('ROLLBACK'))
          throw new Error('fixture task failure');
        return originalCreate(p, manager);
      };
      await assert.rejects(
        renewals.generateRenewalFilings(),
        /fixture task failure/,
      );
      assert.equal(
        await count('compliance_returns', "return_type='RENEWAL-ROLLBACK'"),
        0,
      );
      assert.equal(
        await count('registration_renewal_links', 'registration_id=$1', [
          id(240),
        ]),
        0,
      );
      tasks.createTask = originalCreate;
      await renewals.generateRenewalFilings();
      assert.equal(
        await count('compliance_returns', "return_type='RENEWAL-ROLLBACK'"),
        1,
      );
      console.log(
        'PASS: manual/scheduled concurrent expiry scans, separate same-type registrations, legacy filing adoption, legacy task history and duplicate retirement, next-year period, no terminal reopening, atomic filing/task rollback and recovery.',
      );
    } finally {
      clock.operationalDate = originalDate;
    }
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
