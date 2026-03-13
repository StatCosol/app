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
import { AeUnitActEntity } from './entities/ae-unit-act.entity';
import { AeUnitActProfileEntity } from './entities/ae-unit-act-profile.entity';
import { AeActMasterEntity } from './entities/ae-act-master.entity';

import { ToggleActDto } from './dto/toggle-act.dto';
import { SaveActProfileDto } from './dto/save-act-profile.dto';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@ApiTags('Applicability')
@ApiBearerAuth('JWT')
@Controller({ path: 'units', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'CRM')
export class UnitActsController {
  constructor(
    private readonly ds: DataSource,
    private readonly engine: ApplicabilityEngineService,
  ) {}

  /** List all available acts (master catalog) */
  @ApiOperation({ summary: 'List Acts Catalog' })
  @Get('acts/catalog')
  async listActsCatalog() {
    const repo = this.ds.getRepository(AeActMasterEntity);
    return repo.find({ where: { isActive: true }, order: { name: 'ASC' } });
  }

  /** List act toggles for a unit */
  @ApiOperation({ summary: 'List Unit Acts' })
  @Get(':unitId/acts')
  async listUnitActs(@Param('unitId') unitId: string) {
    const repo = this.ds.getRepository(AeUnitActEntity);
    return repo.find({ where: { unitId } });
  }

  /** Toggle a special act on/off */
  @ApiOperation({ summary: 'Toggle Act' })
  @Post(':unitId/acts/:actCode/toggle')
  async toggleAct(
    @Param('unitId') unitId: string,
    @Param('actCode') actCode: string,
    @Body() dto: ToggleActDto,
  ) {
    const repo = this.ds.getRepository(AeUnitActEntity);
    const row =
      (await repo.findOneBy({ unitId, actCode })) ??
      repo.create({ unitId, actCode });
    row.enabled = dto.enabled;
    row.enabledAt = dto.enabled ? new Date() : null;
    return repo.save(row);
  }

  /** Get act profile data */
  @ApiOperation({ summary: 'Get Act Profile' })
  @Get(':unitId/acts/:actCode/profile')
  async getActProfile(
    @Param('unitId') unitId: string,
    @Param('actCode') actCode: string,
  ) {
    const repo = this.ds.getRepository(AeUnitActProfileEntity);
    return repo.findOneBy({ unitId, actCode });
  }

  /** Save act profile data (license details, worker counts, etc.) */
  @ApiOperation({ summary: 'Save Act Profile' })
  @Put(':unitId/acts/:actCode/profile')
  async saveActProfile(
    @Param('unitId') unitId: string,
    @Param('actCode') actCode: string,
    @Body() dto: SaveActProfileDto,
  ) {
    const repo = this.ds.getRepository(AeUnitActProfileEntity);
    const row =
      (await repo.findOneBy({ unitId, actCode })) ??
      repo.create({ unitId, actCode });
    row.dataJson = dto.dataJson;
    row.updatedAt = new Date();
    return repo.save(row);
  }

  /** Shortcut: recompute applicability for a unit after act change */
  @ApiOperation({ summary: 'Recompute' })
  @Post(':unitId/acts/:actCode/recompute')
  async recompute(@Param('unitId') unitId: string) {
    return this.engine.recompute(unitId);
  }
}
