import {
  Controller,
  Get,
  Put,
  Post,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UnitsFactsService } from './services/units-facts.service';
import { ApplicabilityEngineService } from './services/applicability-engine.service';
import { UnitApplicabilityService } from './services/unit-applicability.service';
import { UnitFactsDto } from './dto/unit-facts.dto';
import { RecomputeDto } from './dto/recompute.dto';
import { SaveApplicableDto } from './dto/save-applicable.dto';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';

@ApiTags('Units')
@ApiBearerAuth('JWT')
@Controller({ path: 'units', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'CRM', 'CLIENT')
export class UnitsController {
  constructor(
    private readonly factsSvc: UnitsFactsService,
    private readonly engineSvc: ApplicabilityEngineService,
    private readonly applicabilitySvc: UnitApplicabilityService,
  ) {}

  /** GET /api/v1/units/:branchId/facts */
  @ApiOperation({ summary: 'Get Facts' })
  @Get(':branchId/facts')
  getFacts(@Param('branchId') branchId: string) {
    return this.factsSvc.getFacts(branchId);
  }

  /** PUT /api/v1/units/:branchId/facts */
  @ApiOperation({ summary: 'Upsert Facts' })
  @Put(':branchId/facts')
  upsertFacts(
    @Param('branchId') branchId: string,
    @Body() dto: UnitFactsDto,
    @CurrentUser() user: ReqUser,
  ) {
    return this.factsSvc.upsertFacts(branchId, dto, user?.id ?? null);
  }

  /** POST /api/v1/units/:branchId/recompute */
  @ApiOperation({ summary: 'Recompute' })
  @Post(':branchId/recompute')
  recompute(
    @Param('branchId') branchId: string,
    @Body() dto: RecomputeDto,
    @CurrentUser() user: ReqUser,
  ) {
    return this.engineSvc.recompute(
      branchId,
      dto.packageId,
      user?.id ?? null,
      dto.onDate,
    );
  }

  /** GET /api/v1/units/:branchId/applicable */
  @ApiOperation({ summary: 'Get Applicable' })
  @Get(':branchId/applicable')
  getApplicable(@Param('branchId') branchId: string) {
    return this.applicabilitySvc.getApplicable(branchId);
  }

  /** PUT /api/v1/units/:branchId/applicable */
  @ApiOperation({ summary: 'Save Applicable' })
  @Put(':branchId/applicable')
  async saveApplicable(
    @Param('branchId') branchId: string,
    @Body() dto: SaveApplicableDto,
    @CurrentUser() user: ReqUser,
  ) {
    const actorUserId = user?.id ?? null;

    // 1. Recompute AUTO rules
    const recomputeResult = await this.engineSvc.recompute(
      branchId,
      dto.packageId,
      actorUserId,
    );

    // 2. Set special act selections
    let specialResult: unknown[] = [];
    if (dto.selectedSpecialActCodes?.length) {
      specialResult = await this.applicabilitySvc.setSpecialActs(
        branchId,
        dto.selectedSpecialActCodes,
        actorUserId,
      );
    }

    // 3. Apply manual overrides
    let overrideResult: unknown[] = [];
    if (dto.overrides?.length) {
      overrideResult = await this.applicabilitySvc.applyOverrides(
        branchId,
        dto.overrides,
        actorUserId,
      );
    }

    return {
      recompute: recomputeResult,
      specialActs: specialResult.length,
      overrides: overrideResult.length,
    };
  }
}
