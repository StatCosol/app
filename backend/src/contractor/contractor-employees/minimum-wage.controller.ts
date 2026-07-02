import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import {
  MinimumWageEntity,
  MinimumWageSkill,
} from './entities/minimum-wage.entity';
import { MinimumWageService } from './minimum-wage.service';

interface UpsertWageDto {
  stateCode: string;
  skillCategory: MinimumWageSkill;
  scheduledEmployment?: string | null;
  monthlyWage: number;
  dailyWage?: number | null;
  effectiveFrom: string; // YYYY-MM-DD
  effectiveTo?: string | null;
  source?: string | null;
  notes?: string | null;
}

/**
 * Item #4b: master CRUD for minimum-wage rows + lookup endpoint.
 *  - ADMIN and CRM can create / update / delete rows (CRM uploads the
 *    refreshed rates every April / October).
 *  - ADMIN, CRM, CONTRACTOR, CLIENT can read & lookup.
 */
@Controller({ path: 'minimum-wages', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
export class MinimumWageController {
  constructor(
    @InjectRepository(MinimumWageEntity)
    private readonly repo: Repository<MinimumWageEntity>,
    private readonly svc: MinimumWageService,
  ) {}

  @Get()
  @Roles('ADMIN', 'CRM', 'CONTRACTOR', 'CLIENT')
  async list(
    @Query('stateCode') stateCode?: string,
    @Query('skillCategory') skillCategory?: string,
    @Query('scheduledEmployment') scheduledEmployment?: string,
  ) {
    const where: any = {};
    if (stateCode) where.stateCode = stateCode.toUpperCase();
    if (skillCategory) where.skillCategory = skillCategory.toUpperCase();
    if (scheduledEmployment) where.scheduledEmployment = scheduledEmployment;
    const data = await this.repo.find({
      where,
      order: { stateCode: 'ASC', skillCategory: 'ASC', effectiveFrom: 'DESC' },
    });
    return { data, total: data.length };
  }

  @Get('lookup')
  @Roles('ADMIN', 'CRM', 'CONTRACTOR', 'CLIENT')
  async lookup(
    @Query('stateCode') stateCode: string,
    @Query('skillCategory') skillCategory: string,
    @Query('onDate') onDate?: string,
    @Query('scheduledEmployment') scheduledEmployment?: string,
  ) {
    return this.svc.lookup(
      stateCode,
      skillCategory,
      onDate,
      scheduledEmployment,
    );
  }

  @Post()
  @Roles('ADMIN', 'CRM')
  async create(@Body() dto: UpsertWageDto) {
    const row = this.repo.create({
      stateCode: dto.stateCode.toUpperCase(),
      skillCategory: dto.skillCategory,
      scheduledEmployment: dto.scheduledEmployment ?? null,
      monthlyWage: Number(dto.monthlyWage),
      dailyWage: dto.dailyWage != null ? Number(dto.dailyWage) : null,
      effectiveFrom: dto.effectiveFrom,
      effectiveTo: dto.effectiveTo ?? null,
      source: dto.source ?? null,
      notes: dto.notes ?? null,
    });
    return this.repo.save(row);
  }

  @Put(':id')
  @Roles('ADMIN', 'CRM')
  async update(@Param('id') id: string, @Body() dto: Partial<UpsertWageDto>) {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) return { error: 'not found' };
    if (dto.stateCode !== undefined)
      row.stateCode = dto.stateCode.toUpperCase();
    if (dto.skillCategory !== undefined) row.skillCategory = dto.skillCategory;
    if (dto.scheduledEmployment !== undefined)
      row.scheduledEmployment = dto.scheduledEmployment ?? null;
    if (dto.monthlyWage !== undefined)
      row.monthlyWage = Number(dto.monthlyWage);
    if (dto.dailyWage !== undefined)
      row.dailyWage = dto.dailyWage != null ? Number(dto.dailyWage) : null;
    if (dto.effectiveFrom !== undefined) row.effectiveFrom = dto.effectiveFrom;
    if (dto.effectiveTo !== undefined)
      row.effectiveTo = dto.effectiveTo ?? null;
    if (dto.source !== undefined) row.source = dto.source ?? null;
    if (dto.notes !== undefined) row.notes = dto.notes ?? null;
    return this.repo.save(row);
  }

  @Delete(':id')
  @Roles('ADMIN', 'CRM')
  async remove(@Param('id') id: string) {
    await this.repo.delete(id);
    return { ok: true };
  }

  /**
   * Bulk-import minimum-wage rows. Idempotent upsert keyed on
   * (state_code, skill_category, COALESCE(scheduled_employment,''), effective_from).
   *
   * Body: { rows: UpsertWageDto[], dryRun?: boolean }
   * Returns per-row outcome: 'inserted' | 'updated' | 'skipped' | 'error'.
   */
  @Post('bulk-import')
  @Roles('ADMIN', 'CRM')
  async bulkImport(@Body() body: { rows: UpsertWageDto[]; dryRun?: boolean }) {
    const rows = Array.isArray(body?.rows) ? body.rows : [];
    if (!rows.length) {
      return {
        total: 0,
        inserted: 0,
        updated: 0,
        skipped: 0,
        errors: 0,
        results: [],
      };
    }
    const dryRun = !!body.dryRun;
    const results: Array<{
      index: number;
      stateCode?: string;
      skillCategory?: string;
      effectiveFrom?: string;
      outcome: 'inserted' | 'updated' | 'skipped' | 'error';
      message?: string;
      id?: string;
    }> = [];
    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      try {
        if (
          !r ||
          !r.stateCode ||
          !r.skillCategory ||
          !r.effectiveFrom ||
          r.monthlyWage == null
        ) {
          throw new Error(
            'stateCode, skillCategory, effectiveFrom and monthlyWage are required',
          );
        }
        const stateCode = String(r.stateCode).toUpperCase().trim();
        const skillCategory = String(r.skillCategory)
          .toUpperCase()
          .trim() as MinimumWageSkill;
        if (
          !['UNSKILLED', 'SEMI_SKILLED', 'SKILLED', 'HIGHLY_SKILLED'].includes(
            skillCategory,
          )
        ) {
          throw new Error(`invalid skillCategory: ${r.skillCategory}`);
        }
        const monthlyWage = Number(r.monthlyWage);
        if (!Number.isFinite(monthlyWage) || monthlyWage <= 0) {
          throw new Error(`invalid monthlyWage: ${r.monthlyWage}`);
        }
        const scheduledEmployment = r.scheduledEmployment ?? null;

        // Find existing row for the natural key.
        const qb = this.repo
          .createQueryBuilder('mw')
          .where('mw.state_code = :sc', { sc: stateCode })
          .andWhere('mw.skill_category = :sk', { sk: skillCategory })
          .andWhere('mw.effective_from = :ef', { ef: r.effectiveFrom });
        if (scheduledEmployment === null) {
          qb.andWhere('mw.scheduled_employment IS NULL');
        } else {
          qb.andWhere('mw.scheduled_employment = :se', {
            se: scheduledEmployment,
          });
        }
        const existing = await qb.getOne();

        if (existing) {
          // Skip if all fields already match.
          const sameMonthly = Number(existing.monthlyWage) === monthlyWage;
          const sameDaily =
            (existing.dailyWage == null ? null : Number(existing.dailyWage)) ===
            (r.dailyWage == null ? null : Number(r.dailyWage));
          const sameEffTo =
            (existing.effectiveTo ?? null) === (r.effectiveTo ?? null);
          const sameSrc = (existing.source ?? null) === (r.source ?? null);
          const sameNotes = (existing.notes ?? null) === (r.notes ?? null);
          if (sameMonthly && sameDaily && sameEffTo && sameSrc && sameNotes) {
            skipped++;
            results.push({
              index: i,
              stateCode,
              skillCategory,
              effectiveFrom: r.effectiveFrom,
              outcome: 'skipped',
              id: existing.id,
            });
            continue;
          }
          if (!dryRun) {
            existing.monthlyWage = monthlyWage;
            existing.dailyWage =
              r.dailyWage != null ? Number(r.dailyWage) : null;
            existing.effectiveTo = r.effectiveTo ?? null;
            existing.source = r.source ?? null;
            existing.notes = r.notes ?? null;
            await this.repo.save(existing);
          }
          updated++;
          results.push({
            index: i,
            stateCode,
            skillCategory,
            effectiveFrom: r.effectiveFrom,
            outcome: 'updated',
            id: existing.id,
          });
        } else {
          let savedId: string | undefined;
          if (!dryRun) {
            const row = this.repo.create({
              stateCode,
              skillCategory,
              scheduledEmployment,
              monthlyWage,
              dailyWage: r.dailyWage != null ? Number(r.dailyWage) : null,
              effectiveFrom: r.effectiveFrom,
              effectiveTo: r.effectiveTo ?? null,
              source: r.source ?? null,
              notes: r.notes ?? null,
            });
            const saved = await this.repo.save(row);
            savedId = saved.id;
          }
          inserted++;
          results.push({
            index: i,
            stateCode,
            skillCategory,
            effectiveFrom: r.effectiveFrom,
            outcome: 'inserted',
            id: savedId,
          });
        }
      } catch (err) {
        errors++;
        results.push({
          index: i,
          stateCode: r?.stateCode,
          skillCategory: r?.skillCategory,
          effectiveFrom: r?.effectiveFrom,
          outcome: 'error',
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return {
      total: rows.length,
      inserted,
      updated,
      skipped,
      errors,
      dryRun,
      results,
    };
  }
}
