import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { NonComplianceEngineService } from '../services/non-compliance-engine.service';

@Injectable()
export class NonComplianceRemindersJob {
  private readonly logger = new Logger(NonComplianceRemindersJob.name);

  constructor(private readonly ncEngine: NonComplianceEngineService) {}

  /** Daily at 09:00 — send reminders for all open audit NCs. */
  @Cron('0 0 9 * * *')
  async handle() {
    this.logger.log('Starting daily NC reminder job');
    try {
      const result = await this.ncEngine.sendDailyReminders();
      this.logger.log(
        `NC reminder job done — Open: ${result.totalOpenNc}, Sent: ${result.remindersSent}`,
      );
    } catch (err) {
      this.logger.error(
        `NC reminder job failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
