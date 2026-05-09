import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { NotificationsService } from '../../notifications/notifications.service';

/**
 * Thin facade around NotificationsService that adds automation-specific
 * helpers (batch due-reminders, expiry alerts, schedule notices).
 */
@Injectable()
export class AutomationNotificationService {
  private readonly logger = new Logger(AutomationNotificationService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly notificationsService: NotificationsService,
  ) {}

  /* ── Push to compliance notification center ─────────────────── */
  private async pushToNotificationCenter(params: {
    clientId?: string | null;
    branchId?: string | null;
    role: string;
    module: string;
    title: string;
    message: string;
    priority?: string;
    entityId?: string | null;
    entityType?: string | null;
    dueDate?: Date | string | null;
  }) {
    try {
      await this.dataSource.query(
        `INSERT INTO compliance_notification_center
           ("clientId", "branchId", role, module, title, message,
            priority, "entityId", "entityType", "dueDate")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          params.clientId || null,
          params.branchId || null,
          params.role,
          params.module,
          params.title,
          params.message,
          params.priority || 'MEDIUM',
          params.entityId || null,
          params.entityType || null,
          params.dueDate ? new Date(params.dueDate) : null,
        ],
      );
    } catch (err: any) {
      this.logger.warn(
        `Failed to push notification center entry: ${err.message}`,
      );
    }
  }

  /* ── Task due soon reminder ─────────────────────────────────── */
  async sendTaskDueReminder(task: {
    id: string;
    title: string;
    dueDate: string | Date | null;
    assignedUserId: string | null;
    assignedRole: string;
    clientId?: string | null;
    branchId?: string | null;
  }) {
    if (!task.assignedUserId) return;

    const dueStr = task.dueDate
      ? new Date(task.dueDate).toDateString()
      : 'soon';

    await this.notificationsService.createTicket(
      task.assignedUserId,
      task.assignedRole,
      {
        queryType: 'COMPLIANCE',
        subject: `Due soon: ${task.title}`,
        message: `Task "${task.title}" is due on ${dueStr}. Please complete it promptly.`,
        clientId: task.clientId || undefined,
        branchId: task.branchId || undefined,
      },
    );

    await this.pushToNotificationCenter({
      clientId: task.clientId,
      branchId: task.branchId,
      role: task.assignedRole,
      module: 'RETURNS',
      title: `Due soon: ${task.title}`,
      message: `Task "${task.title}" is due on ${dueStr}. Please complete it promptly.`,
      priority: 'HIGH',
      entityId: task.id,
      entityType: 'TASK',
      dueDate: task.dueDate,
    });
  }

  /* ── Overdue task escalation to CRM ─────────────────────────── */
  async sendOverdueEscalation(task: {
    id: string;
    title: string;
    dueDate: string | Date | null;
    assignedUserId: string | null;
    assignedRole: string;
    clientId?: string | null;
    branchId?: string | null;
  }) {
    const dueStr = task.dueDate ? new Date(task.dueDate).toDateString() : 'N/A';

    // Find CRM assigned to client
    let crmUserId =
      task.assignedUserId || '00000000-0000-0000-0000-000000000000';
    if (task.clientId) {
      const rows = await this.dataSource.query(
        `SELECT crm_user_id FROM client_assignments_current
         WHERE client_id = $1 AND crm_user_id IS NOT NULL LIMIT 1`,
        [task.clientId],
      );
      if (rows.length) crmUserId = rows[0].crm_user_id;
    }

    await this.notificationsService.createTicket(crmUserId, 'CRM', {
      queryType: 'COMPLIANCE',
      subject: `OVERDUE: ${task.title}`,
      message: `Task "${task.title}" is overdue (was due ${dueStr}). Assigned to ${task.assignedRole}. Please follow up.`,
      clientId: task.clientId || undefined,
      branchId: task.branchId || undefined,
    });

    await this.pushToNotificationCenter({
      clientId: task.clientId,
      branchId: task.branchId,
      role: 'CRM',
      module: 'RETURNS',
      title: `OVERDUE: ${task.title}`,
      message: `Task "${task.title}" is overdue (was due ${dueStr}). Assigned to ${task.assignedRole}. Please follow up.`,
      priority: 'CRITICAL',
      entityId: task.id,
      entityType: 'TASK',
      dueDate: task.dueDate,
    });
  }

  /* ── Audit schedule notification ────────────────────────────── */
  async sendScheduleNotice(params: {
    auditorUserId: string;
    clientName: string;
    auditType: string;
    scheduleDate: string;
    dueDate: string | null;
    clientId: string;
  }) {
    await this.notificationsService.createTicket(
      params.auditorUserId,
      'AUDITOR',
      {
        queryType: 'AUDIT',
        subject: `Audit scheduled: ${params.clientName} — ${params.auditType}`,
        message:
          `You have been scheduled for a ${params.auditType} audit.\n` +
          `Client: ${params.clientName}\n` +
          `Scheduled: ${params.scheduleDate}\n` +
          `Due: ${params.dueDate || 'TBD'}`,
        clientId: params.clientId,
      },
    );
  }

  /* ── Expiry alert ───────────────────────────────────────────── */
  async sendExpiryAlert(params: {
    userId: string;
    role: string;
    documentName: string;
    expiryDate: string;
    clientId?: string;
    branchId?: string;
  }) {
    await this.notificationsService.createTicket(params.userId, params.role, {
      queryType: 'COMPLIANCE',
      subject: `Document expiring: ${params.documentName}`,
      message: `"${params.documentName}" expires on ${params.expiryDate}. Please renew or upload updated document.`,
      clientId: params.clientId || undefined,
      branchId: params.branchId || undefined,
    });

    await this.pushToNotificationCenter({
      clientId: params.clientId,
      branchId: params.branchId,
      role: params.role,
      module: 'RENEWALS',
      title: `Document expiring: ${params.documentName}`,
      message: `"${params.documentName}" expires on ${params.expiryDate}. Please renew or upload updated document.`,
      priority: 'HIGH',
      entityType: 'DOCUMENT',
    });
  }

  /* ── Audit report ready notification ─────────────────────────── */
  async sendAuditReportReady(params: {
    auditId: string;
    auditCode: string;
    score: number | null;
    clientId: string;
    branchId?: string | null;
  }) {
    const scoreText = params.score != null ? `${params.score}%` : 'N/A';

    // Push to CRM notification center
    await this.pushToNotificationCenter({
      clientId: params.clientId,
      branchId: params.branchId,
      role: 'CRM',
      module: 'AUDITS',
      title: `Audit Report Ready — ${params.auditCode}`,
      message: `Audit ${params.auditCode} report has been generated. Score: ${scoreText}.`,
      priority: 'HIGH',
      entityId: params.auditId,
      entityType: 'AUDIT',
    });

    // Push to Client notification center
    await this.pushToNotificationCenter({
      clientId: params.clientId,
      branchId: params.branchId,
      role: 'CLIENT',
      module: 'AUDITS',
      title: `Your Audit Report — ${params.auditCode}`,
      message: `Audit report for ${params.auditCode} is now available. Score: ${scoreText}.`,
      priority: 'MEDIUM',
      entityId: params.auditId,
      entityType: 'AUDIT',
    });
  }

  /* ── Returns filing overdue alert ───────────────────────────── */
  async sendReturnOverdueAlert(params: {
    userId: string;
    role: string;
    returnType: string;
    periodLabel: string;
    branchName: string;
    daysOverdue: number;
    clientId?: string;
    branchId?: string;
  }) {
    const subject = `OVERDUE: ${params.returnType} — ${params.periodLabel}`;
    const message =
      `Filing "${params.returnType}" for ${params.periodLabel} at ${params.branchName} ` +
      `is ${params.daysOverdue} day(s) overdue. Please follow up immediately.`;

    await this.notificationsService.createTicket(params.userId, params.role, {
      queryType: 'COMPLIANCE',
      subject,
      message,
      clientId: params.clientId || undefined,
      branchId: params.branchId || undefined,
    });

    await this.pushToNotificationCenter({
      clientId: params.clientId,
      branchId: params.branchId,
      role: params.role,
      module: 'RETURNS',
      title: subject,
      message,
      priority: 'CRITICAL',
      entityType: 'COMPLIANCE_RETURN',
    });
  }
}
