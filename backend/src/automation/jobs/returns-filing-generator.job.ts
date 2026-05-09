import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ReturnsFilingEngineService } from '../services/returns-filing-engine.service';
import { RenewalFilingEngineService } from '../services/renewal-filing-engine.service';

@Injectable()
export class ReturnsFilingGeneratorJob {
  private readonly logger = new Logger(ReturnsFilingGeneratorJob.name);

  constructor(
    private readonly filingEngine: ReturnsFilingEngineService,
    private readonly renewalEngine: RenewalFilingEngineService,
  ) {}

  /**
   * Runs on the 1st of every month at 02:00.
   * Generates periodic filing rows for the current month.
   */
  @Cron('0 0 2 1 * *')
  async handleMonthlyFilings() {
    this.logger.log('Monthly filing generation job started');
    try {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;
      const result = await this.filingEngine.generateFilings(year, month);
      this.logger.log(
        `Monthly filings done: ${result.filingsCreated} created, ${result.tasksCreated} tasks`,
      );
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'unknown';
      this.logger.error(`Monthly filing generation failed: ${errMsg}`);
    }
  }

  /**
   * Runs daily at 03:00.
   * Generates renewal filings from expiring registrations.
   */
  @Cron('0 0 3 * * *')
  async handleDailyRenewals() {
    this.logger.log('Daily renewal filing scan started');
    try {
      const result = await this.renewalEngine.generateRenewalFilings();
      this.logger.log(
        `Renewal filings done: ${result.filingsCreated} created, ${result.tasksCreated} tasks`,
      );
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'unknown';
      this.logger.error(`Renewal filing generation failed: ${errMsg}`);
    }
  }

  /**
   * Runs daily at 08:00.
   * Sends overdue alerts for past-due filings.
   */
  @Cron('0 0 8 * * *')
  async handleOverdueAlerts() {
    this.logger.log('Overdue filing alerts job started');
    try {
      const result = await this.filingEngine.generateOverdueAlerts();
      this.logger.log(`Overdue alerts: ${result.alertsSent} sent`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'unknown';
      this.logger.error(`Overdue alert generation failed: ${errMsg}`);
    }
  }
}
