import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TaskEngineService } from './task-engine.service';
import { NotificationsService } from '../../notifications/notifications.service';

/**
 * Expiry Engine: Tracks license/registration/certificate expiry
 * and auto-creates renewal tasks + alerts.
 */
@Injectable()
export class ExpiryEngineService {
  private readonly logger = new Logger(ExpiryEngineService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly taskEngine: TaskEngineService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Scan for expiring registrations, licenses, and safety certificates.
   * Create renewal tasks and send alerts at 30/15/7/3 day thresholds.
   */
  async generateExpiryAlerts(): Promise<{
    expiringItems: number;
    tasksCreated: number;
    alertsSent: number;
  }> {
    this.logger.log('Scanning for expiring documents');

    let expiringItems = 0;
    let tasksCreated = 0;
    let alertsSent = 0;

    // Scan branch registrations with expiry dates
    const expiringRegs = await this.dataSource.query(
      `SELECT br.id, br.registration_name, br.expiry_date, br.branch_id,
              b.client_id, b.branchname,
              EXTRACT(DAY FROM br.expiry_date - NOW())::int AS days_left
       FROM branch_registrations br
       JOIN client_branches b ON b.id = br.branch_id
       WHERE br.expiry_date IS NOT NULL
         AND br.expiry_date > NOW()
         AND br.expiry_date <= NOW() + INTERVAL '30 days'
         AND br.deleted_at IS NULL`,
    );

    for (const reg of expiringRegs) {
      expiringItems++;
      const daysLeft = reg.days_left;
      const alertThresholds = [30, 15, 7, 3];

      if (alertThresholds.includes(daysLeft)) {
        // Check if we already created a task for this
        const existingTask = await this.dataSource.query(
          `SELECT id FROM system_tasks
           WHERE reference_id = $1 AND reference_type = 'REGISTRATION_EXPIRY'
             AND status NOT IN ('CLOSED','CANCELLED')
           LIMIT 1`,
          [reg.id],
        );

        if (!existingTask.length) {
          await this.taskEngine.createTask({
            module: 'RENEWAL',
            referenceId: reg.id,
            referenceType: 'REGISTRATION_EXPIRY',
            clientId: reg.client_id,
            branchId: reg.branch_id,
            assignedRole: 'BRANCH',
            title: `Renewal due: ${reg.registration_name} — ${daysLeft} days left`,
            description: `${reg.registration_name} at ${reg.branchname} expires on ${new Date(reg.expiry_date).toDateString()}. Please initiate renewal.`,
            dueDate: new Date(reg.expiry_date),
            priority:
              daysLeft <= 7 ? 'CRITICAL' : daysLeft <= 15 ? 'HIGH' : 'MEDIUM',
          });
          tasksCreated++;
        }

        // Send notification
        try {
          // Find CRM for this client
          const crmRows = await this.dataSource.query(
            `SELECT crm_user_id FROM client_assignments_current
             WHERE client_id = $1 AND crm_user_id IS NOT NULL LIMIT 1`,
            [reg.client_id],
          );
          if (crmRows.length) {
            await this.notificationsService.createTicket(
              crmRows[0].crm_user_id,
              'CRM',
              {
                queryType: 'COMPLIANCE',
                subject: `Expiry Alert: ${reg.registration_name} — ${daysLeft} days`,
                message: `${reg.registration_name} at ${reg.branchname} expires in ${daysLeft} days. Please ensure renewal is initiated.`,
                clientId: reg.client_id,
                branchId: reg.branch_id,
              },
            );
            alertsSent++;
          }
        } catch {
          this.logger.warn(
            `Failed to send expiry alert for registration ${reg.id}`,
          );
        }
      }
    }

    // Scan contractor licenses
    const expiringLicenses = await this.dataSource.query(
      `SELECT cd.id, cd.title, cd.expiry_date, cd.contractor_id,
              u.client_id,
              EXTRACT(DAY FROM cd.expiry_date - NOW())::int AS days_left
       FROM contractor_documents cd
       JOIN users u ON u.id = cd.contractor_id
       WHERE cd.expiry_date IS NOT NULL
         AND cd.expiry_date > NOW()
         AND cd.expiry_date <= NOW() + INTERVAL '30 days'
         AND cd.deleted_at IS NULL`,
    );

    for (const lic of expiringLicenses) {
      expiringItems++;
      const daysLeft = lic.days_left;

      if ([30, 15, 7, 3].includes(daysLeft)) {
        const existingTask = await this.dataSource.query(
          `SELECT id FROM system_tasks
           WHERE reference_id = $1 AND reference_type = 'LICENSE_EXPIRY'
             AND status NOT IN ('CLOSED','CANCELLED')
           LIMIT 1`,
          [lic.id],
        );

        if (!existingTask.length) {
          await this.taskEngine.createTask({
            module: 'RENEWAL',
            referenceId: lic.id,
            referenceType: 'LICENSE_EXPIRY',
            clientId: lic.client_id,
            contractorId: lic.contractor_id,
            assignedRole: 'CONTRACTOR',
            assignedUserId: lic.contractor_id,
            title: `License renewal: ${lic.title} — ${daysLeft} days left`,
            description: `Contractor license ${lic.title} expires on ${new Date(lic.expiry_date).toDateString()}.`,
            dueDate: new Date(lic.expiry_date),
            priority: daysLeft <= 7 ? 'CRITICAL' : 'HIGH',
          });
          tasksCreated++;
        }
      }
    }

    this.logger.log(
      `Expiry scan: ${expiringItems} expiring, ${tasksCreated} tasks, ${alertsSent} alerts`,
    );
    return { expiringItems, tasksCreated, alertsSent };
  }
}
