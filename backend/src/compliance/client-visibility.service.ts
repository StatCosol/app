import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

type CalendarEventRow = {
  id: string;
  title: string;
  due_date: string | Date;
  event_type: string;
  status: string;
  branch_name: string;
};

type ReminderRow = {
  id: string;
  title: string;
  due_date: string | Date;
  reminder_type: string;
  status: string;
  days_left: number | null;
  branch_name: string;
};

/**
 * Client Visibility layer: provides aggregated views of returns,
 * renewals, compliance calendar and reminders for the client portal.
 */
@Injectable()
export class ClientVisibilityService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Returns filing summary grouped by law_type for a client.
   */
  async getReturnsSummary(clientId: string): Promise<any> {
    const rows = await this.dataSource.query(
      `SELECT cr.law_type,
              COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE cr.status = 'APPROVED')::int AS filed,
              COUNT(*) FILTER (WHERE cr.status = 'PENDING')::int AS pending,
              COUNT(*) FILTER (WHERE cr.status = 'REJECTED')::int AS rejected,
              COUNT(*) FILTER (WHERE cr.status = 'IN_PROGRESS')::int AS in_progress,
              COUNT(*) FILTER (WHERE cr.due_date < NOW() AND cr.status NOT IN ('APPROVED','NOT_APPLICABLE'))::int AS overdue
       FROM compliance_returns cr
       WHERE cr.client_id = $1 AND cr.is_deleted = false
       GROUP BY cr.law_type
       ORDER BY cr.law_type`,
      [clientId],
    );
    return rows;
  }

  /**
   * Renewal / expiry items for client: registrations expiring in next 90 days.
   */
  async getRenewals(clientId: string): Promise<any[]> {
    return this.dataSource.query(
      `SELECT br.id, br.type AS registration_name, br.expiry_date,
              b.branchname AS branch_name, b.id AS branch_id,
              EXTRACT(DAY FROM br.expiry_date - NOW())::int AS days_left
       FROM branch_registrations br
       JOIN client_branches b ON b.id = br.branch_id
       WHERE b.clientid = $1
         AND br.expiry_date IS NOT NULL
         AND br.expiry_date > NOW()
         AND br.expiry_date <= NOW() + INTERVAL '90 days'
       ORDER BY br.expiry_date ASC`,
      [clientId],
    );
  }

  /**
   * Compliance calendar events for a client (returns + registrations + audits).
   */
  async getComplianceCalendar(
    clientId: string,
    month?: number,
    year?: number,
  ): Promise<CalendarEventRow[]> {
    const targetYear = year || new Date().getFullYear();
    const targetMonth = month || new Date().getMonth() + 1;

    const events: CalendarEventRow[] = [];

    // Returns due this month
    const returns = await this.dataSource.query(
      `SELECT cr.id, cr.return_type AS title, cr.due_date, 'RETURN' AS event_type, cr.status,
              b.branchname AS branch_name
       FROM compliance_returns cr
       JOIN client_branches b ON b.id = cr.branch_id
       WHERE cr.client_id = $1
         AND EXTRACT(YEAR FROM cr.due_date) = $2
         AND EXTRACT(MONTH FROM cr.due_date) = $3
         AND cr.is_deleted = false
       ORDER BY cr.due_date`,
      [clientId, targetYear, targetMonth],
    );
    events.push(...returns);

    // Registration expiries this month
    const registrations = await this.dataSource.query(
      `SELECT br.id, br.type AS title, br.expiry_date AS due_date,
              'REGISTRATION_EXPIRY' AS event_type, 'EXPIRING' AS status,
              b.branchname AS branch_name
       FROM branch_registrations br
       JOIN client_branches b ON b.id = br.branch_id
       WHERE b.clientid = $1
         AND EXTRACT(YEAR FROM br.expiry_date) = $2
         AND EXTRACT(MONTH FROM br.expiry_date) = $3
       ORDER BY br.expiry_date`,
      [clientId, targetYear, targetMonth],
    );
    events.push(...registrations);

    // Audit due dates this month
    const audits = await this.dataSource.query(
      `SELECT a.id, CONCAT('Audit: ', a.audit_type) AS title, a.due_date,
              'AUDIT' AS event_type, a.status,
              b.branchname AS branch_name
       FROM audits a
       LEFT JOIN client_branches b ON b.id = a.branch_id
       WHERE a.client_id = $1
         AND EXTRACT(YEAR FROM a.due_date) = $2
         AND EXTRACT(MONTH FROM a.due_date) = $3
       ORDER BY a.due_date`,
      [clientId, targetYear, targetMonth],
    );
    events.push(...audits);

    return events.sort(
      (a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime(),
    );
  }

  /**
   * Compliance reminders for a client: upcoming deadlines across returns,
   * registrations, and audit schedules.
   */
  async getReminders(
    clientId: string,
    daysAhead: number = 30,
    branchId?: string,
  ): Promise<ReminderRow[]> {
    const reminders: ReminderRow[] = [];

    // Upcoming returns
    const returnsParams: any[] = [clientId, daysAhead];
    let returnsWhere = `cr.client_id = $1
         AND cr.due_date BETWEEN NOW() AND NOW() + INTERVAL '1 day' * $2
         AND cr.status NOT IN ('APPROVED','NOT_APPLICABLE')
         AND cr.is_deleted = false`;
    if (branchId) {
      returnsParams.push(branchId);
      returnsWhere += ` AND cr.branch_id = $${returnsParams.length}`;
    }
    const upcomingReturns = await this.dataSource.query(
      `SELECT cr.id, cr.return_type AS title, cr.due_date,
              'RETURN_DUE' AS reminder_type, cr.status,
              EXTRACT(DAY FROM cr.due_date - NOW())::int AS days_left,
              b.branchname AS branch_name
       FROM compliance_returns cr
       JOIN client_branches b ON b.id = cr.branch_id
       WHERE ${returnsWhere}
       ORDER BY cr.due_date`,
      returnsParams,
    );
    reminders.push(...upcomingReturns);

    // Expiring registrations
    const regsParams: any[] = [clientId, daysAhead];
    let regsWhere = `b.clientid = $1
         AND br.expiry_date BETWEEN NOW() AND NOW() + INTERVAL '1 day' * $2`;
    if (branchId) {
      regsParams.push(branchId);
      regsWhere += ` AND b.id = $${regsParams.length}`;
    }
    const expiringRegs = await this.dataSource.query(
      `SELECT br.id, br.type AS title, br.expiry_date AS due_date,
              'REGISTRATION_EXPIRY' AS reminder_type, 'EXPIRING' AS status,
              EXTRACT(DAY FROM br.expiry_date - NOW())::int AS days_left,
              b.branchname AS branch_name
       FROM branch_registrations br
       JOIN client_branches b ON b.id = br.branch_id
       WHERE ${regsWhere}
       ORDER BY br.expiry_date`,
      regsParams,
    );
    reminders.push(...expiringRegs);

    return reminders.sort(
      (a, b) => (a.days_left ?? 999) - (b.days_left ?? 999),
    );
  }
}
