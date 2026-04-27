import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TaskEngineService, TaskPriority } from './task-engine.service';
import { AutomationNotificationService } from './automation-notification.service';

/**
 * Renewal Filing Engine:
 * Scans branch_registrations and creates renewal-type filing rows
 * in compliance_returns when a registration nears expiry (within 60 days).
 * Complementary to ExpiryEngineService (which creates system_tasks).
 */
@Injectable()
export class RenewalFilingEngineService {
  private readonly logger = new Logger(RenewalFilingEngineService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly taskEngine: TaskEngineService,
    private readonly _notifications: AutomationNotificationService,
  ) {}

  /**
   * Scan expiring registrations and generate renewal filing rows + tasks.
   * Creates a compliance_returns row of type RENEWAL-<regType> so the
   * branch user can track and upload renewal proof through the same flow.
   */
  async generateRenewalFilings(): Promise<{
    filingsCreated: number;
    tasksCreated: number;
    skipped: number;
  }> {
    this.logger.log('Scanning for registrations needing renewal filings');

    let filingsCreated = 0;
    let tasksCreated = 0;
    let skipped = 0;

    // Find registrations expiring within 60 days that don't yet have a renewal filing
    const expiring = await this.dataSource.query(
      `SELECT br.id AS reg_id,
              br.type AS registration_name,
              br.type AS registration_type,
              br.expiry_date,
              br.branch_id,
              b.clientid AS client_id,
              b.branchname,
              EXTRACT(DAY FROM br.expiry_date - NOW())::int AS days_left
       FROM branch_registrations br
       JOIN client_branches b ON b.id = br.branch_id
       WHERE br.expiry_date IS NOT NULL
         AND br.expiry_date > NOW()
         AND br.expiry_date <= NOW() + INTERVAL '60 days'
         AND br.status = 'ACTIVE'
         AND b.isactive = true`,
    );

    const currentYear = new Date().getFullYear();

    for (const reg of expiring) {
      const returnType = `RENEWAL-${(reg.registration_type || 'REG').toUpperCase().replace(/\s+/g, '_')}`;

      // Check if renewal filing already exists for this registration
      const existing = await this.dataSource.query(
        `SELECT id FROM compliance_returns
         WHERE client_id = $1
           AND branch_id = $2
           AND return_type = $3
           AND period_year = $4
           AND is_deleted = false
         LIMIT 1`,
        [reg.client_id, reg.branch_id, returnType, currentYear],
      );

      if (existing.length) {
        skipped++;
        continue;
      }

      // Insert renewal filing row
      const expiryDateStr = new Date(reg.expiry_date)
        .toISOString()
        .substring(0, 10);

      const periodLabel = `Renewal — ${reg.registration_name}`.substring(
        0,
        200,
      );

      const inserted = await this.dataSource.query(
        `INSERT INTO compliance_returns
         (client_id, branch_id, law_type, return_type,
          period_year, period_month, period_label,
          due_date, status, created_by_role)
         VALUES ($1, $2, 'RENEWAL', $3, $4, $5, $6, $7, 'PENDING', 'SYSTEM')
         RETURNING id`,
        [
          reg.client_id,
          reg.branch_id,
          returnType,
          currentYear,
          new Date(reg.expiry_date).getMonth() + 1,
          periodLabel,
          expiryDateStr,
        ],
      );

      filingsCreated++;

      const filingId = inserted[0]?.id;
      if (filingId) {
        const priority =
          reg.days_left <= 7
            ? 'CRITICAL'
            : reg.days_left <= 15
              ? 'HIGH'
              : 'MEDIUM';

        try {
          await this.taskEngine.createTask({
            module: 'RENEWAL',
            title: `Renew: ${reg.registration_name} (${reg.days_left}d left)`,
            description:
              `${reg.registration_name} at ${reg.branchname} expires on ${expiryDateStr}. ` +
              `Please upload renewal proof via the returns filing flow.`,
            referenceId: filingId,
            referenceType: 'RENEWAL_FILING',
            priority: priority as TaskPriority,
            assignedRole: 'BRANCH',
            clientId: reg.client_id,
            branchId: reg.branch_id,
            dueDate: new Date(reg.expiry_date),
          });
          tasksCreated++;
        } catch (err) {
          this.logger.warn(
            `Failed to create renewal task for reg ${reg.reg_id}: ${err}`,
          );
        }
      }
    }

    this.logger.log(
      `Renewal filings: ${filingsCreated} created, ${tasksCreated} tasks, ${skipped} skipped`,
    );
    return { filingsCreated, tasksCreated, skipped };
  }
}
