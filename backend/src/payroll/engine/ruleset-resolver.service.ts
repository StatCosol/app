import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PayRuleSetEntity } from '../entities/pay-rule-set.entity';
import { PayRuleParameterEntity } from '../entities/pay-rule-parameter.entity';

interface ResolveRuleSetParams {
  clientId: string;
  branchId: string | null;
  asOfDate: string;
}

interface ResolveAndLoadResult {
  ruleSet: PayRuleSetEntity;
  params: Map<string, number>;
}

@Injectable()
export class RulesetResolverService {
  constructor(
    @InjectRepository(PayRuleSetEntity)
    private readonly ruleSetRepo: Repository<PayRuleSetEntity>,
    @InjectRepository(PayRuleParameterEntity)
    private readonly paramRepo: Repository<PayRuleParameterEntity>,
  ) {}

  async resolveRuleSet(
    params: ResolveRuleSetParams,
  ): Promise<PayRuleSetEntity | null> {
    const { clientId, branchId, asOfDate } = params;

    // Try branch-specific first
    if (branchId) {
      const branchSet = await this.findRuleSet(clientId, branchId, asOfDate);
      if (branchSet) {
        return branchSet;
      }
    }

    // Fall back to tenant-level (branchId IS NULL)
    return this.findRuleSet(clientId, null, asOfDate);
  }

  async loadParameters(ruleSetId: string): Promise<Map<string, number>> {
    const entries = await this.paramRepo.find({
      where: { ruleSetId },
    });

    const result = new Map<string, number>();

    for (const entry of entries) {
      let numericValue: number | null = null;

      if (entry.valueNum !== null && entry.valueNum !== undefined) {
        numericValue = Number(entry.valueNum);
      } else if (entry.valueText) {
        const parsed = Number(entry.valueText);
        if (!isNaN(parsed)) {
          numericValue = parsed;
        }
      }

      if (numericValue !== null && !isNaN(numericValue)) {
        result.set(entry.key, numericValue);
      }
    }

    return result;
  }

  async resolveAndLoad(
    params: ResolveRuleSetParams,
  ): Promise<ResolveAndLoadResult | null> {
    const ruleSet = await this.resolveRuleSet(params);
    if (!ruleSet) {
      return null;
    }

    const ruleParams = await this.loadParameters(ruleSet.id);
    return { ruleSet, params: ruleParams };
  }

  private async findRuleSet(
    clientId: string,
    branchId: string | null,
    asOfDate: string,
  ): Promise<PayRuleSetEntity | null> {
    const qb = this.ruleSetRepo
      .createQueryBuilder('r')
      .where('r.client_id = :clientId', { clientId })
      .andWhere('r.is_active = true')
      .andWhere('r.effective_from <= :asOf', { asOf: asOfDate })
      .andWhere('(r.effective_to IS NULL OR r.effective_to >= :asOf)', {
        asOf: asOfDate,
      })
      .orderBy('r.effective_from', 'DESC')
      .limit(1);

    if (branchId) {
      qb.andWhere('r.branch_id = :branchId', { branchId });
    } else {
      qb.andWhere('r.branch_id IS NULL');
    }

    return qb.getOne() ?? null;
  }
}
