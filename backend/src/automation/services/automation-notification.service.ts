import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DataSource } from 'typeorm';
import { NotificationEntity } from '../../notifications/entities/notification.entity';
import { NotificationMessageEntity } from '../../notifications/entities/notification-message.entity';
import { operationalDate } from '../../common/operational-date';

interface Delivery {
  event: string;
  sourceId: string;
  clientId?: string | null;
  branchId?: string | null;
  userId?: string | null;
  role: string;
  module: string;
  title: string;
  message: string;
  priority?: string;
  entityType: string;
  dueDate?: Date | string | null;
  center?: boolean;
  daily?: boolean;
}

@Injectable()
export class AutomationNotificationService {
  constructor(private readonly dataSource: DataSource) {}

  async sendControlSummary(run: any, recipients: string[]) {
    let failures = 0;
    for (const userId of recipients)
      try {
        const allowed = await this.dataSource.query(
          "SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=$1 AND u.is_active=true AND u.deleted_at IS NULL AND r.code='ADMIN'",
          [userId],
        );
        if (!allowed.length) {
          failures++;
          continue;
        }
        await this.deliver({
          event: 'automation-run',
          sourceId: run.id,
          userId,
          role: 'ADMIN',
          module: 'AUTOMATION',
          clientId: run.snapshot.scope.clientId,
          branchId: run.snapshot.scope.branchId,
          title: 'Automation ' + run.rule_key + ': ' + run.status,
          message:
            'Review execution history in Admin → Automation. Run: ' + run.id,
          entityType: 'AUTOMATION_RUN',
          center: false,
          daily: false,
        });
      } catch {
        failures++;
      }
    return failures;
  }

  // A durable receipt and both visible records commit together. Failed delivery
  // leaves no receipt, allowing a retry without losing or multiplying reminders.
  private async deliver(p: Delivery): Promise<boolean> {
    const scope = [
      p.event,
      p.sourceId,
      p.clientId || null,
      p.branchId || null,
      p.role,
      p.daily === false ? null : operationalDate(),
    ];
    return this.dataSource.transaction(async (manager) => {
      const claim = async (channel: string, recipient: string | null) => {
        const key = createHash('sha256')
          .update(JSON.stringify([channel, ...scope, recipient]))
          .digest('hex');
        const rows = await manager.query(
          `INSERT INTO automation_delivery_receipts (delivery_key) VALUES ($1)
           ON CONFLICT (delivery_key) DO NOTHING RETURNING delivery_key`,
          [key],
        );
        return rows.length ? key : null;
      };
      let sent = false;
      if (p.userId) {
        const key = await claim('ticket', p.userId);
        if (key) {
          const ticket = await manager.save(
            NotificationEntity,
            manager.create(NotificationEntity, {
              createdByUserId: p.userId,
              createdByRole: 'SYSTEM',
              assignedToUserId: p.userId,
              assignedToRole: p.role,
              clientId: p.clientId || null,
              branchId: p.branchId || null,
              queryType: p.module === 'AUDITS' ? 'AUDIT' : 'COMPLIANCE',
              subject: p.title,
              status: 'OPEN',
              priority: p.priority === 'CRITICAL' ? 1 : 2,
              sourceKey: `automation:${key}`,
            }),
          );
          await manager.save(
            NotificationMessageEntity,
            manager.create(NotificationMessageEntity, {
              notificationId: ticket.id,
              senderUserId: p.userId,
              message: p.message,
              attachmentPath: null,
            }),
          );
          sent = true;
        }
      }
      // The center is role/branch scoped, so multiple recipients share one entry.
      if (p.center !== false && (await claim('center', null))) {
        await manager.query(
          `INSERT INTO compliance_notification_center
          ("clientId", "branchId", role, module, title, message, priority, "entityId", "entityType", "dueDate")
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [
            p.clientId || null,
            p.branchId || null,
            p.role,
            p.module,
            p.title.slice(0, 255),
            p.message,
            p.priority || 'MEDIUM',
            p.sourceId,
            p.entityType,
            p.dueDate || null,
          ],
        );
        sent = true;
      }
      return sent;
    });
  }

  async sendNcReminder(p: {
    ncId: string;
    userId: string;
    clientId: string;
    branchId?: string | null;
    subject: string;
    message: string;
  }) {
    return this.deliver({
      event: 'audit-nc',
      sourceId: p.ncId,
      userId: p.userId,
      role: 'AUDITOR',
      clientId: p.clientId,
      branchId: p.branchId,
      module: 'AUDITS',
      title: p.subject,
      message: p.message,
      entityType: 'AUDIT_NC',
      center: false,
    });
  }
  async sendTaskDueReminder(task: {
    id: string;
    title: string;
    dueDate: string | Date | null;
    assignedUserId: string | null;
    assignedRole: string;
    clientId?: string | null;
    branchId?: string | null;
  }) {
    return this.deliver({
      event: 'task-due',
      sourceId: task.id,
      userId: task.assignedUserId,
      role: task.assignedRole,
      clientId: task.clientId,
      branchId: task.branchId,
      module: 'RETURNS',
      title: `Due soon: ${task.title}`,
      message: `Task "${task.title}" is due on ${task.dueDate ? new Date(task.dueDate).toDateString() : 'soon'}. Please complete it promptly.`,
      priority: 'HIGH',
      entityType: 'TASK',
      dueDate: task.dueDate,
    });
  }

  async sendOverdueEscalation(task: {
    id: string;
    title: string;
    dueDate: string | Date | null;
    assignedUserId: string | null;
    assignedRole: string;
    clientId?: string | null;
    branchId?: string | null;
    referenceId?: string | null;
    referenceType?: string | null;
  }) {
    const rows = task.clientId
      ? await this.dataSource.query(
          `SELECT assigned_to_user_id FROM client_assignments_current WHERE client_id=$1 AND assignment_type='CRM' AND assigned_to_user_id IS NOT NULL LIMIT 1`,
          [task.clientId],
        )
      : [];
    const filing =
      ['COMPLIANCE_RETURN', 'RENEWAL_FILING'].includes(
        task.referenceType || '',
      ) && !!task.referenceId;
    return this.deliver({
      event: filing ? 'return-overdue' : 'task-overdue',
      sourceId: filing ? task.referenceId! : task.id,
      userId: rows[0]?.assigned_to_user_id,
      role: 'CRM',
      clientId: task.clientId,
      branchId: task.branchId,
      module: 'RETURNS',
      title: `OVERDUE: ${task.title}`,
      message: `Task "${task.title}" is overdue (was due ${task.dueDate ? new Date(task.dueDate).toDateString() : 'N/A'}). Assigned to ${task.assignedRole}. Please follow up.`,
      priority: 'CRITICAL',
      entityType: filing ? 'COMPLIANCE_RETURN' : 'TASK',
      dueDate: task.dueDate,
    });
  }

  async sendScheduleNotice(p: {
    scheduleId: string;
    auditorUserId: string;
    clientName: string;
    auditType: string;
    scheduleDate: string;
    dueDate: string | null;
    clientId: string;
  }) {
    return this.deliver({
      event: 'audit-schedule',
      sourceId: p.scheduleId,
      userId: p.auditorUserId,
      role: 'AUDITOR',
      clientId: p.clientId,
      module: 'AUDITS',
      title: `Audit scheduled: ${p.clientName} — ${p.auditType}`,
      message: `You have been scheduled for a ${p.auditType} audit.\nClient: ${p.clientName}\nScheduled: ${p.scheduleDate}\nDue: ${p.dueDate || 'TBD'}`,
      entityType: 'AUDIT_SCHEDULE',
      center: false,
    });
  }

  async sendExpiryAlert(p: {
    documentId: string;
    userId: string;
    role: string;
    documentName: string;
    expiryDate: string;
    clientId?: string;
    branchId?: string;
  }) {
    return this.deliver({
      event: 'document-expiry:' + p.expiryDate,
      sourceId: p.documentId,
      userId: p.userId,
      role: p.role,
      clientId: p.clientId,
      branchId: p.branchId,
      module: 'RENEWALS',
      title: `Document expiring: ${p.documentName}`,
      message: `"${p.documentName}" expires on ${p.expiryDate}. Please renew or upload updated document.`,
      priority: 'HIGH',
      entityType: 'DOCUMENT',
      dueDate: p.expiryDate,
    });
  }

  async sendAuditReportReady(p: {
    auditId: string;
    auditCode: string;
    score: number | null;
    clientId: string;
    branchId?: string | null;
  }) {
    const score = p.score != null ? `${p.score}%` : 'N/A';
    for (const role of ['CRM', 'CLIENT'])
      await this.deliver({
        event: `audit-report:${score}`,
        sourceId: p.auditId,
        role,
        clientId: p.clientId,
        branchId: p.branchId,
        module: 'AUDITS',
        daily: false,
        title:
          role === 'CRM'
            ? `Audit Report Ready — ${p.auditCode}`
            : `Your Audit Report — ${p.auditCode}`,
        message: `Audit ${p.auditCode} report has been generated. Score: ${score}.`,
        priority: role === 'CRM' ? 'HIGH' : 'MEDIUM',
        entityType: 'AUDIT',
      });
  }

  async sendReturnOverdueAlert(p: {
    filingId: string;
    userId: string;
    role: string;
    returnType: string;
    periodLabel: string;
    branchName: string;
    daysOverdue: number;
    clientId?: string;
    branchId?: string;
  }) {
    return this.deliver({
      event: 'return-overdue',
      sourceId: p.filingId,
      userId: p.userId,
      role: p.role,
      clientId: p.clientId,
      branchId: p.branchId,
      module: 'RETURNS',
      title: `OVERDUE: ${p.returnType} — ${p.periodLabel}`,
      message: `Filing "${p.returnType}" for ${p.periodLabel} at ${p.branchName} is ${p.daysOverdue} day(s) overdue. Please follow up immediately.`,
      priority: 'CRITICAL',
      entityType: 'COMPLIANCE_RETURN',
    });
  }
}
