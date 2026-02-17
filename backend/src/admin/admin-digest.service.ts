import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { EmailService } from '../email/email.service';

@Injectable()
export class AdminDigestService {
  private readonly logger = new Logger(AdminDigestService.name);

  constructor(
    private readonly ds: DataSource,
    private readonly email: EmailService,
  ) {}

  // Monday at 09:00 AM
  @Cron('0 0 9 * * 1')
  async weeklyDigest(): Promise<void> {
    try {
      this.logger.log('Running scheduled weekly digest');
      await this.sendDigest();
      this.logger.log('Weekly digest completed');
    } catch (err) {
      this.logger.error(
        'Weekly digest failed',
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  // Daily at 08:00 AM for critical alerts
  @Cron('0 0 8 * * *')
  async dailyCriticalAlerts(): Promise<void> {
    try {
      this.logger.log('Running scheduled daily critical alerts');
      await this.sendCriticalAlerts();
      this.logger.log('Daily critical alerts completed');
    } catch (err) {
      this.logger.error(
        'Daily critical alerts failed',
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  async sendDigest(): Promise<void> {
    this.logger.log('Starting admin weekly digest send');
    const admins: Array<{ email: string }> = await this.ds.query(
      `
      SELECT u.email
      FROM users u
      JOIN roles r ON r.id = u.role_id
      WHERE r.code IN ('ADMIN','CCO')
        AND u.is_active = true
        AND u.deleted_at IS NULL
      `,
    );

    const to = admins.map((u) => u.email).filter(Boolean);
    if (!to.length) {
      this.logger.warn('Skipping weekly digest: no admin recipients found');
      return;
    }

    let overdueAudits: any[] = [];
    let assignmentsDue: any[] = [];
    let lowestCompliance: any[] = [];
    try {
      overdueAudits = await this.ds.query(
        `
        SELECT
          c.client_name AS client,
          NULL::text AS branch_name,
          a.audit_type,
          (now()::date - a.due_date::date) AS days_overdue
        FROM audits a
        JOIN clients c ON c.id = a.client_id
        WHERE a.status <> 'COMPLETED'
          AND a.due_date < now()
        ORDER BY days_overdue DESC
        LIMIT 10
        `,
      );
    } catch (err) {
      this.logger.warn(`Skipping overdue audits digest: ${err}`);
    }

    try {
      assignmentsDue = await this.ds.query(
        `
        SELECT
          c.client_name AS client,
          ca.assignment_type,
          CASE
            WHEN ca.assignment_type = 'CRM' THEN ca.start_date + interval '365 days'
            ELSE ca.start_date + interval '120 days'
          END AS due_date
        FROM client_assignments_current ca
        JOIN clients c ON c.id = ca.client_id
        WHERE (
            (ca.assignment_type = 'CRM' AND ca.start_date + interval '365 days' <= now() + interval '30 days')
            OR
            (ca.assignment_type <> 'CRM' AND ca.start_date + interval '120 days' <= now() + interval '30 days')
          )
        LIMIT 10
        `,
      );
    } catch (err) {
      this.logger.warn(`Skipping assignments due digest: ${err}`);
    }

    try {
      lowestCompliance = await this.ds.query(
        `
        SELECT client_name, branch_name, compliance_percent
        FROM vw_compliance_coverage
        WHERE total_compliances > 0
        ORDER BY compliance_percent ASC
        LIMIT 5
        `,
      );
    } catch (err) {
      this.logger.warn(`Skipping compliance coverage digest: ${err}`);
    }

    const html = this.buildHtml(
      overdueAudits,
      assignmentsDue,
      lowestCompliance,
    );

    await this.email.send(
      to,
      'Statco Weekly Compliance Digest',
      'Weekly Compliance Digest',
      html,
    );
    this.logger.log('Weekly digest email sent');
  }

  async sendCriticalAlerts(): Promise<void> {
    this.logger.log('Starting admin daily critical alerts send');
    const admins: Array<{ email: string }> = await this.ds.query(
      `
      SELECT u.email
      FROM users u
      JOIN roles r ON r.id = u.role_id
      WHERE r.code IN ('ADMIN','CCO')
        AND u.is_active = true
        AND u.deleted_at IS NULL
      `,
    );

    const to = admins.map((u) => u.email).filter(Boolean);
    if (!to.length) {
      this.logger.warn('Skipping critical alerts: no admin recipients found');
      return;
    }

    let overdueAudits30: any[] = [];
    let assignmentsPastDue: any[] = [];
    try {
      overdueAudits30 = await this.ds.query(
        `
        SELECT
          c.client_name AS client,
          NULL::text AS branch_name,
          a.audit_type,
          a.due_date,
          (now()::date - a.due_date::date) AS days_overdue
        FROM audits a
        JOIN clients c ON c.id = a.client_id
        WHERE a.status <> 'COMPLETED'
          AND a.due_date < now()
          AND (now()::date - a.due_date::date) > 30
        ORDER BY days_overdue DESC
        LIMIT 20
        `,
      );
    } catch (err) {
      this.logger.warn(`Skipping overdue audits critical alert: ${err}`);
    }

    try {
      assignmentsPastDue = await this.ds.query(
        `
        SELECT
          c.client_name AS client,
          ca.assignment_type,
          CASE
            WHEN ca.assignment_type = 'CRM' THEN ca.start_date + interval '365 days'
            ELSE ca.start_date + interval '120 days'
          END AS due_date,
          (now()::date - CASE
             WHEN ca.assignment_type = 'CRM' THEN (ca.start_date + interval '365 days')::date
             ELSE (ca.start_date + interval '120 days')::date
           END) AS days_past_due
        FROM client_assignments_current ca
        JOIN clients c ON c.id = ca.client_id
        WHERE (
            (ca.assignment_type = 'CRM' AND ca.start_date + interval '365 days' < now())
            OR
            (ca.assignment_type <> 'CRM' AND ca.start_date + interval '120 days' < now())
          )
        ORDER BY days_past_due DESC
        LIMIT 20
        `,
      );
    } catch (err) {
      this.logger.warn(`Skipping assignments critical alert: ${err}`);
    }

    if (!overdueAudits30.length && !assignmentsPastDue.length) return;

    const html = this.buildCriticalHtml(overdueAudits30, assignmentsPastDue);
    await this.email.send(
      to,
      'Statco Daily Critical Alerts',
      'Daily Critical Alerts',
      html,
    );
    this.logger.log('Critical alerts email sent');
  }

  private buildHtml(audits: any[], assigns: any[], compliance: any[]): string {
    const row = (cols: any[]) =>
      `<tr>${cols.map((c) => `<td>${this.escapeHtml(c)}</td>`).join('')}</tr>`;

    return `
      <h2>Weekly Compliance Digest</h2>

      <h3>Overdue Audits</h3>
      <table border="1" cellpadding="6">
        ${audits
          .map((a) =>
            row([
              a.client,
              a.branch_name,
              a.audit_type,
              `${a.days_overdue} days`,
            ]),
          )
          .join('')}
      </table>

      <h3>Assignments Due Soon</h3>
      <table border="1" cellpadding="6">
        ${assigns.map((a) => row([a.client, a.assignment_type, a.due_date])).join('')}
      </table>

      <h3>Lowest Compliance Branches</h3>
      <table border="1" cellpadding="6">
        ${compliance.map((c) => row([c.client_name, c.branch_name, `${c.compliance_percent}%`])).join('')}
      </table>

      <p>— Statco System</p>
    `;
  }

  private buildCriticalHtml(audits: any[], assigns: any[]): string {
    const row = (cols: any[]) =>
      `<tr>${cols.map((c) => `<td>${this.escapeHtml(c)}</td>`).join('')}</tr>`;

    const auditsTable = audits.length
      ? audits
          .map((a) =>
            row([
              a.client,
              a.branch_name,
              a.audit_type,
              a.due_date,
              `${a.days_overdue} days`,
            ]),
          )
          .join('')
      : '<tr><td colspan="5">No overdue audits > 30 days</td></tr>';

    const assignsTable = assigns.length
      ? assigns
          .map((a) =>
            row([
              a.client,
              a.assignment_type,
              a.due_date,
              `${a.days_past_due} days`,
            ]),
          )
          .join('')
      : '<tr><td colspan="4">No assignments past due</td></tr>';

    return `
      <h2>Daily Critical Alerts</h2>

      <h3>Overdue Audits (>30 days)</h3>
      <table border="1" cellpadding="6">
        <tr><th>Client</th><th>Branch</th><th>Type</th><th>Due Date</th><th>Days Overdue</th></tr>
        ${auditsTable}
      </table>

      <h3>Assignments Past Due</h3>
      <table border="1" cellpadding="6">
        <tr><th>Client</th><th>Type</th><th>Due Date</th><th>Days Past Due</th></tr>
        ${assignsTable}
      </table>

      <p>— Statco System</p>
    `;
  }

  private escapeHtml(value: any): string {
    const safe = value === null || value === undefined ? '-' : String(value);
    return safe.replace(/[&<>"]/g, (char) => {
      switch (char) {
        case '&':
          return '&amp;';
        case '<':
          return '&lt;';
        case '>':
          return '&gt;';
        case '"':
          return '&quot;';
        default:
          return char;
      }
    });
  }
}
