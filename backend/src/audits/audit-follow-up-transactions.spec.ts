import { AuditOutputEngineService } from '../automation/services/audit-output-engine.service';
import { NonComplianceEngineService } from '../automation/services/non-compliance-engine.service';
import { TaskEngineService } from '../automation/services/task-engine.service';
import { AutomationNotificationService } from '../automation/services/automation-notification.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AuditLogEntity } from '../audit-logs/entities/audit-log.entity';
import { ClientAssignment } from '../assignments/entities/client-assignment.entity';
import { AuditEntity } from './entities/audit.entity';
import { AuditNonComplianceEntity } from './entities/audit-non-compliance.entity';

jest.mock('./utils/report-pdf', () => ({
  generateAuditReportPdfBuffer: jest
    .fn()
    .mockResolvedValue(Buffer.from('sample pdf')),
}));

describe('Audit follow-up transaction propagation', () => {
  function setup(held = false) {
    const outside = {
      query: jest.fn(() => {
        throw new Error('query escaped transaction');
      }),
      transaction: jest.fn(() => {
        throw new Error('nested independent transaction');
      }),
    };
    const oldClosedAt = new Date('2026-09-01T00:00:00Z');
    const auditRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'audit',
        clientId: 'client',
        branchId: 'branch',
        createdByUserId: 'admin',
      }),
      save: jest.fn(async (value) => value),
    };
    const ncRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'nc',
        auditId: 'audit',
        requestedToRole: 'CONTRACTOR',
        requestedToUserId: 'vendor',
        closedAt: oldClosedAt,
      }),
      save: jest.fn(async (value) => value),
      count: jest.fn().mockResolvedValue(0),
    };
    const logRepo = { create: jest.fn((value) => value), save: jest.fn() };
    const assignmentRepo = {
      findOne: jest
        .fn()
        .mockResolvedValue({ crmUserId: 'crm', auditorUserId: 'auditor' }),
    };
    const repositories = new Map<any, any>([
      [AuditEntity, auditRepo],
      [AuditNonComplianceEntity, ncRepo],
      [AuditLogEntity, logRepo],
      [ClientAssignment, assignmentRepo],
    ]);
    const manager = {
      getRepository: jest.fn((entity) => repositories.get(entity)),
      create: jest.fn((_, value) => value),
      save: jest.fn(async (_, value) => ({ id: 'record', ...value })),
      query: jest.fn(async (sql: string) => {
        if (sql.includes('COUNT(*)')) return [{ total: 1, complied: 1 }];
        if (sql.includes('FROM audit_reports'))
          return [
            {
              version_no: 1,
              status: 'PUBLISHED',
              held_at: held ? new Date() : null,
            },
          ];
        if (sql.includes('FROM client_assignments_current'))
          return [{ assigned_to_user_id: 'crm' }];
        if (sql.includes('FROM users'))
          return [{ id: 'client-user', code: 'CRM' }];
        if (sql.includes('FROM audit_schedules')) return [{ id: 'schedule' }];
        if (sql.includes('INSERT INTO automation_delivery_receipts'))
          return [{ delivery_key: 'key' }];
        if (sql.includes('INSERT INTO system_tasks')) return [{ id: 'task' }];
        return [];
      }),
    };
    const badRepo = new Proxy(
      {},
      {
        get() {
          throw new Error('repository escaped transaction');
        },
      },
    );
    const notifications = new NotificationsService(
      outside as any,
      badRepo as any,
      badRepo as any,
      badRepo as any,
      badRepo as any,
    );
    const automation = new AutomationNotificationService(outside as any);
    const tasks = new TaskEngineService(outside as any, notifications);
    const nc = new NonComplianceEngineService(
      badRepo as any,
      badRepo as any,
      tasks,
      automation,
      outside as any,
    );
    const output = new AuditOutputEngineService(
      badRepo as any,
      badRepo as any,
      badRepo as any,
      notifications,
      automation,
      outside as any,
    );
    const logs = new AuditLogsService(badRepo as any, badRepo as any);
    return { nc, output, logs, manager, outside, ncRepo, logRepo, oldClosedAt };
  }
  it('closes tasks and schedules without opening another connection or changing acceptance time', async () => {
    const t = setup();
    await t.nc.closeNc('nc', t.manager as any);
    expect(t.ncRepo.save.mock.calls[0][0].closedAt).toBe(t.oldClosedAt);
    expect(t.manager.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE system_tasks'),
      ['AUDIT_NON_COMPLIANCE', 'nc'],
    );
    expect(t.manager.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE audit_schedules'),
      ['schedule'],
    );
    expect(t.outside.transaction).not.toHaveBeenCalled();
    expect(t.outside.query).not.toHaveBeenCalled();
  });
  it('creates the rejection task on the supplied manager', async () => {
    const t = setup();
    await t.nc.createTaskForNc('nc', t.manager as any);
    expect(t.manager.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO system_tasks'),
      expect.any(Array),
    );
    expect(t.outside.transaction).not.toHaveBeenCalled();
  });
  it('keeps score, report lock, both tickets and delivery receipts in one transaction', async () => {
    const t = setup();
    await t.output.refreshAuditOutputs('audit', t.manager as any);
    expect(t.manager.query).toHaveBeenCalledWith(
      expect.stringContaining('FOR UPDATE OF ar'),
      ['audit'],
    );
    expect(t.manager.create).toHaveBeenCalledTimes(4);
    expect(
      t.manager.query.mock.calls.filter(([sql]) =>
        sql.includes('INSERT INTO compliance_notification_center'),
      ),
    ).toHaveLength(2);
    expect(t.outside.transaction).not.toHaveBeenCalled();
    expect(t.outside.query).not.toHaveBeenCalled();
  });
  it('does not send either notification channel for a held report', async () => {
    const t = setup(true);
    await t.output.refreshAuditOutputs('audit', t.manager as any);
    expect(t.manager.create).not.toHaveBeenCalled();
    expect(
      t.manager.query.mock.calls.some(([sql]) =>
        sql.includes('INSERT INTO compliance_notification_center'),
      ),
    ).toBe(false);
  });
  it('writes activity using the supplied repository', async () => {
    const t = setup();
    await t.logs.log(
      { entityType: 'AUDIT_NC', entityId: 'nc', action: 'NC_ACCEPTED' },
      t.manager as any,
    );
    expect(t.logRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: 'nc', action: 'NC_ACCEPTED' }),
    );
  });
});
