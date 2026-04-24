import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { CompliancePackageEntity } from '../../masters/entities/compliance-package.entity';
import { PackageComplianceEntity } from '../../masters/entities/package-compliance.entity';
import { ApplicabilityRuleEntity } from '../../masters/entities/applicability-rule.entity';
import { PackageRuleEntity } from '../../masters/entities/package-rule.entity';
import { UnitFactsEntity } from '../entities/unit-facts.entity';
import { UnitApplicableComplianceEntity } from '../entities/unit-applicable-compliance.entity';
import { UnitApplicabilityAuditEntity } from '../entities/unit-applicability-audit.entity';
import { RuleEvaluatorService } from './rule-evaluator.service';

@Injectable()
export class ApplicabilityEngineService {
  private readonly logger = new Logger(ApplicabilityEngineService.name);

  constructor(
    @InjectRepository(UnitFactsEntity)
    private readonly factsRepo: Repository<UnitFactsEntity>,

    @InjectRepository(UnitApplicableComplianceEntity)
    private readonly applicableRepo: Repository<UnitApplicableComplianceEntity>,

    @InjectRepository(UnitApplicabilityAuditEntity)
    private readonly auditRepo: Repository<UnitApplicabilityAuditEntity>,

    @InjectRepository(PackageComplianceEntity)
    private readonly pkgComplRepo: Repository<PackageComplianceEntity>,

    @InjectRepository(PackageRuleEntity)
    private readonly pkgRuleRepo: Repository<PackageRuleEntity>,

    @InjectRepository(ApplicabilityRuleEntity)
    private readonly ruleRepo: Repository<ApplicabilityRuleEntity>,

    @InjectRepository(CompliancePackageEntity)
    private readonly pkgRepo: Repository<CompliancePackageEntity>,

    private readonly evaluator: RuleEvaluatorService,
  ) {}

  /**
   * Resolve a packageId parameter that may be a UUID or a package code
   */
  private async resolvePackageId(packageIdOrCode: string): Promise<string> {
    // If it looks like a UUID, return as-is
    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidPattern.test(packageIdOrCode)) {
      return packageIdOrCode;
    }
    // Otherwise, look up by code
    const pkg = await this.pkgRepo.findOne({
      where: { code: packageIdOrCode },
    });
    if (!pkg) {
      throw new NotFoundException(
        `Compliance package not found: ${packageIdOrCode}`,
      );
    }
    return pkg.id;
  }

  /**
   * Recompute applicability for a branch against a compliance package.
   * 1. Load facts   → factMap
   * 2. Load package → compliance IDs
   * 3. Load rules   → ordered by priority
   * 4. Evaluate     → per-compliance result
   * 5. Persist AUTO rows (preserve OVERRIDE / SPECIAL_SELECTED)
   * 6. Audit trail
   */
  async recompute(
    branchId: string,
    packageIdOrCode: string,
    actorUserId: string | null,
    onDate?: string,
  ) {
    const packageId = await this.resolvePackageId(packageIdOrCode);
    // ─── 1. Load Facts ───
    const facts = await this.factsRepo.findOne({ where: { branchId } });
    if (!facts) {
      return { computed: 0, message: 'No facts configured for this branch' };
    }

    const factMap: Record<string, any> = {
      state_code: facts.stateCode,
      establishment_type: facts.establishmentType,
      is_hazardous: facts.isHazardous,
      industry_category: facts.industryCategory,
      employee_total: facts.employeeTotal,
      employee_male: facts.employeeMale,
      employee_female: facts.employeeFemale,
      contract_workers_total: facts.contractWorkersTotal,
      contractors_count: facts.contractorsCount,
      is_bocw_project: facts.isBocwProject,
      has_canteen: facts.hasCanteen,
      has_creche: facts.hasCreche,
    };

    // ─── 2. Load Package Compliances ───
    const pkgLinks = await this.pkgComplRepo.find({
      where: { packageId },
      relations: ['compliance'],
    });
    if (pkgLinks.length === 0) {
      return { computed: 0, message: 'Package has no linked compliances' };
    }

    const complianceIds = pkgLinks.map((pl) => pl.complianceId);
    const defaultIncludeMap = new Map(
      pkgLinks.map((pl) => [pl.complianceId, pl.includedByDefault ?? true]),
    );
    const appliesToMap = new Map(
      pkgLinks.map((pl) => [
        pl.complianceId,
        pl.compliance?.appliesTo || 'BOTH',
      ]),
    );

    // ─── 3. Load Applicable Rules ───
    const pkgRuleLinks = await this.pkgRuleRepo.find({
      where: { packageId },
    });
    const ruleIds = pkgRuleLinks.map((pr) => pr.ruleId);

    let rules: ApplicabilityRuleEntity[] = [];
    if (ruleIds.length > 0) {
      rules = await this.ruleRepo.find({
        where: { id: In(ruleIds), isActive: true },
        order: { priority: 'ASC' },
      });
    }

    // ─── 4. Evaluate Per Compliance ───
    const results: Array<{
      complianceId: string;
      isApplicable: boolean;
      matchedRule: string | null;
    }> = [];

    for (const cId of complianceIds) {
      const relevantRules = rules.filter((r) => r.targetComplianceId === cId);

      // Default: use included_by_default from the package link
      let applicable = defaultIncludeMap.get(cId) ?? false;
      let matchedRule: string | null = null;

      // Filter by appliesTo vs branch establishmentType
      const itemAppliesTo = appliesToMap.get(cId) || 'BOTH';
      const branchType = facts.establishmentType || 'BOTH';
      if (
        itemAppliesTo !== 'BOTH' &&
        branchType !== 'BOTH' &&
        itemAppliesTo !== branchType
      ) {
        applicable = false; // e.g. FACTORY item doesn't apply to ESTABLISHMENT branch
      }

      // Filter by stateCode — if item is state-specific, branch must match
      const pkgLink = pkgLinks.find((pl) => pl.complianceId === cId);
      const itemState = pkgLink?.compliance?.stateCode || null;
      if (applicable && itemState && itemState !== 'ALL') {
        const allowedStates = itemState
          .split(',')
          .map((s: string) => s.trim().toUpperCase());
        if (!allowedStates.includes((facts.stateCode || '').toUpperCase())) {
          applicable = false;
        }
      }

      for (const rule of relevantRules) {
        const matched = await this.evaluator.matches(
          rule.conditionsJson,
          factMap,
          facts.stateCode,
          onDate,
        );
        if (matched) {
          applicable = rule.effect === 'ENABLE';
          matchedRule = rule.name;
          break; // first matching rule wins (lower priority number = higher priority)
        }
      }

      results.push({
        complianceId: cId,
        isApplicable: applicable,
        matchedRule,
      });
    }

    // ─── 5. Persist AUTO Rows (skip manual overrides) ───
    const existing = await this.applicableRepo.find({ where: { branchId } });
    const existingMap = new Map(existing.map((e) => [e.complianceId, e]));

    const toSave: UnitApplicableComplianceEntity[] = [];
    for (const r of results) {
      const prev = existingMap.get(r.complianceId);
      // Preserve manually set rows
      if (
        prev &&
        (prev.source === 'OVERRIDE' || prev.source === 'SPECIAL_SELECTED')
      ) {
        continue;
      }

      if (prev) {
        prev.isApplicable = r.isApplicable;
        prev.source = 'AUTO';
        prev.computedBy = actorUserId;
        prev.computedAt = new Date();
        prev.overrideReason = null;
        toSave.push(prev);
      } else {
        const row = this.applicableRepo.create({
          branchId,
          complianceId: r.complianceId,
          isApplicable: r.isApplicable,
          source: 'AUTO',
          computedBy: actorUserId,
          computedAt: new Date(),
        } as Partial<UnitApplicableComplianceEntity>);
        toSave.push(row);
      }
    }

    if (toSave.length > 0) {
      await this.applicableRepo.save(toSave);
    }

    // ─── 6. Audit Trail ───
    await this.auditRepo.save(
      this.auditRepo.create({
        branchId,
        actorUserId,
        action: 'RECOMPUTED',
        afterJson: results,
      } as Partial<UnitApplicabilityAuditEntity>),
    );

    this.logger.log(
      `Recomputed applicability for branch=${branchId}: ${results.filter((r) => r.isApplicable).length} applicable of ${results.length} total`,
    );

    return {
      computed: results.length,
      applicable: results.filter((r) => r.isApplicable).length,
      results,
    };
  }
}
