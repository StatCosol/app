import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TaskEngineService } from './task-engine.service';
import { AutomationNotificationService } from './automation-notification.service';

/**
 * Returns Filing Engine:
 * Auto-generates compliance_returns rows + system tasks for each branch
 * based on compliance_return_master frequency rules and branch applicability.
 *
 * Supports MONTHLY, QUARTERLY, HALF_YEARLY, and ANNUAL frequencies.
 */
@Injectable()
export class ReturnsFilingEngineService {
  private readonly logger = new Logger(ReturnsFilingEngineService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly taskEngine: TaskEngineService,
    private readonly notifications: AutomationNotificationService,
  ) {}

  /**
   * Main entry: generate filing rows + tasks for the given year/month.
   * Called by cron (monthly on 1st) or manually via controller.
   */
  async generateFilings(
    year: number,
    month: number,
  ): Promise<{
    filingsCreated: number;
    tasksCreated: number;
    skipped: number;
  }> {
    this.logger.log(
      `Generating filings for ${year}-${String(month).padStart(2, '0')}`,
    );

    let filingsCreated = 0;
    let tasksCreated = 0;
    let skipped = 0;

    // 1. Fetch all active return masters
    const masters = await this.dataSource.query(
      `SELECT return_code, return_name, law_area, frequency, due_day,
              scope_default, applicable_for, applies_to, state_code,
              responsible_role, risk_level, upload_required
       FROM compliance_return_master
       WHERE is_active = true`,
    );

    // 2. For each master, find applicable branches
    for (const master of masters) {
      if (!this.isFilingDue(master.frequency, month)) {
        continue;
      }

      const periodLabel = this.buildPeriodLabel(master.frequency, year, month);
      const periodMonth = this.resolvePeriodMonth(master.frequency, month);
      const dueDate = this.computeDueDate(master, year, month);

      // Find branches that should file this return
      const branches = await this.findApplicableBranches(master);

      for (const branch of branches) {
        // Skip if filing already exists
        const existing = await this.dataSource.query(
          `SELECT id FROM compliance_returns
           WHERE client_id = $1 AND branch_id = $2
             AND return_type = $3 AND period_year = $4
             AND ($5::int IS NULL OR period_month = $5)
             AND is_deleted = false
           LIMIT 1`,
          [branch.client_id, branch.id, master.return_code, year, periodMonth],
        );

        if (existing.length) {
          skipped++;
          continue;
        }

        // Insert filing row
        const inserted = await this.dataSource.query(
          `INSERT INTO compliance_returns
           (client_id, branch_id, law_type, return_type,
            period_year, period_month, period_label,
            due_date, status, created_by_role)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'PENDING', 'SYSTEM')
           RETURNING id`,
          [
            branch.client_id,
            branch.id,
            master.law_area,
            master.return_code,
            year,
            periodMonth,
            periodLabel,
            dueDate,
          ],
        );

        filingsCreated++;

        // Create task for branch user
        const filingId = inserted[0]?.id;
        if (filingId) {
          try {
            await this.taskEngine.createTask({
              module: 'RETURNS',
              title: `File: ${master.return_name} — ${periodLabel}`,
              description: `${master.return_name} (${master.law_area}) is due for ${periodLabel}. Due date: ${dueDate ?? 'N/A'}.`,
              referenceId: filingId,
              referenceType: 'COMPLIANCE_RETURN',
              priority: master.risk_level === 'HIGH' ? 'HIGH' : 'MEDIUM',
              assignedRole: 'BRANCH',
              clientId: branch.client_id,
              branchId: branch.id,
              dueDate: dueDate ? new Date(dueDate) : null,
            });
            tasksCreated++;
          } catch (err) {
            this.logger.warn(
              `Failed to create task for filing ${filingId}: ${err}`,
            );
          }
        }
      }
    }

    this.logger.log(
      `Filing generation done: ${filingsCreated} created, ${tasksCreated} tasks, ${skipped} skipped`,
    );
    return { filingsCreated, tasksCreated, skipped };
  }

  /**
   * Generate overdue alerts for filings past their due date still in PENDING / IN_PROGRESS.
   */
  async generateOverdueAlerts(): Promise<{ alertsSent: number }> {
    this.logger.log('Scanning for overdue filings');

    const overdue = await this.dataSource.query(
      `SELECT cr.id, cr.client_id, cr.branch_id, cr.return_type, cr.due_date,
              cr.period_label, cr.law_type,
              b.branchname,
              EXTRACT(DAY FROM NOW() - cr.due_date::timestamp)::int AS days_overdue
       FROM compliance_returns cr
       JOIN client_branches b ON b.id = cr.branch_id
       WHERE cr.status IN ('PENDING', 'IN_PROGRESS')
         AND cr.due_date IS NOT NULL
         AND cr.due_date < CURRENT_DATE
         AND cr.is_deleted = false`,
    );

    let alertsSent = 0;
    for (const row of overdue) {
      // Escalate task priority if overdue > 7 days
      if (row.days_overdue > 7) {
        await this.dataSource.query(
          `UPDATE system_tasks
           SET priority = 'CRITICAL', updated_at = NOW()
           WHERE reference_id = $1
             AND reference_type = 'COMPLIANCE_RETURN'
             AND status NOT IN ('CLOSED', 'CANCELLED')
             AND priority <> 'CRITICAL'`,
          [row.id],
        );
      }

      // Notify CRM
      try {
        const crmRows = await this.dataSource.query(
          `SELECT assigned_to_user_id FROM client_assignments_current
           WHERE client_id = $1 AND assignment_type = 'CRM'
             AND assigned_to_user_id IS NOT NULL
           LIMIT 1`,
          [row.client_id],
        );
        if (crmRows.length) {
          await this.notifications.sendReturnOverdueAlert({
            userId: crmRows[0].assigned_to_user_id,
            role: 'CRM',
            returnType: row.return_type,
            periodLabel: row.period_label,
            branchName: row.branchname,
            daysOverdue: row.days_overdue,
            clientId: row.client_id,
            branchId: row.branch_id,
          });
          alertsSent++;
        }
      } catch {
        this.logger.warn(`Failed to send overdue alert for filing ${row.id}`);
      }
    }

    this.logger.log(`Overdue alerts: ${alertsSent} sent`);
    return { alertsSent };
  }

  /**
   * Auto-close tasks when a filing reaches APPROVED status.
   * Can be called from returns.service after status transition.
   */
  async closeFilingTask(filingId: string): Promise<void> {
    await this.taskEngine.closeTasksByReference('COMPLIANCE_RETURN', filingId);
  }

  // ── Private helpers ──────────────────────────────────────────

  private isFilingDue(frequency: string, month: number): boolean {
    switch (frequency) {
      case 'MONTHLY':
      case 'MONTHLY_RETURN':
        return true;
      case 'QUARTERLY':
        return [1, 4, 7, 10].includes(month); // Q start months
      case 'HALF_YEARLY':
        return [4, 10].includes(month); // Apr, Oct
      case 'ANNUAL':
      case 'YEARLY':
        return month === 4; // April — fiscal year start
      default:
        return false;
    }
  }

  private buildPeriodLabel(
    frequency: string,
    year: number,
    month: number,
  ): string {
    const monthNames = [
      '',
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];

    switch (frequency) {
      case 'MONTHLY':
      case 'MONTHLY_RETURN':
        return `${monthNames[month]} ${year}`;
      case 'QUARTERLY': {
        const qMap: Record<number, string> = {
          1: 'Q4',
          4: 'Q1',
          7: 'Q2',
          10: 'Q3',
        };
        return `${qMap[month] ?? 'Q?'} FY${year}-${(year + 1) % 100}`;
      }
      case 'HALF_YEARLY': {
        const half = month <= 9 ? 'H1' : 'H2';
        return `${half} FY${year}-${(year + 1) % 100}`;
      }
      case 'ANNUAL':
      case 'YEARLY':
        return `FY${year}-${(year + 1) % 100}`;
      default:
        return `${monthNames[month] ?? ''} ${year}`;
    }
  }

  private resolvePeriodMonth(frequency: string, month: number): number | null {
    if (frequency === 'MONTHLY' || frequency === 'MONTHLY_RETURN') {
      return month;
    }
    if (frequency === 'QUARTERLY') return month;
    if (frequency === 'HALF_YEARLY') return month;
    return null; // ANNUAL — no month
  }

  private computeDueDate(
    master: { frequency: string; due_day: number | null },
    year: number,
    month: number,
  ): string | null {
    const dueDay = master.due_day ?? 20;

    switch (master.frequency) {
      case 'MONTHLY':
      case 'MONTHLY_RETURN': {
        // Due in the following month
        const nextMonth = month === 12 ? 1 : month + 1;
        const nextYear = month === 12 ? year + 1 : year;
        return this.toDateString(nextYear, nextMonth, dueDay);
      }
      case 'QUARTERLY': {
        // Due dueDay of month after quarter end
        const qEnd = month + 2; // e.g. Q1 starts Apr → ends Jun → due Jul
        const dueMonth = qEnd >= 12 ? (qEnd % 12) + 1 : qEnd + 1;
        const dueYear = qEnd >= 12 ? year + 1 : year;
        return this.toDateString(dueYear, dueMonth, dueDay);
      }
      case 'HALF_YEARLY': {
        // Due dueDay of month after half end
        const halfEnd = month + 5; // 6 months
        const dueMonth = halfEnd >= 12 ? (halfEnd % 12) + 1 : halfEnd + 1;
        const dueYear = halfEnd >= 12 ? year + 1 : year;
        return this.toDateString(dueYear, dueMonth, dueDay);
      }
      case 'ANNUAL':
      case 'YEARLY':
        // Due dueDay of month after fiscal year end (March)
        return this.toDateString(year + 1, 4, dueDay);
      default:
        return null;
    }
  }

  private toDateString(year: number, month: number, day: number): string {
    const maxDay = new Date(year, month, 0).getDate();
    const safeDay = Math.min(day, maxDay);
    return `${year}-${String(month).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;
  }

  private async findApplicableBranches(master: {
    return_code: string;
    applies_to: string;
    state_code: string;
    applicable_for: string;
  }): Promise<{ id: string; client_id: string }[]> {
    const conditions: string[] = [
      'b.isactive = true',
      'b.deletedat IS NULL',
    ];
    const params: (string | null)[] = [];
    let paramIdx = 1;

    // State filter
    if (master.state_code && master.state_code !== 'ALL') {
      conditions.push(`(b.statecode = $${paramIdx} OR b.statecode IS NULL)`);
      params.push(master.state_code);
      paramIdx++;
    }

    // Establishment type filter
    if (master.applicable_for === 'FACTORY') {
      conditions.push(`b.establishment_type = 'FACTORY'`);
    } else if (master.applicable_for === 'ESTABLISHMENT') {
      conditions.push(`b.establishment_type = 'ESTABLISHMENT'`);
    }

    const rows = await this.dataSource.query(
      `SELECT b.id, b.clientid AS client_id
       FROM client_branches b
       WHERE ${conditions.join(' AND ')}
       ORDER BY b.clientid, b.id`,
      params,
    );

    return rows;
  }
}
