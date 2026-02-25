import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

/**
 * Lightweight service that expires cached risk_assessments
 * for a given branch whenever underlying data changes.
 *
 * Injected into Compliance, ContractorDocuments, Employees,
 * and AuditorObservations services to keep risk snapshots fresh.
 */
@Injectable()
export class AiRiskCacheInvalidatorService {
  private readonly logger = new Logger(AiRiskCacheInvalidatorService.name);

  constructor(private readonly dataSource: DataSource) {}

  /**
   * Mark all cached BRANCH_RISK assessments for a branch as expired.
   * Called after any data mutation that feeds into the risk engine.
   */
  async invalidateBranch(branchId: string): Promise<void> {
    if (!branchId) return;
    try {
      await this.dataSource.query(
        `UPDATE ai_risk_assessments
            SET expires_at = NOW()
          WHERE assessment_type = 'BRANCH_RISK'
            AND input_data ->> 'branchId' = $1
            AND expires_at > NOW()`,
        [branchId],
      );
      this.logger.debug(`Invalidated branch risk cache for ${branchId}`);
    } catch (err) {
      // Non-critical — log and continue
      this.logger.warn(`Failed to invalidate branch risk cache: ${(err as Error).message}`);
    }
  }

  /**
   * Mark all cached risk assessments for a client as expired.
   * Useful when a change affects the client-level risk score.
   */
  async invalidateClient(clientId: string): Promise<void> {
    if (!clientId) return;
    try {
      await this.dataSource.query(
        `UPDATE ai_risk_assessments
            SET expires_at = NOW()
          WHERE client_id = $1
            AND expires_at > NOW()`,
        [clientId],
      );
      this.logger.debug(`Invalidated client risk cache for ${clientId}`);
    } catch (err) {
      this.logger.warn(`Failed to invalidate client risk cache: ${(err as Error).message}`);
    }
  }
}
