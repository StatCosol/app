import { Injectable, Logger } from '@nestjs/common';
import { EmailService } from './email.service';

/**
 * Notification helper for document rejection events.
 *
 *  - sendMcdRejection:    CRM rejected a monthly compliance document.
 *                         Recipient is the contractor / branch user who uploaded it.
 *                         Email body: Document, Month, CRM Remarks, Correction Required, Due Date.
 *
 *  - sendAuditRejection:  Auditor marked an audit document as NON_COMPLIED.
 *                         Recipient is the contractor; the assigned auditor (and any
 *                         additional reviewers) is automatically Cc'd so they have a
 *                         live record of every NC raised.
 *                         Email body: Non-Compliance, Applicable Law, Impact, Solution.
 *
 * All sends are best-effort; callers MUST wrap them so a mail failure never
 * breaks the underlying review transaction.
 */
@Injectable()
export class RejectionMailService {
  private readonly log = new Logger(RejectionMailService.name);

  constructor(private readonly emailService: EmailService) {}

  // ─── 1. MCD (CRM-side) rejection ────────────────────────────────
  async sendMcdRejection(params: {
    to: string | string[];
    cc?: string | string[];
    docName: string;
    month?: string | null;
    branchName?: string | null;
    crmRemarks?: string | null;
    correctionRequired?: string | null;
    dueDate?: string | null;
  }): Promise<void> {
    const recipients = this.normalize(params.to);
    const ccList = this.normalize(params.cc);
    if (!recipients.length) {
      this.log.warn(`MCD rejection: no recipient (doc=${params.docName})`);
      return;
    }

    const subject = `Document rejected: ${params.docName}`;
    const bodyHtml = `
      <p>Your monthly compliance document was reviewed by CRM and requires correction.</p>
      <table style="border-collapse:collapse;width:100%;max-width:560px">
        <tr><td style="padding:6px 12px;font-weight:bold">Document</td><td style="padding:6px 12px">${escape(params.docName)}</td></tr>
        ${row('Month', params.month)}
        ${row('Branch', params.branchName)}
        ${row('CRM Remarks', params.crmRemarks)}
        ${row('Correction Required', params.correctionRequired)}
        ${row('Due Date', params.dueDate)}
      </table>
      <p>Please re-upload the corrected document before the due date.</p>
    `;

    try {
      await this.emailService.send(
        recipients,
        subject,
        subject,
        bodyHtml,
        undefined,
        ccList.length ? { cc: ccList } : undefined,
      );
    } catch (e: any) {
      this.log.warn(`MCD rejection mail failed: ${e?.message || e}`);
    }
  }

  // ─── 2. Audit (Auditor-side) rejection / NC ────────────────────
  async sendAuditRejection(params: {
    to: string | string[];
    cc?: string | string[];
    docName: string;
    branchName?: string | null;
    auditPeriod?: string | null;
    nonCompliance?: string | null;
    applicableLaw?: string | null;
    impact?: string | null;
    solution?: string | null;
  }): Promise<void> {
    const recipients = this.normalize(params.to);
    const ccList = this.normalize(params.cc);
    if (!recipients.length) {
      this.log.warn(`Audit rejection: no recipient (doc=${params.docName})`);
      return;
    }

    const subject = `Non-compliance raised: ${params.docName}`;
    const bodyHtml = `
      <p>The auditor reviewed your audit document and raised a non-compliance.</p>
      <table style="border-collapse:collapse;width:100%;max-width:600px">
        <tr><td style="padding:6px 12px;font-weight:bold">Document</td><td style="padding:6px 12px">${escape(params.docName)}</td></tr>
        ${row('Branch', params.branchName)}
        ${row('Audit Period', params.auditPeriod)}
        ${row('Non-Compliance', params.nonCompliance)}
        ${row('Applicable Law', params.applicableLaw)}
        ${row('Impact', params.impact)}
        ${row('Solution / Correction', params.solution)}
      </table>
      <p>Please address the correction and re-upload the document. The auditor will re-verify after submission.</p>
    `;

    try {
      await this.emailService.sendAuditMail(
        recipients,
        subject,
        subject,
        bodyHtml,
        ccList.length ? { cc: ccList } : undefined,
      );
    } catch (e: any) {
      this.log.warn(`Audit rejection mail failed: ${e?.message || e}`);
    }
  }

  // ─── helpers ───────────────────────────────────────────────────
  private normalize(to: string | string[] | undefined | null): string[] {
    if (!to) return [];
    const arr = Array.isArray(to) ? to : [to];
    return arr.map((s) => String(s || '').trim()).filter((s) => !!s);
  }
}

function escape(s: string | null | undefined): string {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function row(label: string, value: string | null | undefined): string {
  if (value == null || value === '') return '';
  return `<tr><td style="padding:6px 12px;font-weight:bold">${escape(label)}</td><td style="padding:6px 12px">${escape(value)}</td></tr>`;
}
