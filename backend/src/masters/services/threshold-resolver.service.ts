import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ThresholdMasterEntity } from '../entities/threshold-master.entity';

@Injectable()
export class ThresholdResolverService {
  constructor(
    @InjectRepository(ThresholdMasterEntity)
    private readonly repo: Repository<ThresholdMasterEntity>,
  ) {}

  async getNumber(
    code: string,
    stateCode?: string | null,
    onDate?: string,
  ): Promise<number> {
    const date = onDate ?? new Date().toISOString().slice(0, 10);

    const row = await this.repo
      .createQueryBuilder('t')
      .where('t.isActive = true')
      .andWhere('t.code = :code', { code })
      .andWhere('(t.stateCode = :stateCode OR t.stateCode IS NULL)', {
        stateCode: stateCode ?? null,
      })
      .andWhere('t.effectiveFrom <= :date', { date })
      .andWhere('(t.effectiveTo IS NULL OR t.effectiveTo >= :date)', { date })
      .orderBy('CASE WHEN t.stateCode IS NULL THEN 1 ELSE 0 END', 'ASC')
      .addOrderBy('t.effectiveFrom', 'DESC')
      .getOne();

    if (!row || row.valueNumber == null) {
      throw new NotFoundException(
        `Threshold not configured: ${code} (state=${stateCode ?? 'GLOBAL'})`,
      );
    }
    return Number(row.valueNumber);
  }
}
