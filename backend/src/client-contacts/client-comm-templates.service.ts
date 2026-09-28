import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ClientCommTemplateEntity,
  ClientCommType,
  CLIENT_COMM_TYPES,
} from './client-comm-template.entity';

export interface TemplatePlaceholders {
  clientName: string;
  monthLabel: string;
  deadlineLabel: string;
  portalUrl: string;
  newsDigest?: string;
  brandLogoUrl?: string;
}

export interface ResolvedTemplate {
  subject: string;
  body: string;
  source: 'DB' | 'DEFAULT';
}

const DEFAULT_PAYROLL_SUBJECT =
  'Payroll Inputs Required — {{clientName}} — {{monthLabel}}';

const DEFAULT_PAYROLL_BODY = `
      <p>Dear Payroll Team,</p>
      <p>
        Greetings from <strong>StatCo Solutions</strong>. As part of our payroll
        processing schedule for <strong>{{clientName}}</strong>,
        we request you to share the following payroll inputs for the
        completed month of <strong>{{monthLabel}}</strong>:
      </p>
      <ul>
        <li>New joiners / exits with effective dates</li>
        <li>Attendance &amp; leave summary (LWP, OT, holidays)</li>
        <li>Variable / incentive payouts</li>
        <li>Statutory or salary structure changes (if any)</li>
        <li>Reimbursement &amp; one-time payment claims</li>
        <li>Bank account / KYC updates</li>
      </ul>
      <p>
        Please share the inputs by
        <strong>{{deadlineLabel}}</strong> via our portal so
        that payroll can be processed and disbursed on time.
      </p>
      <p>
        <a href="{{portalUrl}}"
           style="background:#1a73e8;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;display:inline-block">
          Open Payroll Portal
        </a>
      </p>
      <p style="color:#555;font-size:13px;margin-top:18px">
        If you have already shared the inputs, please ignore this email. For
        any clarifications, reply to this mail or contact your payroll SPOC.
      </p>
      <p>Regards,<br/>Payroll Desk &mdash; StatCo Solutions</p>
    `;

const DEFAULT_MCD_SUBJECT =
  'MCD Data Submission — {{clientName}} — {{monthLabel}}';

const DEFAULT_MCD_BODY = `
      <p>Dear Contractor,</p>
      <p>
        This is a reminder to upload the <strong>Monthly Contractor Data
        (MCD)</strong> for your engagement with
        <strong>{{clientName}}</strong> for the completed
        month of <strong>{{monthLabel}}</strong>.
      </p>
      <p>Please ensure the following are uploaded:</p>
      <ul>
        <li>Wage register &amp; muster roll</li>
        <li>PF / ESI / PT challans &amp; ECR returns</li>
        <li>Bank salary disbursement statement</li>
        <li>Any other statutory registers / proofs as applicable</li>
      </ul>
      <p>
        Kindly complete the upload by
        <strong>{{deadlineLabel}}</strong>.
      </p>
      <p>
        <a href="{{portalUrl}}"
           style="background:#1a73e8;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;display:inline-block">
          Upload MCD Data
        </a>
      </p>
      <p style="color:#555;font-size:13px;margin-top:18px">
        Late or incomplete submissions may attract compliance non-conformities.
        For any clarifications please reach out to the contractor-compliance
        team in CC.
      </p>
      <p>Regards,<br/>Contractor Compliance &mdash; StatCo Solutions</p>
    `;

const DEFAULT_WEEKLY_COMPLIANCE_NEWS_SUBJECT =
  'Weekly Compliance News - {{clientName}} - {{monthLabel}}';

const DEFAULT_WEEKLY_COMPLIANCE_NEWS_BODY = `
      <div style="border-radius:20px;overflow:hidden;border:1px solid #dbeafe;background:#f8fafc">
        <div style="background:#0a1f44;padding:22px 24px;color:#fff">
          <img src="{{brandLogoUrl}}" alt="StatCo Solutions" style="height:42px;max-width:180px;display:block;margin-bottom:18px" />
          <div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#7dd3fc;font-weight:700">Weekly Compliance News</div>
          <div style="font-size:26px;line-height:1.2;font-weight:800;margin-top:6px">{{clientName}}</div>
          <div style="font-size:14px;color:#cbd5e1;margin-top:8px">{{monthLabel}}</div>
        </div>

        <div style="padding:22px 24px">
          <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;padding:16px 18px;margin-bottom:18px">
            <div style="font-size:15px;color:#0f172a;line-height:1.6">
              Dear Compliance Team,<br/>
              Here is your weekly statutory update covering labour law, minimum wages, EPF/ESI, FSSAI and other official compliance portal changes.
            </div>
          </div>

          {{newsDigest}}

          <div style="text-align:center;margin:24px 0 12px">
            <a href="{{portalUrl}}"
               style="background:#0a1f44;color:#fff;padding:12px 22px;border-radius:999px;text-decoration:none;display:inline-block;font-weight:700">
              Open Client News
            </a>
          </div>

          <div style="font-size:12px;color:#64748b;line-height:1.6;text-align:center;margin-top:16px">
            This is a compliance awareness digest. Please verify applicability based on establishment type, state, scheduled employment, registrations and official notifications.
          </div>
        </div>
      </div>
    `;

export const DEFAULT_TEMPLATES: Record<
  ClientCommType,
  { subject: string; body: string }
> = {
  PAYROLL_INPUT_REQUEST: {
    subject: DEFAULT_PAYROLL_SUBJECT,
    body: DEFAULT_PAYROLL_BODY,
  },
  MCD_REQUEST: {
    subject: DEFAULT_MCD_SUBJECT,
    body: DEFAULT_MCD_BODY,
  },
  WEEKLY_COMPLIANCE_NEWS: {
    subject: DEFAULT_WEEKLY_COMPLIANCE_NEWS_SUBJECT,
    body: DEFAULT_WEEKLY_COMPLIANCE_NEWS_BODY,
  },
};

export const TEMPLATE_PLACEHOLDERS = [
  '{{clientName}}',
  '{{monthLabel}}',
  '{{deadlineLabel}}',
  '{{portalUrl}}',
  '{{newsDigest}}',
  '{{brandLogoUrl}}',
];

@Injectable()
export class ClientCommTemplatesService {
  constructor(
    @InjectRepository(ClientCommTemplateEntity)
    private readonly repo: Repository<ClientCommTemplateEntity>,
  ) {}

  /** List all templates with their effective values (DB or default). */
  async listAll() {
    const rows = await this.repo.find();
    const byType = new Map(rows.map((r) => [r.commType, r]));
    return CLIENT_COMM_TYPES.map((t) => {
      const row = byType.get(t);
      const def = DEFAULT_TEMPLATES[t];
      return {
        commType: t,
        subjectTemplate: row?.subjectTemplate ?? def.subject,
        bodyTemplate: row?.bodyTemplate ?? def.body,
        defaultSubject: def.subject,
        defaultBody: def.body,
        isCustom: !!row,
        updatedAt: row?.updatedAt ?? null,
        updatedBy: row?.updatedBy ?? null,
        placeholders: TEMPLATE_PLACEHOLDERS,
      };
    });
  }

  async upsert(
    commType: ClientCommType,
    subjectTemplate: string,
    bodyTemplate: string,
    userId?: string,
  ) {
    if (!CLIENT_COMM_TYPES.includes(commType)) {
      throw new NotFoundException(`Unknown comm_type: ${commType}`);
    }
    let row = await this.repo.findOne({ where: { commType } });
    if (!row) row = this.repo.create({ commType });
    row.subjectTemplate = subjectTemplate;
    row.bodyTemplate = bodyTemplate;
    row.updatedBy = userId || null;
    return this.repo.save(row);
  }

  /** Reset a template to the in-code default (deletes the DB row). */
  async resetToDefault(commType: ClientCommType) {
    await this.repo.delete({ commType });
    return { ok: true };
  }

  /** Resolve effective template (DB or default) and substitute placeholders. */
  async resolve(
    commType: ClientCommType,
    vars: TemplatePlaceholders,
  ): Promise<ResolvedTemplate> {
    const row = await this.repo.findOne({ where: { commType } });
    const def = DEFAULT_TEMPLATES[commType];
    const subjectTpl = row?.subjectTemplate ?? def.subject;
    const bodyTpl = row?.bodyTemplate ?? def.body;
    return {
      subject: this.render(subjectTpl, vars),
      body: this.render(bodyTpl, vars),
      source: row ? 'DB' : 'DEFAULT',
    };
  }

  private render(tpl: string, vars: TemplatePlaceholders): string {
    return tpl
      .replace(/\{\{\s*clientName\s*\}\}/g, this.escape(vars.clientName))
      .replace(/\{\{\s*monthLabel\s*\}\}/g, this.escape(vars.monthLabel))
      .replace(/\{\{\s*deadlineLabel\s*\}\}/g, this.escape(vars.deadlineLabel))
      .replace(/\{\{\s*portalUrl\s*\}\}/g, vars.portalUrl)
      .replace(/\{\{\s*newsDigest\s*\}\}/g, vars.newsDigest || '')
      .replace(/\{\{\s*brandLogoUrl\s*\}\}/g, vars.brandLogoUrl || '');
  }

  private escape(s: string): string {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}
