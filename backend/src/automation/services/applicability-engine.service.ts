import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ApplicabilityEngineService as UnitEngine } from '../../units/services/applicability-engine.service';
import { AutomationScope, scopedRows } from '../automation-scope';
import { operationalDate } from '../../common/operational-date';
@Injectable()
export class ApplicabilityEngineService {
  private readonly logger = new Logger(ApplicabilityEngineService.name);
  constructor(
    private readonly dataSource: DataSource,
    private readonly units: UnitEngine,
  ) {}
  candidates(scope: AutomationScope = {}) {
    return scopedRows(
      this.dataSource,
      `SELECT b.id,b.id AS branch_id,b.clientid AS client_id,b.branchname AS title
      FROM client_branches b JOIN clients c ON c.id=b.clientid JOIN unit_facts f ON f.branch_id=b.id
      WHERE b.isactive=true AND b.deletedat IS NULL AND c.is_deleted=false`,
      [],
      scope,
    );
  }
  async recomputeBranchApplicability(
    branchId: string,
    packageId = 'DEFAULT_INDIA',
  ) {
    return this.units.recompute(branchId, packageId, null, operationalDate());
  }
  async recomputeAllBranches(scope: AutomationScope = {}) {
    let branchesProcessed = 0,
      failures = 0;
    for (const row of await this.candidates(scope)) {
      try {
        await this.recomputeBranchApplicability(
          row.id,
          scope.options?.packageId,
        );
        branchesProcessed++;
      } catch (error) {
        this.logger.error(
          'Applicability recompute failed for ' +
            row.id +
            ': ' +
            (error instanceof Error ? error.message : String(error)),
        );
        failures++;
      }
    }
    return { branchesProcessed, failures };
  }
}
