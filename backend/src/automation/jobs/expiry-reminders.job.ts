import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ExpiryEngineService } from '../services/expiry-engine.service';

@Injectable()
export class ExpiryRemindersJob {
  private readonly logger = new Logger(ExpiryRemindersJob.name);
  constructor(private readonly expiry: ExpiryEngineService) {}
  @Cron('0 0 7 * * *', { timeZone: 'Asia/Kolkata' })
  async handle() {
    try {
      const result = await this.expiry.generateExpiryAlerts();
      this.logger.log(
        `Expiry scan: ${result.expiringItems} expiring, ${result.tasksCreated} tasks, ${result.alertsSent} alerts`,
      );
      return result;
    } catch (error) {
      this.logger.error(
        `Expiry scan failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }
}
