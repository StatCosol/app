import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { AutomationNotificationService } from '../services/automation-notification.service';
import { TaskEngineService } from '../services/task-engine.service';

@Injectable()
export class ExpiryRemindersJob {
  private readonly logger = new Logger(ExpiryRemindersJob.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly automationNotification: AutomationNotificationService,
    private readonly taskEngine: TaskEngineService,
  ) {}

  /** Daily at 07:00 — scan compliance_documents for upcoming expiry. */
  @Cron('0 0 7 * * *')
  async handle() {
    this.logger.log('Starting expiry reminder scan');
    try {
      const withinDays = 30;
      let alertsSent = 0;
      let tasksCreated = 0;

      /* ── 1. Contractor documents expiring soon ────────────── */
      const contractorDocs = await this.dataSource.query(
        `SELECT cd.id, cd.title, cd.expiry_date,
                cd.contractor_user_id, cd.client_id, cd.branch_id,
                u.name AS contractor_name
         FROM contractor_documents cd
         LEFT JOIN users u ON u.id = cd.contractor_user_id
         WHERE cd.expiry_date IS NOT NULL
           AND cd.expiry_date >= CURRENT_DATE
           AND cd.expiry_date <= CURRENT_DATE + $1 * INTERVAL '1 day'
           AND cd.status NOT IN ('EXPIRED','CANCELLED')`,
        [withinDays],
      );

      for (const doc of contractorDocs) {
        try {
          await this.automationNotification.sendExpiryAlert({
            userId: doc.contractor_user_id,
            role: 'CONTRACTOR',
            documentName: doc.title || 'Unnamed document',
            expiryDate: new Date(doc.expiry_date).toDateString(),
            clientId: doc.client_id,
            branchId: doc.branch_id,
          });
          alertsSent++;

          // Create task if none exists yet
          const existing = await this.dataSource.query(
            `SELECT id FROM system_tasks
             WHERE reference_id = $1
               AND reference_type = 'CONTRACTOR_DOC_EXPIRY'
               AND status <> 'CLOSED'
             LIMIT 1`,
            [doc.id],
          );
          if (!existing.length) {
            await this.taskEngine.createTask({
              module: 'RENEWAL',
              title: `Renew: ${doc.title || 'Document'}`,
              description: `Document "${doc.title}" expires ${new Date(doc.expiry_date).toDateString()}.`,
              referenceId: doc.id,
              referenceType: 'CONTRACTOR_DOC_EXPIRY',
              priority: 'HIGH',
              assignedRole: 'CONTRACTOR',
              assignedUserId: doc.contractor_user_id,
              clientId: doc.client_id,
              branchId: doc.branch_id,
              dueDate: new Date(doc.expiry_date),
            });
            tasksCreated++;
          }
        } catch {
          // continue
        }
      }

      /* ── 2. Branch documents expiring soon ────────────────── */
      const branchDocs = await this.dataSource.query(
        `SELECT bd.id, bd.file_name, bd.expiry_date,
                bd.client_id, bd.branch_id,
                cb.branchname
         FROM branch_documents bd
         LEFT JOIN client_branches cb ON cb.id = bd.branch_id
         WHERE bd.expiry_date IS NOT NULL
           AND bd.expiry_date >= CURRENT_DATE
           AND bd.expiry_date <= CURRENT_DATE + $1 * INTERVAL '1 day'
           AND bd.status NOT IN ('EXPIRED','CANCELLED')`,
        [withinDays],
      );

      for (const doc of branchDocs) {
        try {
          // Find branch user
          const branchUsers = await this.dataSource.query(
            `SELECT u.id FROM users u
             JOIN roles r ON r.id = u.role_id
             WHERE r.code = 'BRANCH'
               AND u.client_id = $1
               AND u.is_active = TRUE
               AND u.deleted_at IS NULL
             LIMIT 1`,
            [doc.client_id],
          );
          const userId = branchUsers[0]?.id;
          if (!userId) continue;

          await this.automationNotification.sendExpiryAlert({
            userId,
            role: 'BRANCH',
            documentName: doc.file_name || 'Unnamed document',
            expiryDate: new Date(doc.expiry_date).toDateString(),
            clientId: doc.client_id,
            branchId: doc.branch_id,
          });
          alertsSent++;

          const existing = await this.dataSource.query(
            `SELECT id FROM system_tasks
             WHERE reference_id = $1
               AND reference_type = 'BRANCH_DOC_EXPIRY'
               AND status <> 'CLOSED'
             LIMIT 1`,
            [doc.id],
          );
          if (!existing.length) {
            await this.taskEngine.createTask({
              module: 'RENEWAL',
              title: `Renew: ${doc.file_name || 'Document'}`,
              description: `Branch document "${doc.file_name}" at ${doc.branchname || 'branch'} expires ${new Date(doc.expiry_date).toDateString()}.`,
              referenceId: doc.id,
              referenceType: 'BRANCH_DOC_EXPIRY',
              priority: 'HIGH',
              assignedRole: 'BRANCH',
              assignedUserId: userId,
              clientId: doc.client_id,
              branchId: doc.branch_id,
              dueDate: new Date(doc.expiry_date),
            });
            tasksCreated++;
          }
        } catch {
          // continue
        }
      }

      this.logger.log(
        `Expiry scan: ${contractorDocs.length + branchDocs.length} expiring, ${tasksCreated} tasks, ${alertsSent} alerts`,
      );
    } catch (err) {
      this.logger.error(
        `Expiry reminder job failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
