import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PayrollStatutorySlabEntity } from '../entities/payroll-statutory-slab.entity';

/**
 * StateSlabService
 *
 * Resolves a monetary amount from the payroll_statutory_slabs table
 * given clientId + stateCode + componentCode + baseAmount.
 *
 * Fallback order:
 *   1) State-specific slabs (e.g., stateCode = 'MH')
 *   2) Default slabs (stateCode = 'ALL')
 *
 * Slab matching: baseAmount >= from_amount AND (to_amount IS NULL OR baseAmount <= to_amount)
 * Resolution: value_amount (fixed) takes priority, then value_percent (percentage of base).
 */
@Injectable()
export class StateSlabService {
  constructor(
    @InjectRepository(PayrollStatutorySlabEntity)
    private readonly slabRepo: Repository<PayrollStatutorySlabEntity>,
  ) {}

  async resolveAmount(params: {
    clientId: string;
    stateCode: string;
    componentCode: string;
    baseAmount: number;
  }): Promise<number> {
    const { clientId, stateCode, componentCode, baseAmount } = params;

    // Try state-specific first
    const slabsState = await this.slabRepo.find({
      where: { clientId, stateCode, componentCode },
      order: { fromAmount: 'ASC' },
    });

    // Fallback to ALL
    const slabsAll = stateCode !== 'ALL'
      ? await this.slabRepo.find({
          where: { clientId, stateCode: 'ALL', componentCode },
          order: { fromAmount: 'ASC' },
        })
      : [];

    const slabs = slabsState.length > 0 ? slabsState : slabsAll;
    if (slabs.length === 0) return 0;

    for (const s of slabs) {
      const from = Number(s.fromAmount);
      const to = s.toAmount != null ? Number(s.toAmount) : null;
      const inRange = baseAmount >= from && (to === null || baseAmount <= to);

      if (!inRange) continue;

      if (s.valueAmount != null) return Number(s.valueAmount);
      if (s.valuePercent != null) return (baseAmount * Number(s.valuePercent)) / 100;
      return 0;
    }

    return 0;
  }
}
