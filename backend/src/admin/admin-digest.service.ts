import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { EmailService } from '../email/email.service';

type DigestType = 'WEEKLY' | 'CRITICAL';
type DigestRunStatus = 'SUCCESS' | 'FAILED' | 'SKIPPED';

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
      await this.sendDigest(null, 'SCHEDULED_WEEKLY');
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
      await this.sendCriticalAlerts(null, 'SCHEDULED_CRITICAL');
      this.logger.log('Daily critical alerts completed');
    } catch (err) {
      this.logger.error(
        'Daily critical alerts failed',
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  async getConfig() {
    const recipients = await this.getRecipients();
    return {
      schedules: [
        {
          digestType: 'WEEKLY',
          label: 'Weekly Digest',
          cron: '0 0 9 * * 1',
          timezone: 'Server timezone',
          description: 'Runs every Monday at 09:00',
        },
        {
          digestType: 'CRITICAL',
          label: 'Daily Critical Alerts',
          cron: '0 0 8 * * *',
          timezone: 'Server timezone',
          description: 'Runs daily at 08:00',
        },
      ],
      recipients,
    };
  }

  async getPreview() {
    const [weekly, critical, recipients] = await Promise.all([
      this.getWeeklyData(),
      this.getCriticalData(),
      this.getRecipients(),
    ]);

    return {
      recipientsCount: recipients.length,
      weekly: {
        overdueAuditsCount: weekly.overdueAudits.length,
        assignmentsDueCount: weekly.assignmentsDue.length,
        lowestComplianceCount: weekly.lowestCompliance.length,
        overdueAudits: weekly.overdueAudits.slice(0, 10),
        assignmentsDue: weekly.assignmentsDue.slice(0, 10),
        lowestCompliance: weekly.lowestCompliance.slice(0, 10),
      },
      critical: {
        overdueAudits30Count: critical.overdueAudits30.length,
        assignmentsPastDueCount: critical.assignmentsPastDue.length,
        overdueAudits30: critical.overdueAudits30.slice(0, 20),
        assignmentsPastDue: critical.assignmentsPastDue.slice(0, 20),
      },
    };
  }

  async getHistory(limit = 30) {
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 30));
    try {
      const rows = await this.ds.query(
        `
        SELECT
          id,
          digest_type AS "digestType",
          status,
          source,
          triggered_by AS "triggeredBy",
          recipients_count AS "recipientsCount",
          summary,
          error_message AS "errorMessage",
          created_at AS "createdAt"
        FROM admin_digest_runs
        ORDER BY created_at DESC
        LIMIT $1
        `,
        [safeLimit],
      );
      return { items: rows || [] };
    } catch (err) {
      this.logger.warn(`Digest history unavailable: ${String(err)}`);
      return { items: [] };
    }
  }

  async sendDigest(
    triggeredBy: string | null = null,
    source = 'MANUAL',
  ): Promise<{
    status: 'ok' | 'skipped';
    runId: number | null;
    recipientsCount: number;
  }> {
    this.logger.log('Starting admin weekly digest send');
    const recipients = await this.getRecipients();
    const to = recipients.map((u) => u.email).filter(Boolean);
    if (!to.length) {
      this.logger.warn('Skipping weekly digest: no admin recipients found');
      const run = await this.logRun(
        'WEEKLY',
        'SKIPPED',
        triggeredBy,
        0,
        { source, reason: 'NO_RECIPIENTS' },
        null,
      );
      return { status: 'skipped', runId: run?.id ?? null, recipientsCount: 0 };
    }

    try {
      const weekly = await this.getWeeklyData();
      const html = this.buildHtml(
        weekly.overdueAudits,
        weekly.assignmentsDue,
        weekly.lowestCompliance,
      );

      await this.email.send(
        to,
        'Statco Weekly Compliance Digest',
        'Weekly Compliance Digest',
        html,
      );

      const run = await this.logRun(
        'WEEKLY',
        'SUCCESS',
        triggeredBy,
        to.length,
        {
          source,
          overdueAuditsCount: weekly.overdueAudits.length,
          assignmentsDueCount: weekly.assignmentsDue.length,
          lowestComplianceCount: weekly.lowestCompliance.length,
        },
        null,
      );
      this.logger.log('Weekly digest email sent');
      return { status: 'ok', runId: run?.id ?? null, recipientsCount: to.length };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.logRun(
        'WEEKLY',
        'FAILED',
        triggeredBy,
        to.length,
        { source },
        msg,
      );
      throw err;
    }
  }

  async sendCriticalAlerts(
    triggeredBy: string | null = null,
    source = 'MANUAL',
  ): Promise<{
    status: 'ok' | 'skipped';
    runId: number | null;
    recipientsCount: number;
  }> {
    this.logger.log('Starting admin daily critical alerts send');
    const recipients = await this.getRecipients();
    const to = recipients.map((u) => u.email).filter(Boolean);
    if (!to.length) {
      this.logger.warn('Skipping critical alerts: no admin recipients found');
      const run = await this.logRun(
        'CRITICAL',
        'SKIPPED',
        triggeredBy,
        0,
        { source, reason: 'NO_RECIPIENTS' },
        null,
      );
      return { status: 'skipped', runId: run?.id ?? null, recipientsCount: 0 };
    }

    try {
      const critical = await this.getCriticalData();
      if (!critical.overdueAudits30.length && !critical.assignmentsPastDue.length) {
        const run = await this.logRun(
          'CRITICAL',
          'SKIPPED',
          triggeredBy,
          to.length,
          { source, reason: 'NO_CRITICAL_ALERTS' },
          null,
        );
        return { status: 'skipped', runId: run?.id ?? null, recipientsCount: to.length };
      }

      const html = this.buildCriticalHtml(
        critical.overdueAudits30,
        critical.assignmentsPastDue,
      );
      await this.email.send(
        to,
        'Statco Daily Critical Alerts',
        'Daily Critical Alerts',
        html,
      );
      const run = await this.logRun(
        'CRITICAL',
        'SUCCESS',
        triggeredBy,
        to.length,
        {
          source,
          overdueAudits30Count: critical.overdueAudits30.length,
          assignmentsPastDueCount: critical.assignmentsPastDue.length,
        },
        null,
      );
      this.logger.log('Critical alerts email sent');
      return { status: 'ok', runId: run?.id ?? null, recipientsCount: to.length };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.logRun(
        'CRITICAL',
        'FAILED',
        triggeredBy,
        to.length,
        { source },
        msg,
      );
      throw err;
    }
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

      <p>- Statco System</p>
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

      <p>- Statco System</p>
    `;
  }

  private async getRecipients(): Promise<Array<{ email: string; roleCode: string }>> {
    return this.ds.query(
      `
      SELECT u.email, r.code AS "roleCode"
      FROM users u
      JOIN roles r ON r.id = u.role_id
      WHERE r.code IN ('ADMIN','CCO')
        AND u.is_active = true
        AND u.deleted_at IS NULL
      ORDER BY r.code, u.email
      `,
    );
  }

  private async getWeeklyData(): Promise<{
    overdueAudits: any[];
    assignmentsDue: any[];
    lowestCompliance: any[];
  }> {
    const overdueAudits = await this.safeQuery(
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
      'weekly.overdueAudits',
    );

    const assignmentsDue = await this.safeQuery(
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
      'weekly.assignmentsDue',
    );

    const lowestCompliance = await this.safeQuery(
      `
      SELECT client_name, branch_name, compliance_percent
      FROM vw_compliance_coverage
      WHERE total_compliances > 0
      ORDER BY compliance_percent ASC
      LIMIT 5
      `,
      'weekly.lowestCompliance',
    );

    return { overdueAudits, assignmentsDue, lowestCompliance };
  }

  private async getCriticalData(): Promise<{
    overdueAudits30: any[];
    assignmentsPastDue: any[];
  }> {
    const overdueAudits30 = await this.safeQuery(
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
      'critical.overdueAudits30',
    );

    const assignmentsPastDue = await this.safeQuery(
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
      'critical.assignmentsPastDue',
    );

    return { overdueAudits30, assignmentsPastDue };
  }

  private async safeQuery(sql: string, tag: string): Promise<any[]> {
    try {
      return (await this.ds.query(sql)) || [];
    } catch (err) {
      this.logger.warn(`Digest query failed (${tag}): ${String(err)}`);
      return [];
    }
  }

  private async logRun(
    digestType: DigestType,
    status: DigestRunStatus,
    triggeredBy: string | null,
    recipientsCount: number,
    summary: Record<string, unknown> | null,
    errorMessage: string | null,
  ): Promise<{ id: number } | null> {
    try {
      const rows = await this.ds.query(
        `
        INSERT INTO admin_digest_runs
          (digest_type, status, source, triggered_by, recipients_count, summary, error_message)
        VALUES
          ($1, $2, $3, $4, $5, $6::jsonb, $7)
        RETURNING id
        `,
        [
          digestType,
          status,
          String(summary?.['source'] || 'UNKNOWN'),
          triggeredBy,
          recipientsCount,
          JSON.stringify(summary || {}),
          errorMessage,
        ],
      );
      return rows?.[0] || null;
    } catch (err) {
      this.logger.warn(`Unable to persist digest run: ${String(err)}`);
      return null;
    }
  }

  private escapeHtml(value: any): string {
    const safe = value === null || value === undefined ? '-' : String(value);
    return safe.replace(/[&<>"']/g, (char) => {
      switch (char) {
        case '&':
          return '&amp;';
        case '<':
          return '&lt;';
        case '>':
          return '&gt;';
        case '"':
          return '&quot;';
        case "'":
          return '&#39;';
        default:
          return char;
      }
    });
  }
}
