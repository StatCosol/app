import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository, DataSource } from 'typeorm';
import { ComplianceTask, TaskStatus } from './entities/compliance-task.entity';
import { ComplianceMcdItem } from './entities/compliance-mcd-item.entity';
import { DocumentReuploadRequest } from './entities/document-reupload-request.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '../email/email.service';
import { UserEntity } from '../users/entities/user.entity';
import { CronLoggerService } from '../common/services/cron-logger.service';

@Injectable()
export class ComplianceCronService {
  private readonly logger = new Logger(ComplianceCronService.name);

  constructor(
    @InjectRepository(ComplianceTask)
    private readonly tasks: Repository<ComplianceTask>,
    @InjectRepository(ComplianceMcdItem)
    private readonly _mcdItems: Repository<ComplianceMcdItem>,
    @InjectRepository(DocumentReuploadRequest)
    private readonly reuploadReqRepo: Repository<DocumentReuploadRequest>,
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    private readonly notifications: NotificationsService,
    private readonly email: EmailService,
    private readonly dataSource: DataSource,
    private readonly cronLogger: CronLoggerService,
  ) {}

  private toDateOnly(d: Date): string {
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  private async findAdminUserId(): Promise<string | null> {
    const admin = await this.users
      .createQueryBuilder('u')
      .innerJoin('roles', 'r', 'r.id = u.role_id')
      .where('r.code = :code', { code: 'ADMIN' })
      .andWhere('u.isActive = true')
      .andWhere('u.deletedAt IS NULL')
      .orderBy('u.createdAt', 'ASC')
      .getOne();
    return admin?.id ?? null;
  }

  @Cron('0 30 1 * * *')
  async markOverdueAndNotify() {
    const logId = await this.cronLogger.start(
      'compliance:markOverdueAndNotify',
    );
    try {
      const today = this.toDateOnly(new Date());

      const due = await this.tasks
        .createQueryBuilder('t')
        .where('t.dueDate < :today', { today })
        .andWhere('t.status IN (:...st)', {
          st: ['PENDING', 'IN_PROGRESS', 'REJECTED'] as TaskStatus[],
        })
        .getMany();

      if (!due.length) {
        return;
      }

      await this.tasks
        .createQueryBuilder()
        .update()
        .set({ status: 'OVERDUE' as TaskStatus })
        .where('dueDate < :today', { today })
        .andWhere('status IN (:...st)', {
          st: ['PENDING', 'IN_PROGRESS', 'REJECTED'] as TaskStatus[],
        })
        .execute();

      for (const t of due) {
        const taskId = t.id;
        const clientId = t.clientId;
        const branchId = t.branchId;

        // Notify CRM via notification ticket
        if (t.assignedByUserId) {
          try {
            await this.notifications.createTicket(t.assignedByUserId, 'CRM', {
              queryType: 'COMPLIANCE',
              subject: `Task Overdue #${taskId}`,
              message: `Compliance task #${taskId} is overdue as of ${today}. Please follow up with the contractor.`,
              clientId: clientId ? String(clientId) : undefined,
              branchId: branchId ? String(branchId) : undefined,
            });
          } catch (e: any) {
            this.logger.warn(
              `Failed to create overdue notification for CRM on task #${taskId}: ${e.message}`,
            );
          }
        }

        // Notify contractor via notification ticket
        if (t.assignedToUserId) {
          try {
            await this.notifications.createTicket(
              t.assignedToUserId,
              'CONTRACTOR',
              {
                queryType: 'COMPLIANCE',
                subject: `Task Overdue #${taskId}`,
                message: `Compliance task #${taskId} is overdue. Please upload evidence and submit immediately.`,
                clientId: clientId ? String(clientId) : undefined,
                branchId: branchId ? String(branchId) : undefined,
              },
            );
          } catch (e: any) {
            this.logger.warn(
              `Failed to create overdue notification for contractor on task #${taskId}: ${e.message}`,
            );
          }
        }

        // Existing email logic remains
        if (t.assignedByUserId) {
          const crm = await this.users.findOne({
            where: { id: t.assignedByUserId },
          });
          if (crm?.email) {
            await this.email.send(
              crm.email,
              `Task Overdue #${taskId}`,
              'Compliance Task Overdue',
              `Task #${taskId} is overdue as of ${today}. Please follow up with the contractor.`,
            );
          }
        }
        if (t.assignedToUserId) {
          const contractor = await this.users.findOne({
            where: { id: t.assignedToUserId },
          });
          if (contractor?.email) {
            await this.email.send(
              contractor.email,
              `Task Overdue #${taskId}`,
              'Compliance Task Overdue',
              `Task #${taskId} is overdue. Please upload evidence and submit immediately.`,
            );
          }
        }
      }

      this.logger.log(`Marked overdue + notified for ${due.length} tasks`);
      await this.cronLogger.succeed(logId, due.length);
    } catch (err: any) {
      await this.cronLogger.fail(logId, err);
      this.logger.error(
        `markOverdueAndNotify failed: ${(err as Error).message}`,
      );
    }
  }

  @Cron('0 0 1 * * *')
  async sendSlaReminders() {
    const today = new Date();
    const todayStr = this.toDateOnly(today);

    const threeDaysAhead = new Date(today.getTime());
    threeDaysAhead.setUTCDate(threeDaysAhead.getUTCDate() + 3);
    const threeDaysAheadStr = this.toDateOnly(threeDaysAhead);

    const threeDaysAgo = new Date(today.getTime());
    threeDaysAgo.setUTCDate(threeDaysAgo.getUTCDate() - 3);
    const threeDaysAgoStr = this.toDateOnly(threeDaysAgo);

    // 1) Three days before due date -> notify contractor
    const dueSoon = await this.tasks
      .createQueryBuilder('t')
      .where('t.dueDate = :dueSoon', { dueSoon: threeDaysAheadStr })
      .andWhere('t.status IN (:...st)', {
        st: ['PENDING', 'IN_PROGRESS'] as TaskStatus[],
      })
      .andWhere('t.lastNotifiedAt IS NULL')
      .getMany();

    for (const t of dueSoon) {
      if (!t.assignedToUserId) continue;

      try {
        await this.notifications.createTicket(
          t.assignedToUserId,
          'CONTRACTOR',
          {
            queryType: 'COMPLIANCE',
            subject: `Task Due Soon #${t.id}`,
            message: `Compliance task #${t.id} is due on ${threeDaysAheadStr}. Please upload evidence and submit before the deadline.`,
            clientId: t.clientId ? String(t.clientId) : undefined,
            branchId: t.branchId ? String(t.branchId) : undefined,
          },
        );
      } catch (e: any) {
        this.logger.warn(
          `Failed to create due-soon notification for task #${t.id}: ${e.message}`,
        );
      }

      await this.tasks.update({ id: t.id }, { lastNotifiedAt: new Date() });
    }

    // 2) On due date -> notify contractor + CRM
    const dueToday = await this.tasks
      .createQueryBuilder('t')
      .where('t.dueDate = :today', { today: todayStr })
      .andWhere('t.status IN (:...st)', {
        st: ['PENDING', 'IN_PROGRESS'] as TaskStatus[],
      })
      .getMany();

    for (const t of dueToday) {
      const clientId = t.clientId;
      const branchId = t.branchId;

      // Notify contractor
      if (t.assignedToUserId) {
        try {
          await this.notifications.createTicket(
            t.assignedToUserId,
            'CONTRACTOR',
            {
              queryType: 'COMPLIANCE',
              subject: `Task Due Today #${t.id}`,
              message: `Compliance task #${t.id} is due today (${todayStr}). Please submit before end of day.`,
              clientId: clientId ? String(clientId) : undefined,
              branchId: branchId ? String(branchId) : undefined,
            },
          );
        } catch (e: any) {
          this.logger.warn(
            `Failed to create due-today notification for contractor on task #${t.id}: ${e.message}`,
          );
        }
      }

      // Notify CRM
      if (t.assignedByUserId) {
        try {
          await this.notifications.createTicket(t.assignedByUserId, 'CRM', {
            queryType: 'COMPLIANCE',
            subject: `Task Due Today #${t.id}`,
            message: `Compliance task #${t.id} is due today (${todayStr}). Please follow up with the contractor.`,
            clientId: clientId ? String(clientId) : undefined,
            branchId: branchId ? String(branchId) : undefined,
          });
        } catch (e: any) {
          this.logger.warn(
            `Failed to create due-today notification for CRM on task #${t.id}: ${e.message}`,
          );
        }
      }
    }

    // 3) Three days overdue -> escalate to ADMIN
    const overdueEscalation = await this.tasks
      .createQueryBuilder('t')
      .where('t.dueDate = :threeDaysAgo', { threeDaysAgo: threeDaysAgoStr })
      .andWhere('t.status = :overdue', { overdue: 'OVERDUE' })
      .getMany();

    for (const t of overdueEscalation) {
      try {
        // Escalate to admin — use a system-level notification
        const adminId = await this.findAdminUserId();
        if (adminId) {
          await this.notifications.createTicket(adminId, 'ADMIN', {
            queryType: 'COMPLIANCE',
            subject: `Escalation: Task Overdue 3+ Days #${t.id}`,
            message: `Compliance task #${t.id} has been overdue for 3+ days (due ${t.dueDate}). Requires immediate admin attention.`,
            clientId: t.clientId ? String(t.clientId) : undefined,
            branchId: t.branchId ? String(t.branchId) : undefined,
          });
        }
      } catch (e: any) {
        this.logger.warn(
          `Failed to create escalation notification for task #${t.id}: ${e.message}`,
        );
      }
    }

    this.logger.log(
      `SLA reminders processed: ${dueSoon.length} due-soon, ${dueToday.length} due-today tasks`,
    );
  }

  /* ═══════ Reupload Reminders (daily 09:30) ═══════ */

  @Cron('0 30 9 * * *')
  async sendReuploadReminders() {
    const now = new Date();
    const adminId = await this.findAdminUserId();

    // OPEN requests older than 2 days → remind target + CRM
    const openCutoff = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    const openOld = await this.reuploadReqRepo.find({
      where: { status: 'OPEN', updatedAt: LessThan(openCutoff) },
      take: 200,
      order: { updatedAt: 'ASC' },
    });

    for (const r of openOld) {
      // Notify CRM
      try {
        await this.notifications.createTicket(
          adminId || r.requestedByUserId,
          'CRM',
          {
            queryType: 'COMPLIANCE',
            subject: `Reminder: Reupload Pending — Doc #${r.documentId}`,
            message: `Pending reupload (${r.targetRole}) for ${r.documentType || 'document'} since ${r.updatedAt?.toISOString().slice(0, 10)}.`,
            clientId: r.clientId ? String(r.clientId) : undefined,
          },
        );
      } catch (e: any) {
        this.logger.warn(
          `Reupload reminder (CRM) failed for ${r.id}: ${e.message}`,
        );
      }

      // Notify target user (contractor gets direct notification)
      if (r.targetRole === 'CONTRACTOR' && r.contractorUserId) {
        try {
          await this.notifications.createTicket(
            r.contractorUserId,
            'CONTRACTOR',
            {
              queryType: 'COMPLIANCE',
              subject: `Reminder: Reupload Pending — Doc #${r.documentId}`,
              message: `You have a pending reupload for ${r.documentType || 'document'}. Please upload and submit before the deadline.`,
              clientId: r.clientId ? String(r.clientId) : undefined,
            },
          );
        } catch (e: any) {
          this.logger.warn(
            `Reupload reminder (CONTRACTOR) failed for ${r.id}: ${(e as Error)?.message}`,
          );
        }
      }
    }

    // SUBMITTED requests older than 1 day → remind auditor + CRM
    const submittedCutoff = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);
    const submittedOld = await this.reuploadReqRepo.find({
      where: {
        status: 'SUBMITTED',
        updatedAt: LessThan(submittedCutoff),
      },
      take: 200,
      order: { updatedAt: 'ASC' },
    });

    for (const r of submittedOld) {
      // Notify CRM
      try {
        await this.notifications.createTicket(
          adminId || r.requestedByUserId,
          'CRM',
          {
            queryType: 'COMPLIANCE',
            subject: `Reminder: Verification Pending — Doc #${r.documentId}`,
            message: `Reupload submitted for ${r.documentType || 'document'} (${r.targetRole}). Please ensure auditor verifies.`,
            clientId: r.clientId ? String(r.clientId) : undefined,
          },
        );
      } catch (e: any) {
        this.logger.warn(
          `Reupload verification reminder (CRM) failed for ${r.id}: ${e.message}`,
        );
      }

      // Notify auditor who requested it
      if (r.requestedByUserId) {
        try {
          await this.notifications.createTicket(
            r.requestedByUserId,
            'AUDITOR',
            {
              queryType: 'COMPLIANCE',
              subject: `Reminder: Verification Pending — Doc #${r.documentId}`,
              message: `Reupload submitted for ${r.documentType || 'document'} — please verify.`,
              clientId: r.clientId ? String(r.clientId) : undefined,
            },
          );
        } catch {
          /* non-blocking */
        }
      }
    }

    this.logger.log(
      `Reupload reminders sent: OPEN=${openOld.length}, SUBMITTED=${submittedOld.length}`,
    );
  }

  /* ═══════ MCD Reminders (daily 10:00) ═══════ */

  @Cron('0 0 10 * * *')
  async sendMcdReminders() {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1;
    const dayOfMonth = now.getUTCDate();
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const daysLeft = daysInMonth - dayOfMonth;

    // Only send reminders when <= 5 days left in the month
    if (daysLeft > 5) return;

    try {
      // Find branches with PENDING MCD items for this month
      const pendingBranches: Array<{
        branchId: string;
        branchName: string;
        clientId: string;
        pendingCount: number;
        crmUserId: string | null;
      }> = await this.dataSource.query(
        `SELECT
           ct.branch_id   AS "branchId",
           b.branchname   AS "branchName",
           ct.client_id   AS "clientId",
           COUNT(mci.id)  AS "pendingCount",
           cac.assigned_to_user_id AS "crmUserId"
         FROM compliance_tasks ct
         JOIN compliance_mcd_items mci ON mci.task_id = ct.id
         JOIN client_branches b ON b.id = ct.branch_id
         LEFT JOIN client_assignments_current cac
           ON cac.client_id = ct.client_id
           AND cac.assignment_type = 'CRM'
         WHERE ct.period_year = $1
           AND ct.period_month = $2
           AND mci.status IN ('PENDING', 'RETURNED')
         GROUP BY ct.branch_id, b.branchname, ct.client_id, cac.assigned_to_user_id`,
        [year, month],
      );

      for (const row of pendingBranches) {
        if (!row.crmUserId) continue;

        try {
          await this.notifications.createTicket(row.crmUserId, 'CRM', {
            queryType: 'COMPLIANCE',
            subject: `MCD Reminder: ${row.branchName}`,
            message: `Branch "${row.branchName}" has ${row.pendingCount} pending MCD items for ${year}-${String(month).padStart(2, '0')}. ${daysLeft} days left in the month.`,
            clientId: String(row.clientId),
            branchId: String(row.branchId),
          });
        } catch (e: any) {
          this.logger.warn(
            `MCD reminder failed for branch ${row.branchId}: ${e.message}`,
          );
        }
      }

      this.logger.log(
        `MCD reminders sent for ${pendingBranches.length} branches`,
      );
    } catch (e: any) {
      this.logger.error(`MCD reminders cron error: ${e.message}`);
    }
  }

  /* ═══════ MCD Escalation (1st of month at 08:00) ═══════ */

  @Cron('0 0 8 1 * *')
  async escalateOverdueMcd() {
    const now = new Date();
    // Escalate previous month's incomplete MCD
    let prevMonth = now.getUTCMonth(); // 0-based, so this is previous month (1-based)
    let prevYear = now.getUTCFullYear();
    if (prevMonth === 0) {
      prevMonth = 12;
      prevYear -= 1;
    }

    try {
      const adminId = await this.findAdminUserId();
      if (!adminId) return;

      const incompleteBranches: Array<{
        branchId: string;
        branchName: string;
        clientId: string;
        pendingCount: number;
        crmUserId: string | null;
      }> = await this.dataSource.query(
        `SELECT
           ct.branch_id   AS "branchId",
           b.branchname   AS "branchName",
           ct.client_id   AS "clientId",
           COUNT(mci.id)  AS "pendingCount",
           cac.assigned_to_user_id AS "crmUserId"
         FROM compliance_tasks ct
         JOIN compliance_mcd_items mci ON mci.task_id = ct.id
         JOIN client_branches b ON b.id = ct.branch_id
         LEFT JOIN client_assignments_current cac
           ON cac.client_id = ct.client_id
           AND cac.assignment_type = 'CRM'
         WHERE ct.period_year = $1
           AND ct.period_month = $2
           AND mci.status IN ('PENDING', 'RETURNED', 'REJECTED')
         GROUP BY ct.branch_id, b.branchname, ct.client_id, cac.assigned_to_user_id`,
        [prevYear, prevMonth],
      );

      for (const row of incompleteBranches) {
        // Escalate to admin
        try {
          await this.notifications.createTicket(adminId, 'ADMIN', {
            queryType: 'COMPLIANCE',
            subject: `MCD Escalation: ${row.branchName} (${prevYear}-${String(prevMonth).padStart(2, '0')})`,
            message: `Branch "${row.branchName}" has ${row.pendingCount} incomplete MCD items from last month. Requires admin intervention.`,
            clientId: String(row.clientId),
            branchId: String(row.branchId),
          });
        } catch (e: any) {
          this.logger.warn(
            `MCD escalation failed for branch ${row.branchId}: ${e.message}`,
          );
        }

        // Also notify CRM
        if (row.crmUserId) {
          try {
            await this.notifications.createTicket(row.crmUserId, 'CRM', {
              queryType: 'COMPLIANCE',
              subject: `MCD Overdue Escalation: ${row.branchName}`,
              message: `Branch "${row.branchName}" has ${row.pendingCount} incomplete MCD items from ${prevYear}-${String(prevMonth).padStart(2, '0')}. This has been escalated to admin.`,
              clientId: String(row.clientId),
              branchId: String(row.branchId),
            });
          } catch {
            /* non-blocking */
          }
        }
      }

      this.logger.log(
        `MCD escalation: ${incompleteBranches.length} branches escalated`,
      );
    } catch (e: any) {
      this.logger.error(`MCD escalation cron error: ${e.message}`);
    }
  }

  /**
   * Daily at 2:00 AM: Notify contractors about non-compliant audit documents.
   * Sends notification + email for each contractor that has REJECTED documents
   * on any active (non-completed, non-cancelled) audit.
   */
  @Cron('0 0 2 * * *')
  async notifyNonCompliantAuditDocuments() {
    const logId = await this.cronLogger.start(
      'audit:notifyNonCompliantDocuments',
    );
    try {
      // Find all contractors with non-complied (REJECTED) documents tied to active audits
      const rows: Array<{
        contractorUserId: string;
        contractorName: string;
        contractorEmail: string;
        auditCode: string;
        auditId: string;
        nonCompliedCount: number;
        clientName: string;
        auditorEmail: string | null;
      }> = await this.dataSource.query(
        `SELECT
           cd.contractor_user_id AS "contractorUserId",
           u.name AS "contractorName",
           u.email AS "contractorEmail",
           a.audit_code AS "auditCode",
           a.id AS "auditId",
           COUNT(*)::int AS "nonCompliedCount",
           c.client_name AS "clientName",
           au.email AS "auditorEmail"
         FROM contractor_documents cd
         JOIN audits a ON a.id = cd.audit_id
         JOIN users u ON u.id = cd.contractor_user_id
         LEFT JOIN clients c ON c.id = a.client_id
         LEFT JOIN users au ON au.id = a.assigned_auditor_id AND au.deleted_at IS NULL
         WHERE cd.status = 'REJECTED'
           AND a.status IN ('PLANNED', 'IN_PROGRESS')
         GROUP BY cd.contractor_user_id, u.name, u.email, a.audit_code, a.id, c.client_name, au.email`,
      );

      if (!rows.length) {
        await this.cronLogger.succeed(logId, 0);
        return;
      }

      let notified = 0;
      for (const row of rows) {
        // Create in-app notification
        try {
          await this.notifications.createTicket(
            row.contractorUserId,
            'CONTRACTOR',
            {
              queryType: 'COMPLIANCE',
              subject: `Non-Compliant Documents: Audit ${row.auditCode}`,
              message: `You have ${row.nonCompliedCount} non-compliant document(s) for audit ${row.auditCode} (${row.clientName}). Please upload corrected documents to resolve the findings.`,
            },
          );
        } catch (e: any) {
          this.logger.warn(
            `Failed to notify contractor ${row.contractorUserId} for audit ${row.auditId}: ${e.message}`,
          );
        }

        // Send email
        if (row.contractorEmail) {
          try {
            const cc =
              row.auditorEmail &&
              row.auditorEmail.toLowerCase() !==
                row.contractorEmail.toLowerCase()
                ? [row.auditorEmail]
                : undefined;
            await this.email.sendAuditMail(
              row.contractorEmail,
              `Action Required: ${row.nonCompliedCount} Non-Compliant Documents`,
              'Audit Non-Compliance Notice',
              `Dear ${row.contractorName || 'Contractor'},\n\nYou have ${row.nonCompliedCount} non-compliant document(s) for audit ${row.auditCode} (${row.clientName}). Please log in to the portal and upload corrected documents as soon as possible.\n\nThis is a daily reminder until all non-compliant items are resolved.`,
              cc ? { cc } : undefined,
            );
          } catch (e: any) {
            this.logger.warn(
              `Failed to email ${row.contractorEmail} for audit ${row.auditId}: ${e.message}`,
            );
          }
        }
        notified++;
      }

      this.logger.log(
        `Non-compliant audit doc notifications: ${notified} contractor-audit pairs notified`,
      );
      await this.cronLogger.succeed(logId, notified);
    } catch (err: any) {
      await this.cronLogger.fail(logId, err);
      this.logger.error(
        `notifyNonCompliantAuditDocuments failed: ${(err as Error).message}`,
      );
    }
  }
}
