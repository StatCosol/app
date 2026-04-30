import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

/**
 * Applicability Engine: Auto-determines which compliances apply
 * to each branch based on state, unit type, headcount, and flags.
 *
 * Uses existing tables: compliance_applicability, applicability_rule,
 * unit_compliance_master, unit_applicability_audit.
 */
@Injectable()
export class ApplicabilityEngineService {
  private readonly logger = new Logger(ApplicabilityEngineService.name);

  constructor(private readonly dataSource: DataSource) {}

  /**
   * Recompute applicable compliance set for a single branch.
   * Evaluates applicability_rule conditions against branch profile.
   */
  async recomputeBranchApplicability(branchId: string): Promise<{
    branchId: string;
    applicable: number;
    notApplicable: number;
  }> {
    this.logger.log(`Recomputing applicability for branch ${branchId}`);

    // Get branch profile
    const branchRows = await this.dataSource.query(
      `SELECT b.id, b.branchname, b.statecode AS state_code, b.branchtype AS branch_category,
              b.clientid AS client_id,
              (SELECT COUNT(*)::int FROM employees e WHERE e.branch_id = b.id AND e.is_active = true) AS headcount
       FROM client_branches b WHERE b.id = $1`,
      [branchId],
    );
    if (!branchRows.length) {
      this.logger.warn(`Branch ${branchId} not found`);
      return { branchId, applicable: 0, notApplicable: 0 };
    }
    const branch = branchRows[0];

    // Evaluate rules: find all compliance items that match this branch
    const rules = await this.dataSource.query(
      `SELECT ar.id, ar.target_compliance_id, ar.effect, ar.conditions_json, ar.priority
       FROM applicability_rule ar
       WHERE ar.is_active = true
         AND (ar.state_code IS NULL OR ar.state_code = $1)
       ORDER BY ar.priority ASC`,
      [branch.state_code],
    );

    let applicable = 0;
    let notApplicable = 0;

    for (const rule of rules) {
      const conditions = rule.conditions_json || {};
      let matches = true;

      // Check headcount conditions
      if (
        conditions.minHeadcount != null &&
        branch.headcount < conditions.minHeadcount
      ) {
        matches = false;
      }
      if (
        conditions.maxHeadcount != null &&
        branch.headcount > conditions.maxHeadcount
      ) {
        matches = false;
      }

      // Check branch category
      if (
        conditions.branchCategory &&
        conditions.branchCategory !== branch.branch_category
      ) {
        matches = false;
      }

      if (matches) {
        // Upsert into unit_applicability_audit
        await this.dataSource.query(
          `INSERT INTO unit_applicability_audit (branch_id, compliance_id, is_applicable, computed_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (branch_id, compliance_id)
           DO UPDATE SET is_applicable = $3, computed_at = NOW()`,
          [branchId, rule.target_compliance_id, rule.effect === 'ENABLE'],
        );

        if (rule.effect === 'ENABLE') applicable++;
        else notApplicable++;
      }
    }

    this.logger.log(
      `Branch ${branchId}: ${applicable} applicable, ${notApplicable} not applicable`,
    );
    return { branchId, applicable, notApplicable };
  }

  /** Recompute for all active branches. */
  async recomputeAllBranches(): Promise<{ branchesProcessed: number }> {
    const branches = await this.dataSource.query(
      `SELECT id FROM client_branches WHERE deletedat IS NULL`,
    );

    for (const b of branches) {
      try {
        await this.recomputeBranchApplicability(b.id);
      } catch (err) {
        this.logger.error(
          `Applicability recompute failed for ${b.id}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    return { branchesProcessed: branches.length };
  }
}
