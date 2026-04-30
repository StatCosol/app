import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ApplicabilityEngineService } from '../services/applicability-engine.service';

@Injectable()
export class ApplicabilityRecomputeJob {
  private readonly logger = new Logger(ApplicabilityRecomputeJob.name);

  constructor(
    private readonly applicabilityEngine: ApplicabilityEngineService,
  ) {}

  /** Nightly at 03:00 — recompute compliance applicability for all branches. */
  @Cron('0 0 3 * * *')
  async handle() {
    this.logger.log('Starting nightly applicability recompute');
    try {
      const result = await this.applicabilityEngine.recomputeAllBranches();
      this.logger.log(
        `Applicability recompute done: ${result.branchesProcessed} branches`,
      );
    } catch (err) {
      this.logger.error(
        `Applicability recompute failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
