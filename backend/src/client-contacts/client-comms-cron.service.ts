import { ClientCommPolicyService } from './client-comm-policy.service';
import { CronLockService } from '../common/services/cron-lock.service';
import { operationalDate } from '../common/operational-date';
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { createHash } from 'crypto';
import { EmailService } from '../email/email.service';
import { ClientContactsService } from './client-contacts.service';
import { ClientCommTemplatesService } from './client-comm-templates.service';
import { portalUrl } from '../common/utils/portal-url';

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

interface NewsDigestItem {
  id: string;
  title: string;
  body: string;
  category: string;
  createdAt: Date;
}

interface MinimumWageRevisionItem {
  stateCode: string;
  skillCategory: string;
  scheduledEmployment: string | null;
  monthlyWage: number;
  dailyWage: number | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  source: string | null;
}

interface ComplianceNewsSource {
  code: string;
  label: string;
  url: string;
}

const COMPLIANCE_NEWS_SOURCES: ComplianceNewsSource[] = [
  {
    code: 'CENTRAL_LABOUR',
    label: 'Ministry of Labour & Employment',
    url: 'https://www.labour.gov.in/documents/press-release?page=1',
  },
  {
    code: 'EPFO',
    label: 'Employees Provident Fund Organisation',
    url: 'https://www.epfindia.gov.in/site_en/WhatsNew.php',
  },
  {
    code: 'ESIC',
    label: 'Employees State Insurance Corporation',
    url: 'https://www.esic.gov.in/circulars',
  },
  {
    code: 'FSSAI_NOTIFICATIONS',
    label: 'FSSAI Notifications',
    url: 'https://fssai.gov.in/food-law/notifications',
  },
  {
    code: 'FSSAI_ADVISORIES',
    label: 'FSSAI Advisories and Orders',
    url: 'https://fssai.gov.in/food-law/advisories',
  },
  {
    code: 'AP_LABOUR',
    label: 'Andhra Pradesh Labour',
    url: 'https://labour.ap.gov.in/',
  },
  {
    code: 'AR_LABOUR',
    label: 'Arunachal Pradesh Labour',
    url: 'https://labour.arunachal.gov.in/',
  },
  {
    code: 'AS_LABOUR',
    label: 'Assam Labour',
    url: 'https://labour.assam.gov.in/',
  },
  {
    code: 'BR_LABOUR',
    label: 'Bihar Labour',
    url: 'https://state.bihar.gov.in/labour/',
  },
  {
    code: 'CG_LABOUR',
    label: 'Chhattisgarh Labour',
    url: 'https://cglabour.nic.in/',
  },
  { code: 'GA_LABOUR', label: 'Goa Labour', url: 'https://labour.goa.gov.in/' },
  {
    code: 'GJ_LABOUR',
    label: 'Gujarat Labour',
    url: 'https://labour.gujarat.gov.in/',
  },
  {
    code: 'HR_LABOUR',
    label: 'Haryana Labour',
    url: 'https://hrylabour.gov.in/',
  },
  {
    code: 'HP_LABOUR',
    label: 'Himachal Pradesh Labour',
    url: 'https://labour.hp.gov.in/',
  },
  {
    code: 'JH_LABOUR',
    label: 'Jharkhand Labour',
    url: 'https://shramadhan.jharkhand.gov.in/',
  },
  {
    code: 'KA_LABOUR',
    label: 'Karnataka Labour',
    url: 'https://labour.karnataka.gov.in/',
  },
  {
    code: 'KL_LABOUR',
    label: 'Kerala Labour',
    url: 'https://lc.kerala.gov.in/',
  },
  {
    code: 'MP_LABOUR',
    label: 'Madhya Pradesh Labour',
    url: 'https://labour.mp.gov.in/',
  },
  {
    code: 'MH_LABOUR',
    label: 'Maharashtra Labour',
    url: 'https://labour.maharashtra.gov.in/',
  },
  {
    code: 'MN_LABOUR',
    label: 'Manipur Labour',
    url: 'https://labour.mn.gov.in/',
  },
  {
    code: 'ML_LABOUR',
    label: 'Meghalaya Labour',
    url: 'https://meglabour.gov.in/',
  },
  {
    code: 'MZ_LABOUR',
    label: 'Mizoram Labour',
    url: 'https://lesde.mizoram.gov.in/',
  },
  {
    code: 'NL_LABOUR',
    label: 'Nagaland Labour',
    url: 'https://labour.nagaland.gov.in/',
  },
  {
    code: 'OD_LABOUR',
    label: 'Odisha Labour',
    url: 'https://labour.odisha.gov.in/',
  },
  {
    code: 'PB_LABOUR',
    label: 'Punjab Labour',
    url: 'https://pblabour.gov.in/',
  },
  {
    code: 'RJ_LABOUR',
    label: 'Rajasthan Labour',
    url: 'https://labour.rajasthan.gov.in/',
  },
  {
    code: 'SK_LABOUR',
    label: 'Sikkim Labour',
    url: 'https://labour.sikkim.gov.in/',
  },
  {
    code: 'TN_LABOUR',
    label: 'Tamil Nadu Labour',
    url: 'https://labour.tn.gov.in/',
  },
  {
    code: 'TS_LABOUR',
    label: 'Telangana Labour',
    url: 'https://labour.telangana.gov.in/',
  },
  {
    code: 'TR_LABOUR',
    label: 'Tripura Labour',
    url: 'https://labour.tripura.gov.in/',
  },
  {
    code: 'UP_LABOUR',
    label: 'Uttar Pradesh Labour',
    url: 'https://uplabour.gov.in/',
  },
  {
    code: 'UK_LABOUR',
    label: 'Uttarakhand Labour',
    url: 'https://labour.uk.gov.in/',
  },
  {
    code: 'WB_LABOUR',
    label: 'West Bengal Labour',
    url: 'https://wblc.gov.in/',
  },
  {
    code: 'AN_LABOUR',
    label: 'Andaman and Nicobar Labour',
    url: 'https://labour.and.nic.in/',
  },
  {
    code: 'CH_LABOUR',
    label: 'Chandigarh Labour',
    url: 'https://labour.chd.gov.in/',
  },
  {
    code: 'DNHDD_LABOUR',
    label: 'Dadra and Nagar Haveli and Daman and Diu Labour',
    url: 'https://labourddd.gov.in/',
  },
  {
    code: 'DL_LABOUR',
    label: 'Delhi Labour',
    url: 'https://labour.delhi.gov.in/',
  },
  {
    code: 'JK_LABOUR',
    label: 'Jammu and Kashmir Labour',
    url: 'https://jklabour.com/',
  },
  {
    code: 'LA_LABOUR',
    label: 'Ladakh Labour',
    url: 'https://labour.ladakh.gov.in/',
  },
  {
    code: 'LD_LABOUR',
    label: 'Lakshadweep Labour',
    url: 'https://lakshadweep.gov.in/departments/labour-employment/',
  },
  {
    code: 'PY_LABOUR',
    label: 'Puducherry Labour',
    url: 'https://labour.py.gov.in/',
  },
];

@Injectable()
export class ClientCommsCronService {
  private readonly log = new Logger(ClientCommsCronService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly contacts: ClientContactsService,
    private readonly email: EmailService,
    private readonly templates: ClientCommTemplatesService,
    private readonly policies: ClientCommPolicyService,
    private readonly locks: CronLockService,
  ) {}

  // -----------------------------------------------------------------------
  // Daily at 09:00 IST, on each client's configured day (default 1st), ask payroll to
  // share payroll inputs for the month.
  // -----------------------------------------------------------------------
  @Cron('0 0 9 * * *', { timeZone: 'Asia/Kolkata' })
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
  // Daily at 09:05 IST, on each client's configured day (default 16th), ask contractor users
  // (CC: contractor-compliance dept contacts) to upload MCD data.
  // -----------------------------------------------------------------------
  @Cron('0 5 9 * * *', { timeZone: 'Asia/Kolkata' })
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

  // -----------------------------------------------------------------------
  // Every Monday at 09:00 IST, send the latest active compliance news to all
  // active client contacts/users. The source monitor runs first so fresh
  // government notices can be included in the same weekly digest.
  // -----------------------------------------------------------------------
  @Cron('0 0 9 * * 1', { timeZone: 'Asia/Kolkata' })
  async cronWeeklyComplianceNews() {
    try {
      const r = await this.runWeeklyComplianceNews({ triggeredBy: 'CRON' });
      this.log.log(
        `[weekly-compliance-news] cron complete sent=${r.summary.sent} skipped=${r.summary.skipped} failed=${r.summary.failed}`,
      );
    } catch (e) {
      this.log.error(
        `[weekly-compliance-news] cron error: ${(e as Error).message}`,
      );
    }
  }

  @Cron('0 0 6 * * *', { timeZone: 'Asia/Kolkata' })
  async cronPublishAutomatedComplianceNews() {
    await this.publishAutomatedComplianceNews();
  }

  // =======================================================================
  // PAYROLL INPUT REQUEST
  // =======================================================================
  async runPayrollInputRequest(opts: RunOptions) {
    return (
      (await this.locks.runExclusive('client-comms:PAYROLL_INPUT_REQUEST', () =>
        this.runPayrollInputRequestLocked(opts),
      )) ?? this.buildSummary([])
    );
  }
  private async runPayrollInputRequestLocked(opts: RunOptions) {
    // We collect inputs for the *previous* (completed) month.
    // e.g. cron on 1-May → request April inputs.
    const runDateMonth = this.firstOfMonth(opts.runMonth || new Date());
    const month = this.addMonths(runDateMonth, -1);
    const monthLabel = this.monthLabel(month);
    const portalUrl = this.portalUrl(
      '/client/payroll?month=' + this.toMonthKey(month),
    );

    const clients = await this.eligiblePayrollClients(opts.onlyClientId);
    const results: RunResultEntry[] = [];
    for (const c of clients) {
      const policy = await this.policies.get(c.id, 'PAYROLL_INPUT_REQUEST');
      const runDay = Number(
        operationalDate(opts.runMonth || new Date()).slice(8),
      );
      if (!policy.enabled || (!opts.manual && policy.requestDay !== runDay)) {
        results.push({
          clientId: c.id,
          clientName: c.name,
          status: 'SKIPPED',
          reason: !policy.enabled
            ? 'Disabled for this client'
            : 'Not the configured request day',
        });
        continue;
      }
      const deadline = this.addDays(runDateMonth, policy.deadlineDay - 1);
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
    return (
      (await this.locks.runExclusive('client-comms:MCD_REQUEST', () =>
        this.runMcdDataRequestLocked(opts),
      )) ?? this.buildSummary([])
    );
  }
  private async runMcdDataRequestLocked(opts: RunOptions) {
    // We request MCD data for the *previous* (completed) month.
    // e.g. cron on 16-May → request April MCD data.
    const runDateMonth = this.firstOfMonth(opts.runMonth || new Date());
    const month = this.addMonths(runDateMonth, -1);
    const monthLabel = this.monthLabel(month);
    const portalUrl = this.portalUrl(
      '/contractor/tasks?month=' + this.toMonthKey(month),
    );

    const clients = await this.eligibleContractorClients(opts.onlyClientId);
    const results: RunResultEntry[] = [];
    for (const c of clients) {
      const policy = await this.policies.get(c.id, 'MCD_REQUEST');
      const runDay = Number(
        operationalDate(opts.runMonth || new Date()).slice(8),
      );
      if (!policy.enabled || (!opts.manual && policy.requestDay !== runDay)) {
        results.push({
          clientId: c.id,
          clientName: c.name,
          status: 'SKIPPED',
          reason: !policy.enabled
            ? 'Disabled for this client'
            : 'Not the configured request day',
        });
        continue;
      }
      const deadline = this.addDays(runDateMonth, policy.deadlineDay - 1);
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
  // WEEKLY COMPLIANCE NEWS
  // =======================================================================
  async runWeeklyComplianceNews(opts: RunOptions) {
    return (
      (await this.locks.runExclusive(
        'client-comms:WEEKLY_COMPLIANCE_NEWS',
        () => this.runWeeklyComplianceNewsLocked(opts),
      )) ?? this.buildSummary([])
    );
  }

  private async runWeeklyComplianceNewsLocked(opts: RunOptions) {
    await this.publishAutomatedComplianceNews();
    const runWeek = this.startOfWeek(opts.runMonth || new Date());
    const weekLabel = `Week of ${this.dateLabel(runWeek)}`;
    const portalUrl = this.portalUrl('/client/news');
    const news = await this.latestComplianceNews(runWeek);
    const minimumWages = await this.latestMinimumWageRevisions(runWeek);
    const results: RunResultEntry[] = [];

    if (!news.length && !minimumWages.length) {
      this.log.warn(
        '[weekly-compliance-news] skipped: no active news or minimum-wage revisions found',
      );
      return this.buildSummary(results);
    }

    const clients = await this.eligibleActiveClients(opts.onlyClientId);
    for (const c of clients) {
      const recipients = await this.complianceNewsRecipients(c);
      if (!recipients.length) {
        await this.recordRun({
          clientId: c.id,
          commType: 'WEEKLY_COMPLIANCE_NEWS',
          runMonth: runWeek,
          recipients: [],
          status: 'SKIPPED',
          failureReason:
            'No active COMPLIANCE contacts, primary contact, or client users configured',
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
          'WEEKLY_COMPLIANCE_NEWS',
          runWeek,
        );
        if (already) {
          results.push({
            clientId: c.id,
            clientName: c.name,
            status: 'SKIPPED',
            reason: 'Already sent this week',
          });
          continue;
        }
      }

      const tpl = await this.templates.resolve('WEEKLY_COMPLIANCE_NEWS', {
        clientName: c.name,
        monthLabel: weekLabel,
        deadlineLabel: '',
        portalUrl,
        newsDigest: [
          this.renderNewsDigest(news),
          this.renderMinimumWageDigest(minimumWages),
        ]
          .filter((section) => !!section)
          .join(''),
        brandLogoUrl: this.portalUrl(
          '/assets/images/statco-wordmark-white.png',
        ),
      });

      const send = await this.email.sendAuditMail(
        recipients,
        tpl.subject,
        'Weekly Compliance News',
        tpl.body,
      );
      const ok = (send as { ok?: boolean }).ok !== false;
      await this.recordRun({
        clientId: c.id,
        commType: 'WEEKLY_COMPLIANCE_NEWS',
        runMonth: runWeek,
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
  // Helpers
  // =======================================================================
  private async eligibleActiveClients(
    onlyClientId?: string,
  ): Promise<Array<{ id: string; name: string; email?: string | null }>> {
    const params: unknown[] = [];
    let extra = '';
    if (onlyClientId) {
      params.push(onlyClientId);
      extra = ' AND c.id = $1';
    }
    return this.ds.query(
      `SELECT c.id, c.client_name AS name, c.primary_contact_email AS email
       FROM clients c
       WHERE c.is_active = TRUE
         AND COALESCE(c.is_deleted, FALSE) = FALSE${extra}
       ORDER BY c.client_name ASC`,
      params,
    );
  }

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

  private async complianceNewsRecipients(client: {
    id: string;
    email?: string | null;
  }): Promise<string[]> {
    const contactEmails = await this.contacts.getActiveEmails(
      client.id,
      'COMPLIANCE',
    );
    const userRows: Array<{ email: string | null }> = await this.ds.query(
      `SELECT DISTINCT LOWER(u.email) AS email
       FROM users u
       WHERE u.client_id = $1
         AND u.user_type IN ('MASTER', 'BRANCH')
         AND u.is_active = TRUE
         AND u.deleted_at IS NULL
         AND u.email IS NOT NULL
         AND u.email <> ''`,
      [client.id],
    );
    return this.uniqueEmails([
      ...contactEmails,
      client.email || '',
      ...userRows.map((r) => r.email || ''),
    ]);
  }

  private async latestComplianceNews(
    weekStart: Date,
  ): Promise<NewsDigestItem[]> {
    const fallbackFrom = this.addDays(weekStart, -30);
    const rows: Array<{
      id: string;
      title: string;
      body: string;
      category: string;
      created_at: Date;
    }> = await this.ds.query(
      `SELECT id, title, body, category, created_at
       FROM news_items
       WHERE is_active = TRUE
         AND deleted_at IS NULL
         AND (expires_at IS NULL OR expires_at >= NOW())
         AND (
           category = 'COMPLIANCE'
           OR title ILIKE '%labour%'
           OR title ILIKE '%labor%'
           OR title ILIKE '%minimum wage%'
           OR title ILIKE '%FSSAI%'
           OR body ILIKE '%minimum wage%'
           OR body ILIKE '%FSSAI%'
         )
         AND (created_at >= $1 OR pinned = TRUE)
       ORDER BY pinned DESC, created_at DESC
       LIMIT 10`,
      [fallbackFrom],
    );
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      category: r.category,
      createdAt: r.created_at,
    }));
  }

  private async latestMinimumWageRevisions(
    weekStart: Date,
  ): Promise<MinimumWageRevisionItem[]> {
    const rows: Array<{
      state_code: string;
      skill_category: string;
      scheduled_employment: string | null;
      monthly_wage: string | number;
      daily_wage: string | number | null;
      effective_from: string;
      effective_to: string | null;
      source: string | null;
    }> = await this.ds.query(
      `SELECT state_code, skill_category, scheduled_employment, monthly_wage,
              daily_wage, effective_from, effective_to, source
       FROM minimum_wages
       WHERE effective_from >= ($1::date - INTERVAL '180 days')
         AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
       ORDER BY effective_from DESC, state_code ASC, skill_category ASC
       LIMIT 160`,
      [weekStart],
    );
    return rows.map((r) => ({
      stateCode: r.state_code,
      skillCategory: r.skill_category,
      scheduledEmployment: r.scheduled_employment,
      monthlyWage: Number(r.monthly_wage),
      dailyWage: r.daily_wage == null ? null : Number(r.daily_wage),
      effectiveFrom: r.effective_from,
      effectiveTo: r.effective_to,
      source: r.source,
    }));
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

  private async publishAutomatedComplianceNews(): Promise<void> {
    for (const source of COMPLIANCE_NEWS_SOURCES) {
      try {
        await this.publishSourceIfChanged(source);
      } catch (e) {
        this.log.warn(
          `[compliance-news-monitor] ${source.code} failed: ${(e as Error).message}`,
        );
      }
    }
  }

  private async publishSourceIfChanged(
    source: ComplianceNewsSource,
  ): Promise<void> {
    const text = await this.fetchSourceText(source.url);
    const hash = this.hashText(text);
    const matchedKeywords = this.isRelevantComplianceText(text);
    const rows: Array<{ last_hash: string | null }> = await this.ds.query(
      `SELECT last_hash FROM compliance_news_source_snapshots
       WHERE source_code = $1 LIMIT 1`,
      [source.code],
    );
    const previous = rows[0]?.last_hash || null;
    await this.saveSourceSnapshot(source, hash, matchedKeywords);
    if (!matchedKeywords || !previous || previous === hash) return;

    const title = `Compliance Portal Update: ${source.label}`;
    const body = [
      `An automated compliance monitor detected a new update on ${source.label}.`,
      '',
      'This source is monitored for labour law, minimum wages, wage revision, EPF, ESI, shops and establishments, factories, BOCW, contractor compliance, and FSSAI updates.',
      '',
      `Official source: ${source.url}`,
      `Detected revision: ${hash.slice(0, 16)}`,
      '',
      'Action: Review the official notification/order and update the applicable compliance or minimum-wage master before payroll/compliance closure.',
    ].join('\n');
    await this.createNewsIfMissing(title, body);
  }

  private async fetchSourceText(url: string): Promise<string> {
    const res = await fetch(url, {
      headers: {
        'user-agent': 'StatCo Compliance Monitor/1.0 (+https://statcosol.com)',
        accept: 'text/html,application/xhtml+xml,application/xml,text/plain',
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = await res.text();
    return raw
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120000);
  }

  private isRelevantComplianceText(text: string): boolean {
    return /\b(minimum wages?|wage revision|labou?r|epf|epfo|esi|esic|shops?|establishments?|factories|factory|bocw|contract(?:or)?|fssai|food safety|notification|circular|order)\b/i.test(
      text,
    );
  }

  private hashText(text: string): string {
    return createHash('sha256').update(text).digest('hex');
  }

  private async saveSourceSnapshot(
    source: ComplianceNewsSource,
    hash: string,
    matchedKeywords: boolean,
  ): Promise<void> {
    await this.ds.query(
      `INSERT INTO compliance_news_source_snapshots
         (source_code, source_label, source_url, last_hash, matched_keywords,
          last_checked_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       ON CONFLICT (source_code) DO UPDATE SET
         source_label = EXCLUDED.source_label,
         source_url = EXCLUDED.source_url,
         last_hash = EXCLUDED.last_hash,
         matched_keywords = EXCLUDED.matched_keywords,
         last_checked_at = NOW(),
         updated_at = NOW()`,
      [source.code, source.label, source.url, hash, matchedKeywords],
    );
  }

  private async createNewsIfMissing(
    title: string,
    body: string,
  ): Promise<void> {
    const userId = await this.systemNewsUserId();
    if (!userId) {
      this.log.warn(
        `[compliance-news-monitor] skipped publishing ${title}: no admin user found`,
      );
      return;
    }
    await this.ds.query(
      `INSERT INTO news_items
         (title, body, category, pinned, is_active, expires_at, created_by,
          created_at, updated_at)
       SELECT $1, $2, 'COMPLIANCE', TRUE, TRUE, NOW() + INTERVAL '45 days',
              $3, NOW(), NOW()
       WHERE NOT EXISTS (
         SELECT 1 FROM news_items
         WHERE title = $1
           AND body = $2
           AND deleted_at IS NULL
       )`,
      [title, body, userId],
    );
  }

  private async systemNewsUserId(): Promise<string | null> {
    const rows: Array<{ id: string }> = await this.ds.query(
      `SELECT u.id
       FROM users u
       LEFT JOIN roles r ON r.id = u.role_id
       WHERE u.deleted_at IS NULL
         AND (
           lower(u.email) IN ('admin@statcosol.com', 'it_admin@statcosol.com')
           OR r.code = 'ADMIN'
         )
       ORDER BY
         CASE
           WHEN lower(u.email) = 'admin@statcosol.com' THEN 0
           WHEN lower(u.email) = 'it_admin@statcosol.com' THEN 1
           WHEN r.code = 'ADMIN' THEN 2
           ELSE 3
         END,
         u.created_at ASC
       LIMIT 1`,
    );
    return rows[0]?.id || null;
  }

  private renderNewsDigest(items: NewsDigestItem[]): string {
    if (!items.length) return '';
    const rows = items
      .map((item) => {
        const url = this.portalUrl(`/client/news/${item.id}`);
        return `<div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:18px;padding:18px;margin-bottom:14px;box-shadow:0 10px 24px rgba(15,23,42,.06)">
          <div style="display:inline-block;background:#e0f2fe;color:#075985;border-radius:999px;padding:5px 10px;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;margin-bottom:10px">News Alert</div>
          <div style="font-size:18px;line-height:1.3;color:#0f172a;font-weight:800;margin-bottom:10px">${this.escapeHtml(
            item.title,
          )}</div>
          <div style="font-size:14px;line-height:1.6;color:#334155">${this.escapeHtml(
            this.compactBody(item.body),
          ).replace(/\n/g, '<br/>')}</div>
          <div style="margin-top:14px"><a href="${url}" style="color:#0a1f44;font-weight:800;text-decoration:none">Read in portal</a></div>
        </div>`;
      })
      .join('');
    return `<div style="margin:20px 0 8px">
      <div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#0284c7;font-weight:800;margin-bottom:8px">Official portal updates</div>
      <div style="font-size:22px;line-height:1.25;color:#0f172a;font-weight:900;margin-bottom:14px">Latest labour and regulatory news</div>
      ${rows}
    </div>`;
  }

  private renderMinimumWageDigest(items: MinimumWageRevisionItem[]): string {
    if (!items.length) return '';
    const rows = items
      .map((item) => {
        const schedule = item.scheduledEmployment
          ? ` / ${this.escapeHtml(item.scheduledEmployment)}`
          : ' / Default';
        const daily =
          item.dailyWage == null
            ? ''
            : `<div style="min-width:150px;background:#f8fafc;border-radius:14px;padding:12px"><div style="font-size:12px;color:#64748b;margin-bottom:2px">Daily wage</div><div style="font-size:16px;font-weight:800;color:#0f172a">Rs. ${this.formatAmount(item.dailyWage)}</div></div>`;
        const source = item.source
          ? `<div style="font-size:12px;color:#64748b;margin-top:12px">Source: ${this.escapeHtml(
              item.source,
            )}</div>`
          : '';
        return `<div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:18px;padding:16px;margin-bottom:12px;box-shadow:0 10px 24px rgba(15,23,42,.06)">
          <div style="display:inline-block;background:#dcfce7;color:#166534;border-radius:999px;padding:5px 10px;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;margin-bottom:10px">Minimum Wage</div>
          <div style="font-size:17px;line-height:1.3;color:#0f172a;font-weight:900;margin-bottom:12px">${this.escapeHtml(
            item.stateCode,
          )} - ${this.escapeHtml(item.skillCategory)}${schedule}</div>
          <div style="display:flex;gap:14px;flex-wrap:wrap">
            <div style="min-width:150px;background:#f8fafc;border-radius:14px;padding:12px">
              <div style="font-size:12px;color:#64748b;margin-bottom:2px">Monthly wage</div>
              <div style="font-size:18px;font-weight:900;color:#0f172a">Rs. ${this.formatAmount(
                item.monthlyWage,
              )}</div>
            </div>
            ${daily}
          </div>
          <div style="font-size:13px;color:#475569;margin-top:12px">Effective from <strong>${this.escapeHtml(item.effectiveFrom)}</strong>${
            item.effectiveTo
              ? ` to <strong>${this.escapeHtml(item.effectiveTo)}</strong>`
              : ''
          }</div>${source}
        </div>`;
      })
      .join('');
    return `<div style="margin:24px 0 8px">
      <div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#16a34a;font-weight:800;margin-bottom:8px">All India tracker</div>
      <div style="font-size:22px;line-height:1.25;color:#0f172a;font-weight:900;margin-bottom:8px">State-wise minimum wage revisions</div>
      <div style="font-size:13px;line-height:1.6;color:#475569;margin-bottom:14px">Latest active entries from the minimum-wage master. Verify applicability by state, skill category and scheduled employment.</div>
      ${rows}
    </div>`;
  }

  private compactBody(body: string): string {
    const text = String(body || '').trim();
    if (text.length <= 700) return text;
    return `${text.slice(0, 697).trim()}...`;
  }

  private escapeHtml(s: string): string {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private formatAmount(n: number): string {
    return Number(n || 0).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  // ---------------------------------------------------------------- utilities
  private firstOfMonth(d: Date): Date {
    const x = new Date(operationalDate(d).slice(0, 7) + '-01T00:00:00Z');
    return x;
  }
  private addDays(d: Date, days: number): Date {
    const x = new Date(d);
    x.setUTCDate(x.getUTCDate() + days);
    return x;
  }
  private addMonths(d: Date, months: number): Date {
    const x = new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1),
    );
    return x;
  }
  private monthLabel(d: Date): string {
    return d.toLocaleString('en-IN', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }
  private dateLabel(d: Date): string {
    return d.toLocaleDateString('en-IN', {
      timeZone: 'UTC',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }
  private toMonthKey(date: Date): string {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  private portalUrl(path: string): string {
    return portalUrl(path);
  }

  private startOfWeek(d: Date): Date {
    const x = new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
    );
    const day = x.getUTCDay();
    const diff = day === 0 ? -6 : 1 - day;
    x.setUTCDate(x.getUTCDate() + diff);
    return x;
  }

  private uniqueEmails(emails: string[]): string[] {
    return Array.from(
      new Set(
        emails.map((e) => (e || '').trim().toLowerCase()).filter((e) => !!e),
      ),
    );
  }
}
