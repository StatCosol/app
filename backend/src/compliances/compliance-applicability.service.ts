import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { BranchEntity } from '../branches/entities/branch.entity';
import { ComplianceMasterEntity } from './entities/compliance-master.entity';
import { BranchType } from '../common/enums';

export type ApplicabilityResult = {
  isApplicable: boolean;
  source: 'RULE' | 'MASTER' | 'MANUAL';
  reason: string;
};

type ComplianceApplicabilityRule = {
  branch_category: string;
  state_code: string | null;
  min_headcount: number | null;
  max_headcount: number | null;
};

@Injectable()
export class ComplianceApplicabilityService {
  constructor(private readonly ds: DataSource) {}

  async recomputeForBranch(branchId: string): Promise<{ updated: number }> {
    const branchRepo = this.ds.getRepository(BranchEntity);
    const complianceRepo = this.ds.getRepository(ComplianceMasterEntity);

    const branch = await branchRepo.findOne({ where: { id: branchId } });
    if (!branch) throw new Error('Branch not found');

    // Fetch active compliances (ordered by name for deterministic upsert order)
    const compliances = await complianceRepo.find({
      where: { isActive: true as any },
      order: { complianceName: 'ASC' as any },
    });

    let updated = 0;
    for (const c of compliances) {
      const existing = await this.ds.query(
        `SELECT "overrideMode" FROM branch_compliances WHERE "branchId" = $1 AND "complianceId" = $2`,
        [branch.id, c.id],
      );

      const overrideMode = existing?.[0]?.overrideMode ?? 'AUTO';
      if (overrideMode !== 'AUTO') {
        continue; // preserve manual overrides
      }

      const res = await this.evaluateCompliance(branch, c);

      // Upsert into branch_compliances; keep status as PENDING and refresh lastUpdated
      await this.ds.query(
        `
        INSERT INTO branch_compliances
          ("branchId", "clientId", "complianceId", "isApplicable", "source", "reason", "status", "lastUpdated")
        VALUES
          ($1, $2, $3, $4, $5, $6, 'PENDING', now())
        ON CONFLICT ("branchId", "complianceId")
        DO UPDATE SET
          "isApplicable" = EXCLUDED."isApplicable",
          "source" = EXCLUDED."source",
          "reason" = EXCLUDED."reason",
          "lastUpdated" = now()
        `,
        [
          branch.id,
          branch.clientId,
          c.id,
          res.isApplicable,
          res.source,
          res.reason,
        ],
      );

      updated++;
    }

    return { updated };
  }

  private async evaluateCompliance(
    branch: BranchEntity,
    compliance: ComplianceMasterEntity,
  ): Promise<ApplicabilityResult> {
    const branchCategory =
      (branch as any).branchCategory ?? branch.branchType ?? BranchType.HO;
    const stateCode = branch.stateCode ?? null;
    const headcount = Number(branch.headcount ?? 0);

    // 1) Rule table check first (compliance_applicability)
    const rule = await this.pickBestRule(
      compliance.id,
      branchCategory,
      stateCode,
      headcount,
    );
    if (rule) {
      return {
        isApplicable: true,
        source: 'RULE',
        reason: `Matched rule: branch=${rule.branch_category}, state=${rule.state_code ?? 'ANY'}, headcount=${
          rule.min_headcount ?? 'ANY'
        }-${rule.max_headcount ?? 'ANY'}`,
      };
    }

    // 2) Fall back to compliance_master thresholds
    const min = Number((compliance as any).minHeadcount ?? 0);
    const max =
      (compliance as any).maxHeadcount == null
        ? null
        : Number((compliance as any).maxHeadcount);
    const stateScopeRaw = (compliance as any).stateScope ?? null; // e.g. 'ALL' or comma list
    const lawFamily = (compliance as any).lawFamily ?? null; // e.g. 'FACTORY', 'S&E'

    // Branch type gate based on lawFamily
    if (lawFamily === 'FACTORY' && branchCategory !== 'FACTORY') {
      return {
        isApplicable: false,
        source: 'MASTER',
        reason: 'Not applicable: compliance is FACTORY-only',
      };
    }
    if (lawFamily === 'S&E' && branchCategory === 'FACTORY') {
      return {
        isApplicable: false,
        source: 'MASTER',
        reason: 'Not applicable: compliance is S&E-only',
      };
    }

    // State scope check (comma-separated or ALL)
    if (stateScopeRaw && stateScopeRaw !== 'ALL' && stateCode) {
      const scopes = stateScopeRaw
        .split(',')
        .map((s: string) => s.trim())
        .filter(Boolean);
      if (scopes.length > 0 && !scopes.includes(stateCode)) {
        return {
          isApplicable: false,
          source: 'MASTER',
          reason: `Not applicable in state ${stateCode}`,
        };
      }
    }

    if (headcount < min) {
      return {
        isApplicable: false,
        source: 'MASTER',
        reason: `Headcount ${headcount} below minimum ${min}`,
      };
    }
    if (max != null && headcount > max) {
      return {
        isApplicable: false,
        source: 'MASTER',
        reason: `Headcount ${headcount} above maximum ${max}`,
      };
    }

    return {
      isApplicable: true,
      source: 'MASTER',
      reason: 'Applicable by compliance master thresholds',
    };
  }

  private async pickBestRule(
    complianceId: string,
    branchCategory: string,
    stateCode: string | null,
    headcount: number,
  ): Promise<ComplianceApplicabilityRule | null> {
    const rows = await this.ds.query(
      `
      SELECT *
      FROM compliance_applicability
      WHERE compliance_id = $1
        AND is_active = true
        AND branch_category = $2
        AND (state_code IS NULL OR state_code = $3)
        AND (min_headcount IS NULL OR min_headcount <= $4)
        AND (max_headcount IS NULL OR max_headcount >= $4)
      ORDER BY priority ASC
      LIMIT 1
      `,
      [complianceId, branchCategory, stateCode, headcount],
    );

    return rows?.[0] ?? null;
  }
}
