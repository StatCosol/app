import { Injectable, Logger } from '@nestjs/common';
import { AuditScheduleEngineService } from '../services/audit-schedule-engine.service';

@Injectable()
export class AuditScheduleGeneratorJob {
  private readonly logger = new Logger(AuditScheduleGeneratorJob.name);

  constructor(
    private readonly auditScheduleEngine: AuditScheduleEngineService,
  ) {}

  // Daily at 02:00 AM
  async handle() {
    this.logger.log('Starting audit schedule auto-generation job');

    try {
      const result = await this.auditScheduleEngine.generateDueSchedules();
      this.logger.log(
        `Audit schedule generation completed. Created: ${result.created}, Skipped: ${result.skipped}`,
      );
    } catch (error) {
      this.logger.error(
        `Audit schedule generation failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
