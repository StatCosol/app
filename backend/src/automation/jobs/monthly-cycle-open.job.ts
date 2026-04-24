import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MonthlyCycleEngineService } from '../services/monthly-cycle-engine.service';

@Injectable()
export class MonthlyCycleOpenJob {
  private readonly logger = new Logger(MonthlyCycleOpenJob.name);

  constructor(private readonly monthlyCycleEngine: MonthlyCycleEngineService) {}

  // Runs on 1st day of every month at 01:00 AM
  @Cron('0 1 1 * *')
  async handle() {
    this.logger.log('Starting monthly cycle opening job');

    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    try {
      const result = await this.monthlyCycleEngine.openMonthlyCycle(
        month,
        year,
      );
      this.logger.log(
        `Monthly cycle opened. Created cycles: ${result.cyclesCreated}, tasksCreated: ${result.tasksCreated}`,
      );
    } catch (error) {
      this.logger.error(
        `Monthly cycle opening job failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
