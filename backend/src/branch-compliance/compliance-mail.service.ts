import { Injectable, Logger } from '@nestjs/common';

/**
 * Stub mail service for compliance reminders.
 * Replace the sendEmail() implementation with your SMTP / SendGrid / SES transport.
 */
@Injectable()
export class ComplianceMailService {
  private readonly logger = new Logger(ComplianceMailService.name);

  /**
   * Send a compliance reminder email.
   * Currently logs to console — wire up your real email transport here.
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
    this.logger.log(
      `[${urgency}] Compliance reminder — ` +
      `${params.returnName} (${params.returnCode}) for branch ${params.branchId} ` +
      `due ${params.dueDate} (${params.daysUntilDue} days). Status: ${params.status}`,
    );

    // TODO: Replace with actual email sending:
    // await this.mailer.sendMail({
    //   to: params.to || 'branch-admin@company.com',
    //   subject: `[${urgency}] Compliance Document Due: ${params.returnName}`,
    //   template: 'compliance-reminder',
    //   context: params,
    // });
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
    this.logger.log(
      `[BATCH] ${params.documents.length} documents due in ${params.daysAhead} days ` +
      `for company ${params.companyId}`,
    );

    // TODO: Wire up actual batch email
  }
}
