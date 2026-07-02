import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { EmailService } from '../email/email.service';
import { ClientContactsService } from './client-contacts.service';
import { ClientCommTemplatesService } from './client-comm-templates.service';

export interface RunOptions {
  triggeredBy: string;
  manual?: boolean;
  /** Restrict to a single client (used by the manual trigger endpoint) */
  onlyClientId?: string;
  /** Override the run-month (defaults to current month). */
  runMonth?: Date;
}

export interface RunResultEntry {
  clientId: string;
  clientName: string;
  status: 'SENT' | 'SKIPPED' | 'FAILED';
  reason?: string;
  recipients?: string[];
  cc?: string[];
}

@Injectable()
export class ClientCommsCronService {
  private readonly log = new Logger(ClientCommsCronService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly contacts: ClientContactsService,
    private readonly email: EmailService,
    private readonly templates: ClientCommTemplatesService,
  ) {}

  // -----------------------------------------------------------------------
  // 1st of every month at 09:00 IST → ask payroll dept of each client to
  // share payroll inputs for the month.
  // -----------------------------------------------------------------------
  @Cron('0 0 9 1 * *', { timeZone: 'Asia/Kolkata' })
  async cronPayrollInputRequest() {
    try {
      const r = await this.runPayrollInputRequest({ triggeredBy: 'CRON' });
      this.log.log(
        `[payroll-input] cron complete sent=${r.summary.sent} skipped=${r.summary.skipped} failed=${r.summary.failed}`,
      );
    } catch (e) {
      this.log.error(`[payroll-input] cron error: ${(e as Error).message}`);
    }
  }

  // -----------------------------------------------------------------------
  // 16th of every month at 09:00 IST → ask each client's contractor users
  // (CC: contractor-compliance dept contacts) to upload MCD data.
  // -----------------------------------------------------------------------
  @Cron('0 0 9 16 * *', { timeZone: 'Asia/Kolkata' })
  async cronMcdDataRequest() {
    try {
      const r = await this.runMcdDataRequest({ triggeredBy: 'CRON' });
      this.log.log(
        `[mcd-request] cron complete sent=${r.summary.sent} skipped=${r.summary.skipped} failed=${r.summary.failed}`,
      );
    } catch (e) {
      this.log.error(`[mcd-request] cron error: ${(e as Error).message}`);
    }
  }

  // =======================================================================
  // PAYROLL INPUT REQUEST
  // =======================================================================
  async runPayrollInputRequest(opts: RunOptions) {
    // We collect inputs for the *previous* (completed) month.
    // e.g. cron on 1-May → request April inputs.
    const runDateMonth = this.firstOfMonth(opts.runMonth || new Date());
    const month = this.addMonths(runDateMonth, -1);
    const monthLabel = this.monthLabel(month);
    const deadline = this.addDays(runDateMonth, 6); // 7th of current (run) month
    const portalUrl = this.portalUrl('/client/payroll/inputs');

    const clients = await this.eligiblePayrollClients(opts.onlyClientId);
    const results: RunResultEntry[] = [];
    for (const c of clients) {
      const recipients = await this.contacts.getActiveEmails(c.id, 'PAYROLL');
      if (!recipients.length) {
        await this.recordRun({
          clientId: c.id,
          commType: 'PAYROLL_INPUT_REQUEST',
          runMonth: month,
          recipients: [],
          status: 'SKIPPED',
          failureReason: 'No active PAYROLL contacts configured',
          triggeredBy: opts.triggeredBy,
        });
        results.push({
          clientId: c.id,
          clientName: c.name,
          status: 'SKIPPED',
          reason: 'No PAYROLL contacts',
        });
        continue;
      }

      // Don't double-send unless this is a manual run
      if (!opts.manual) {
        const already = await this.alreadySentThisMonth(
          c.id,
          'PAYROLL_INPUT_REQUEST',
          month,
        );
        if (already) {
          results.push({
            clientId: c.id,
            clientName: c.name,
            status: 'SKIPPED',
            reason: 'Already sent this month',
          });
          continue;
        }
      }

      const tpl = await this.templates.resolve('PAYROLL_INPUT_REQUEST', {
        clientName: c.name,
        monthLabel,
        deadlineLabel: this.dateLabel(deadline),
        portalUrl,
      });
      const subject = tpl.subject;
      const title = `Payroll Inputs for ${monthLabel}`;
      const body = tpl.body;

      const send = await this.email.sendPayrollMail(
        recipients,
        subject,
        title,
        body,
      );
      const ok = (send as { ok?: boolean }).ok !== false;
      await this.recordRun({
        clientId: c.id,
        commType: 'PAYROLL_INPUT_REQUEST',
        runMonth: month,
        recipients,
        status: ok ? 'SENT' : 'FAILED',
        failureReason: ok
          ? null
          : (send as { error?: string }).error || 'Unknown send error',
        triggeredBy: opts.triggeredBy,
      });
      results.push({
        clientId: c.id,
        clientName: c.name,
        status: ok ? 'SENT' : 'FAILED',
        recipients,
        reason: ok ? undefined : (send as { error?: string }).error,
      });
    }

    return this.buildSummary(results);
  }

  // =======================================================================
  // MCD DATA REQUEST (to contractor users; CC contractor-compliance dept)
  // =======================================================================
  async runMcdDataRequest(opts: RunOptions) {
    // We request MCD data for the *previous* (completed) month.
    // e.g. cron on 16-May → request April MCD data.
    const runDateMonth = this.firstOfMonth(opts.runMonth || new Date());
    const month = this.addMonths(runDateMonth, -1);
    const monthLabel = this.monthLabel(month);
    const deadline = this.addDays(runDateMonth, 24); // 25th of current (run) month
    const portalUrl = this.portalUrl('/contractor/mcd/upload');

    const clients = await this.eligibleContractorClients(opts.onlyClientId);
    const results: RunResultEntry[] = [];
    for (const c of clients) {
      const contractorEmails = await this.activeContractorEmails(c.id);
      const ccEmails = await this.contacts.getActiveEmails(
        c.id,
        'CONTRACTOR_COMPLIANCE',
      );

      if (!contractorEmails.length && !ccEmails.length) {
        await this.recordRun({
          clientId: c.id,
          commType: 'MCD_REQUEST',
          runMonth: month,
          recipients: [],
          ccEmails: [],
          status: 'SKIPPED',
          failureReason:
            'No contractor users or contractor-compliance contacts',
          triggeredBy: opts.triggeredBy,
        });
        results.push({
          clientId: c.id,
          clientName: c.name,
          status: 'SKIPPED',
          reason: 'No recipients',
        });
        continue;
      }

      if (!opts.manual) {
        const already = await this.alreadySentThisMonth(
          c.id,
          'MCD_REQUEST',
          month,
        );
        if (already) {
          results.push({
            clientId: c.id,
            clientName: c.name,
            status: 'SKIPPED',
            reason: 'Already sent this month',
          });
          continue;
        }
      }

      // Send to contractors if any, else to CC list as primary recipient
      const to = contractorEmails.length ? contractorEmails : ccEmails;
      const cc = contractorEmails.length ? ccEmails : [];

      const tpl = await this.templates.resolve('MCD_REQUEST', {
        clientName: c.name,
        monthLabel,
        deadlineLabel: this.dateLabel(deadline),
        portalUrl,
      });
      const subject = tpl.subject;
      const title = `Monthly Contractor Data (MCD) for ${monthLabel}`;
      const body = tpl.body;

      const send = await this.email.sendAuditMail(to, subject, title, body, {
        cc: cc.length ? cc : undefined,
      });
      const ok = (send as { ok?: boolean }).ok !== false;
      await this.recordRun({
        clientId: c.id,
        commType: 'MCD_REQUEST',
        runMonth: month,
        recipients: to,
        ccEmails: cc,
        status: ok ? 'SENT' : 'FAILED',
        failureReason: ok
          ? null
          : (send as { error?: string }).error || 'Unknown send error',
        triggeredBy: opts.triggeredBy,
      });
      results.push({
        clientId: c.id,
        clientName: c.name,
        status: ok ? 'SENT' : 'FAILED',
        recipients: to,
        cc,
        reason: ok ? undefined : (send as { error?: string }).error,
      });
    }

    return this.buildSummary(results);
  }

  // =======================================================================
  // Helpers
  // =======================================================================
  private async eligiblePayrollClients(
    onlyClientId?: string,
  ): Promise<Array<{ id: string; name: string }>> {
    // Clients with at least one active employee
    const params: unknown[] = [];
    let where = `c.is_active = TRUE
      AND COALESCE(c.is_deleted, FALSE) = FALSE
      AND EXISTS (
        SELECT 1 FROM employees e
        WHERE e.client_id = c.id AND e.is_active = TRUE
      )`;
    if (onlyClientId) {
      params.push(onlyClientId);
      where = `c.id = $1 AND ${where}`;
    }
    return this.ds.query(
      `SELECT c.id, c.client_name AS name
       FROM clients c
       WHERE ${where}
       ORDER BY c.client_name ASC`,
      params,
    );
  }

  private async eligibleContractorClients(
    onlyClientId?: string,
  ): Promise<Array<{ id: string; name: string }>> {
    // Clients with either an active contractor user assignment OR
    // contractor compliance contacts configured.
    const params: unknown[] = [];
    let extra = '';
    if (onlyClientId) {
      params.push(onlyClientId);
      extra = ' AND c.id = $1';
    }
    return this.ds.query(
      `SELECT DISTINCT c.id, c.client_name AS name
       FROM clients c
       WHERE c.is_active = TRUE
         AND COALESCE(c.is_deleted, FALSE) = FALSE
         AND (
           EXISTS (
             SELECT 1 FROM users u
             WHERE u.client_id = c.id
               AND u.user_type = 'CONTRACTOR'
               AND u.is_active = TRUE
               AND u.deleted_at IS NULL
           )
           OR EXISTS (
             SELECT 1 FROM client_department_contacts cdc
             WHERE cdc.client_id = c.id
               AND cdc.department = 'CONTRACTOR_COMPLIANCE'
               AND cdc.is_active = TRUE
           )
         )${extra}
       ORDER BY c.client_name ASC`,
      params,
    );
  }

  private async activeContractorEmails(clientId: string): Promise<string[]> {
    const rows: Array<{ email: string | null }> = await this.ds.query(
      `SELECT DISTINCT LOWER(u.email) AS email
       FROM users u
       WHERE u.client_id = $1
         AND u.user_type = 'CONTRACTOR'
         AND u.is_active = TRUE
         AND u.deleted_at IS NULL
         AND u.email IS NOT NULL
         AND u.email <> ''`,
      [clientId],
    );
    return rows.map((r) => r.email || '').filter((e) => !!e);
  }

  private async alreadySentThisMonth(
    clientId: string,
    commType: string,
    runMonth: Date,
  ): Promise<boolean> {
    const rows = await this.ds.query(
      `SELECT 1 FROM client_monthly_comm_runs
       WHERE client_id = $1 AND comm_type = $2 AND run_month = $3
         AND status = 'SENT' LIMIT 1`,
      [clientId, commType, runMonth],
    );
    return rows.length > 0;
  }

  private async recordRun(args: {
    clientId: string;
    commType: string;
    runMonth: Date;
    recipients: string[];
    ccEmails?: string[];
    status: 'SENT' | 'SKIPPED' | 'FAILED';
    failureReason?: string | null;
    triggeredBy: string;
  }) {
    try {
      await this.ds.query(
        `INSERT INTO client_monthly_comm_runs
           (client_id, comm_type, run_month, recipients, cc_emails, status,
            failure_reason, triggered_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (client_id, comm_type, run_month) DO UPDATE SET
           recipients     = EXCLUDED.recipients,
           cc_emails      = EXCLUDED.cc_emails,
           status         = EXCLUDED.status,
           failure_reason = EXCLUDED.failure_reason,
           triggered_by   = EXCLUDED.triggered_by,
           sent_at        = NOW()`,
        [
          args.clientId,
          args.commType,
          args.runMonth,
          args.recipients.join(','),
          (args.ccEmails || []).join(',') || null,
          args.status,
          args.failureReason || null,
          args.triggeredBy,
        ],
      );
    } catch (e) {
      this.log.warn(
        `recordRun failed (client=${args.clientId}, type=${args.commType}): ${(e as Error).message}`,
      );
    }
  }

  private buildSummary(entries: RunResultEntry[]) {
    const summary = {
      total: entries.length,
      sent: entries.filter((e) => e.status === 'SENT').length,
      skipped: entries.filter((e) => e.status === 'SKIPPED').length,
      failed: entries.filter((e) => e.status === 'FAILED').length,
    };
    return { summary, entries };
  }

  // ---------------------------------------------------------------- utilities
  private firstOfMonth(d: Date): Date {
    const x = new Date(d.getFullYear(), d.getMonth(), 1);
    return x;
  }
  private addDays(d: Date, days: number): Date {
    const x = new Date(d);
    x.setDate(x.getDate() + days);
    return x;
  }
  private addMonths(d: Date, months: number): Date {
    const x = new Date(d.getFullYear(), d.getMonth() + months, 1);
    return x;
  }
  private monthLabel(d: Date): string {
    return d.toLocaleString('en-IN', { month: 'long', year: 'numeric' });
  }
  private dateLabel(d: Date): string {
    return d.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }
  private portalUrl(path: string): string {
    const base = (
      process.env.FRONTEND_URL ||
      process.env.PUBLIC_BASE_URL ||
      'https://statcompy.statcosol.com'
    ).replace(/\/$/, '');
    return `${base}${path.startsWith('/') ? path : `/${path}`}`;
  }
}
