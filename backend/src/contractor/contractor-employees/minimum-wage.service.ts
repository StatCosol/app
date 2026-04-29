import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  MinimumWageEntity,
  MinimumWageSkill,
} from './entities/minimum-wage.entity';

export interface MinimumWageLookupResult {
  ok: boolean;
  reason?: string;
  minimumMonthlyWage?: number;
  effectiveFrom?: string;
  source?: string | null;
  scheduledEmployment?: string | null;
}

/**
 * Item #4b: state + skill min-wage master + lookup helper.
 *
 *   - lookup()         resolves the most recent effective rate for
 *                      (stateCode, skillCategory) on a given date.
 *   - validateSalary() throws BadRequestException when monthlySalary is
 *                      strictly below the resolved minimum.  Missing master
 *                      data or missing inputs return ok:true (skip) so
 *                      validation never blocks records that legitimately
 *                      lack one of the three pieces.
 */
@Injectable()
export class MinimumWageService {
  constructor(
    @InjectRepository(MinimumWageEntity)
    private readonly repo: Repository<MinimumWageEntity>,
  ) {}

  async lookup(
    stateCode: string | null | undefined,
    skillCategory: string | null | undefined,
    onDate?: string,
    scheduledEmployment?: string | null,
  ): Promise<MinimumWageLookupResult> {
    if (!stateCode || !skillCategory) {
      return { ok: true, reason: 'state or skill missing' };
    }
    const skill = String(skillCategory).toUpperCase() as MinimumWageSkill;
    const dateStr =
      onDate && /^\d{4}-\d{2}-\d{2}$/.test(onDate)
        ? onDate
        : new Date().toISOString().slice(0, 10);
    const sched =
      scheduledEmployment && String(scheduledEmployment).trim()
        ? String(scheduledEmployment).trim()
        : null;

    // Prefer an exact schedule-of-employment match, fall back to a NULL
    // (wildcard / default) row. Order ensures schedule-specific rows win,
    // then most-recent effective_from.
    const qb = this.repo
      .createQueryBuilder('mw')
      .where('mw.state_code = :stateCode', {
        stateCode: String(stateCode).toUpperCase(),
      })
      .andWhere('mw.skill_category = :skill', { skill })
      .andWhere('mw.effective_from <= :dateStr', { dateStr })
      .andWhere('(mw.effective_to IS NULL OR mw.effective_to >= :dateStr)', {
        dateStr,
      });
    if (sched) {
      qb.andWhere(
        '(mw.scheduled_employment = :sched OR mw.scheduled_employment IS NULL)',
        { sched },
      );
    } else {
      qb.andWhere('mw.scheduled_employment IS NULL');
    }
    qb.orderBy(
      'CASE WHEN mw.scheduled_employment IS NULL THEN 1 ELSE 0 END',
      'ASC',
    ).addOrderBy('mw.effective_from', 'DESC');

    const row = await qb.getOne();

    if (!row) {
      return { ok: true, reason: 'no master data' };
    }

    return {
      ok: true,
      minimumMonthlyWage: row.monthlyWage,
      effectiveFrom: row.effectiveFrom,
      source: row.source,
      scheduledEmployment: row.scheduledEmployment,
    };
  }

  /**
   * Hard validate: throws if monthly salary is below the master rate.
   * Soft cases (no state, no skill, no master row, no salary) are no-ops.
   */
  async validateSalary(params: {
    stateCode?: string | null;
    skillCategory?: string | null;
    monthlySalary?: number | null;
    onDate?: string;
    scheduledEmployment?: string | null;
  }): Promise<MinimumWageLookupResult> {
    const {
      stateCode,
      skillCategory,
      monthlySalary,
      onDate,
      scheduledEmployment,
    } = params;
    if (monthlySalary == null) return { ok: true, reason: 'no salary supplied' };
    const lookup = await this.lookup(
      stateCode,
      skillCategory,
      onDate,
      scheduledEmployment,
    );
    if (lookup.minimumMonthlyWage == null) return lookup;

    if (Number(monthlySalary) < Number(lookup.minimumMonthlyWage)) {
      const sched = scheduledEmployment
        ? ` under "${scheduledEmployment}" schedule of employment`
        : '';
      throw new BadRequestException(
        `Monthly salary ${monthlySalary} is below the statutory minimum wage (${lookup.minimumMonthlyWage}) for ${skillCategory} workers in ${stateCode}${sched} effective from ${lookup.effectiveFrom}.`,
      );
    }

    return lookup;
  }

  /**
   * Soft validate: returns a problem string instead of throwing. Used by
   * bulk upload to record per-row warnings without aborting the batch.
   */
  async checkSalary(params: {
    stateCode?: string | null;
    skillCategory?: string | null;
    monthlySalary?: number | null;
    onDate?: string;
    scheduledEmployment?: string | null;
  }): Promise<string | null> {
    try {
      await this.validateSalary(params);
      return null;
    } catch (e: any) {
      return String(e?.message || 'Below minimum wage');
    }
  }
}
