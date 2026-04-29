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
}
