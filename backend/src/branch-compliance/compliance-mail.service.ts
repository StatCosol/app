import { Injectable, Logger } from '@nestjs/common';
import { EmailService } from '../email/email.service';

/**
 * Compliance mail service — sends compliance reminders via EmailService.
 * Falls back to logging when EMAIL_ENABLED=false.
 */
@Injectable()
export class ComplianceMailService {
  private readonly logger = new Logger(ComplianceMailService.name);

  constructor(private readonly emailService: EmailService) {}

  /**
   * Send a compliance reminder email.
   */
  async sendReminder(params: {
    to?: string;
    branchId: string;
    companyId: string;
    returnCode: string;
    returnName: string;
    frequency: string;
    dueDate: string;
    daysUntilDue: number;
    status: string;
  }): Promise<void> {
    const urgency = params.daysUntilDue <= 2 ? 'URGENT' : 'REMINDER';
    const subject = `[${urgency}] Compliance Document Due: ${params.returnName}`;
    const bodyHtml = `
      <p>This is a <strong>${urgency.toLowerCase()}</strong> reminder for the following compliance document:</p>
      <table style="border-collapse:collapse;width:100%;max-width:500px;">
        <tr><td style="padding:6px 12px;font-weight:bold;">Document</td><td style="padding:6px 12px;">${params.returnName} (${params.returnCode})</td></tr>
        <tr><td style="padding:6px 12px;font-weight:bold;">Frequency</td><td style="padding:6px 12px;">${params.frequency}</td></tr>
        <tr><td style="padding:6px 12px;font-weight:bold;">Due Date</td><td style="padding:6px 12px;">${params.dueDate}</td></tr>
        <tr><td style="padding:6px 12px;font-weight:bold;">Days Until Due</td><td style="padding:6px 12px;">${params.daysUntilDue}</td></tr>
        <tr><td style="padding:6px 12px;font-weight:bold;">Status</td><td style="padding:6px 12px;">${params.status}</td></tr>
      </table>
      <p>Please ensure this document is uploaded before the due date.</p>
    `;

    const recipients = params.to
      ? [params.to]
      : this.emailService.adminRecipients();

    if (!recipients.length) {
      this.logger.warn(
        `No recipients for compliance reminder: ${params.returnName}`,
      );
      return;
    }

    const result = await this.emailService.send(
      recipients,
      subject,
      subject,
      bodyHtml,
    );
    if ('skipped' in result) {
      this.logger.log(
        `[EMAIL DISABLED] ${urgency}: ${params.returnName} due ${params.dueDate}`,
      );
    } else if (result.ok) {
      this.logger.log(
        `Sent ${urgency} for ${params.returnName} to ${recipients.join(',')}`,
      );
    } else {
      this.logger.error(
        `Failed to send ${urgency} for ${params.returnName}: ${result.error}`,
      );
    }
  }

  /**
   * Send a batch summary of upcoming due documents.
   */
  async sendBatchSummary(params: {
    companyId: string;
    daysAhead: number;
    documents: Array<{
      returnName: string;
      returnCode: string;
      branchId: string;
      dueDate: string;
      status: string;
    }>;
  }): Promise<void> {
    if (!params.documents.length) return;

    const subject = `Compliance Summary: ${params.documents.length} documents due in ${params.daysAhead} days`;
    const rows = params.documents
      .map(
        (d) =>
          `<tr><td style="padding:4px 8px;border:1px solid #ddd;">${d.returnName}</td><td style="padding:4px 8px;border:1px solid #ddd;">${d.returnCode}</td><td style="padding:4px 8px;border:1px solid #ddd;">${d.dueDate}</td><td style="padding:4px 8px;border:1px solid #ddd;">${d.status}</td></tr>`,
      )
      .join('');

    const bodyHtml = `
      <p>${params.documents.length} compliance documents are due within the next ${params.daysAhead} days:</p>
      <table style="border-collapse:collapse;width:100%;">
        <thead><tr>
          <th style="padding:6px 8px;border:1px solid #ddd;background:#f5f5f5;text-align:left;">Document</th>
          <th style="padding:6px 8px;border:1px solid #ddd;background:#f5f5f5;text-align:left;">Code</th>
          <th style="padding:6px 8px;border:1px solid #ddd;background:#f5f5f5;text-align:left;">Due Date</th>
          <th style="padding:6px 8px;border:1px solid #ddd;background:#f5f5f5;text-align:left;">Status</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p>Please ensure these documents are uploaded before their due dates.</p>
    `;

    const recipients = this.emailService.adminRecipients();
    if (!recipients.length) {
      this.logger.warn(
        `No recipients for batch compliance summary (company ${params.companyId})`,
      );
      return;
    }

    const result = await this.emailService.send(
      recipients,
      subject,
      subject,
      bodyHtml,
    );
    if ('skipped' in result) {
      this.logger.log(
        `[EMAIL DISABLED] Batch: ${params.documents.length} docs due for company ${params.companyId}`,
      );
    } else if (result.ok) {
      this.logger.log(
        `Sent batch summary (${params.documents.length} docs) to ${recipients.join(',')}`,
      );
    } else {
      this.logger.error(`Failed to send batch summary: ${result.error}`);
    }
  }
}
