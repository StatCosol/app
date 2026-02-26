import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BranchEntity } from '../branches/entities/branch.entity';
import { SlaComplianceItemEntity } from './entities/compliance-item.entity';
import { SlaComplianceRuleEntity } from './entities/compliance-rule.entity';

/**
 * Resolved rule = item + best-matching rule for a given branch.
 * Higher specificity = state+type > state only > type only > global.
 */
export interface ApplicableRule {
  item: SlaComplianceItemEntity;
  rule: SlaComplianceRuleEntity;
  specificity: number;
}

/**
 * Single source of truth for determining which compliance rules
 * apply to a specific branch, based on state_code + establishment_type.
 *
 * Used by: Branch Compliance API, Calendar, SLA AutoGen.
 */
@Injectable()
export class SlaComplianceResolverService {
  constructor(
    @InjectRepository(BranchEntity)
    private readonly branchRepo: Repository<BranchEntity>,
    @InjectRepository(SlaComplianceItemEntity)
    private readonly itemRepo: Repository<SlaComplianceItemEntity>,
    @InjectRepository(SlaComplianceRuleEntity)
    private readonly ruleRepo: Repository<SlaComplianceRuleEntity>,
  ) {}

  /**
   * Resolve applicable compliance rules for a branch.
   * Applies specificity-based matching:
   *   1) state + establishment_type match (score 3)
   *   2) state only match (score 2)
   *   3) establishment_type only match (score 1)
   *   4) global default (score 0)
   *
   * If a more-specific rule says applicable=false, it overrides the default.
   */
  async getApplicableRules(branchId: string): Promise<{
    branch: BranchEntity;
    applicable: ApplicableRule[];
  }> {
    const branch = await this.branchRepo.findOne({ where: { id: branchId } as any });
    if (!branch) throw new NotFoundException('Branch not found');

    const stateCode: string | null = (branch as any).stateCode ?? null;
    const estType: string | null = (branch as any).establishmentType ?? null;

    const items = await this.itemRepo.find({ where: { isActive: true } });
    const rules = await this.ruleRepo.find({ where: { isActive: true } });

    // Group rules by compliance_item_id
    const rulesByItem = new Map<string, SlaComplianceRuleEntity[]>();
    for (const r of rules) {
      const key = r.complianceItemId;
      if (!rulesByItem.has(key)) rulesByItem.set(key, []);
      rulesByItem.get(key)!.push(r);
    }

    const applicable: ApplicableRule[] = [];

    for (const item of items) {
      const itemRules = rulesByItem.get(item.id) || [];
      const picked = this.pickBestRule(itemRules, stateCode, estType);
      if (!picked) continue;

      // If picked rule says not applicable, skip this item
      if (!picked.applicable) continue;

      applicable.push({
        item,
        rule: picked,
        specificity: this.specificityScore(picked, stateCode, estType),
      });
    }

    return { branch, applicable };
  }

  // ── Pick the most specific matching rule ──
  private pickBestRule(
    rules: SlaComplianceRuleEntity[],
    stateCode: string | null,
    estType: string | null,
  ): SlaComplianceRuleEntity | null {
    // Filter to rules that match this branch
    const matches = rules.filter((r) => {
      const rState = r.stateCode;
      const rType = r.establishmentType;
      const stateOk = !rState || (stateCode != null && rState === stateCode);
      const typeOk = !rType || (estType != null && rType === estType);
      return stateOk && typeOk;
    });

    if (matches.length === 0) return null;

    // Sort by specificity descending — most specific wins
    matches.sort(
      (a, b) =>
        this.specificityScore(b, stateCode, estType) -
        this.specificityScore(a, stateCode, estType),
    );

    return matches[0];
  }

  private specificityScore(
    rule: SlaComplianceRuleEntity,
    stateCode: string | null,
    estType: string | null,
  ): number {
    let score = 0;
    if (rule.stateCode && stateCode && rule.stateCode === stateCode) score += 2;
    if (rule.establishmentType && estType && rule.establishmentType === estType) score += 1;
    return score;
  }
}
