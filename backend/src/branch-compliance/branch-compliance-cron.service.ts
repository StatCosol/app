import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BranchComplianceService } from './branch-compliance.service';
import { ComplianceMailService } from './compliance-mail.service';

@Injectable()
export class BranchComplianceCronService {
  private readonly logger = new Logger(BranchComplianceCronService.name);

  constructor(
    private readonly complianceService: BranchComplianceService,
    private readonly mailService: ComplianceMailService,
  ) {}

  /** Run daily at 1:00 AM to mark overdue documents */
  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async handleOverdueCheck() {
    this.logger.log('Running overdue compliance document check...');
    try {
      const result = await this.complianceService.markOverdueDocuments();
      this.logger.log(
        `Overdue check complete. ${result.affected} documents marked as OVERDUE.`,
      );
    } catch (err) {
      this.logger.error('Overdue check failed', err);
    }
  }

  /** Run daily at 9:00 AM — send T-5 day reminders */
  @Cron('0 9 * * *')
  async handleT5Reminder() {
    this.logger.log('Running T-5 day compliance reminders...');
    try {
      const docs = await this.complianceService.getDocsDueSoon(5);
      this.logger.log(`Found ${docs.length} documents due in 5 days.`);

      for (const doc of docs) {
        await this.mailService.sendReminder({
          branchId: doc.branchId,
          companyId: doc.companyId,
          returnCode: doc.returnCode,
          returnName: doc.returnName,
          frequency: doc.frequency,
          dueDate: doc.dueDate,
          daysUntilDue: 5,
          status: doc.status,
        });
      }
    } catch (err) {
      this.logger.error('T-5 reminder failed', err);
    }
  }

  /** Run daily at 9:30 AM — send T-2 day URGENT reminders */
  @Cron('30 9 * * *')
  async handleT2Reminder() {
    this.logger.log('Running T-2 day URGENT compliance reminders...');
    try {
      const docs = await this.complianceService.getDocsDueSoon(2);
      this.logger.log(`Found ${docs.length} documents due in 2 days.`);

      for (const doc of docs) {
        await this.mailService.sendReminder({
          branchId: doc.branchId,
          companyId: doc.companyId,
          returnCode: doc.returnCode,
          returnName: doc.returnName,
          frequency: doc.frequency,
          dueDate: doc.dueDate,
          daysUntilDue: 2,
          status: doc.status,
        });
      }
    } catch (err) {
      this.logger.error('T-2 reminder failed', err);
    }
  }
}
