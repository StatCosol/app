import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { DataSource } from 'typeorm';

import { ApplicabilityEngineService } from './engine/applicability-engine.service';
import { AeUnitEntity } from './entities/ae-unit.entity';
import { AeUnitFactsEntity } from './entities/ae-unit-facts.entity';
import { AeUnitComplianceOverrideEntity } from './entities/ae-unit-compliance-override.entity';
import { AeUnitTaskEntity } from './entities/ae-unit-task.entity';

import { CreateUnitDto } from './dto/create-unit.dto';
import { UpsertFactsDto } from './dto/upsert-facts.dto';
import { SetOverrideDto } from './dto/set-override.dto';
import { EstablishmentType, PlantType } from './entities/enums';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@ApiTags('Applicability')
@ApiBearerAuth('JWT')
@Controller({ path: 'units', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'CRM')
export class ApplicabilityController {
  constructor(
    private readonly engine: ApplicabilityEngineService,
    private readonly ds: DataSource,
  ) {}

  /* ─── Unit CRUD ─── */

  @ApiOperation({ summary: 'Create Unit' })
  @Post()
  async createUnit(@Body() dto: CreateUnitDto) {
    const repo = this.ds.getRepository(AeUnitEntity);
    const unit = repo.create({
      tenantId: dto.tenantId,
      unitType: dto.unitType,
      name: dto.name,
      state: dto.state ?? null,
      establishmentType:
        dto.establishmentType ?? EstablishmentType.ESTABLISHMENT,
      plantType: dto.plantType ?? PlantType.NA,
      branchId: dto.branchId ?? null,
    });
    return repo.save(unit);
  }

  @ApiOperation({ summary: 'Get Unit' })
  @Get(':unitId')
  async getUnit(@Param('unitId') unitId: string) {
    const repo = this.ds.getRepository(AeUnitEntity);
    return repo.findOneByOrFail({ id: unitId });
  }

  /* ─── Facts ─── */

  @ApiOperation({ summary: 'Upsert Facts' })
  @Put(':unitId/facts')
  async upsertFacts(
    @Param('unitId') unitId: string,
    @Body() dto: UpsertFactsDto,
  ) {
    const repo = this.ds.getRepository(AeUnitFactsEntity);
    const existing = await repo.findOneBy({ unitId });
    if (!existing) {
      return repo.save(
        repo.create({
          unitId,
          factsJson: dto.factsJson,
          factsVersion: 1,
          updatedBy: dto.updatedBy ?? null,
        }),
      );
    }
    existing.factsJson = dto.factsJson;
    existing.factsVersion = (existing.factsVersion ?? 1) + 1;
    existing.updatedAt = new Date();
    existing.updatedBy = dto.updatedBy ?? null;
    return repo.save(existing);
  }

  @ApiOperation({ summary: 'Get Facts' })
  @Get(':unitId/facts')
  async getFacts(@Param('unitId') unitId: string) {
    const repo = this.ds.getRepository(AeUnitFactsEntity);
    return repo.findOneBy({ unitId });
  }

  /* ─── Engine ─── */

  @ApiOperation({ summary: 'Recompute' })
  @Post(':unitId/recompute')
  async recompute(@Param('unitId') unitId: string) {
    return this.engine.recompute(unitId);
  }

  @ApiOperation({ summary: 'Get Applicability' })
  @Get(':unitId/applicability')
  async getApplicability(@Param('unitId') unitId: string) {
    return this.engine.getApplicability(unitId);
  }

  /* ─── Overrides (Admin only) ─── */

  @ApiOperation({ summary: 'Set Override' })
  @Put(':unitId/compliances/:complianceId/override')
  @Roles('ADMIN')
  async setOverride(
    @Param('unitId') unitId: string,
    @Param('complianceId') complianceId: string,
    @Body() dto: SetOverrideDto,
  ) {
    const repo = this.ds.getRepository(AeUnitComplianceOverrideEntity);
    const row =
      (await repo.findOneBy({ unitId, complianceId })) ??
      repo.create({ unitId, complianceId });
    row.forceApplicable = dto.forceApplicable ?? null;
    row.forceNotApplicable = dto.forceNotApplicable ?? null;
    row.locked = dto.locked ?? null;
    row.reason = dto.reason ?? null;
    row.setAt = new Date();
    return repo.save(row);
  }

  /* ─── Tasks ─── */

  @ApiOperation({ summary: 'Get Tasks' })
  @Get(':unitId/tasks')
  async getTasks(@Param('unitId') unitId: string) {
    const repo = this.ds.getRepository(AeUnitTaskEntity);
    return repo.find({ where: { unitId }, order: { dueDate: 'ASC' } });
  }

  @ApiOperation({ summary: 'Submit Task' })
  @Post('tasks/:taskId/submit')
  async submitTask(@Param('taskId') taskId: string) {
    const repo = this.ds.getRepository(AeUnitTaskEntity);
    await repo.update(taskId, { status: 'SUBMITTED' as any });
    return { success: true };
  }

  @ApiOperation({ summary: 'Approve Task' })
  @Post('tasks/:taskId/approve')
  @Roles('ADMIN', 'CRM')
  async approveTask(@Param('taskId') taskId: string) {
    const repo = this.ds.getRepository(AeUnitTaskEntity);
    await repo.update(taskId, { status: 'APPROVED' as any });
    return { success: true };
  }

  @ApiOperation({ summary: 'Return Task' })
  @Post('tasks/:taskId/return')
  @Roles('ADMIN', 'CRM')
  async returnTask(@Param('taskId') taskId: string) {
    const repo = this.ds.getRepository(AeUnitTaskEntity);
    await repo.update(taskId, { status: 'RETURNED' as any });
    return { success: true };
  }
}
