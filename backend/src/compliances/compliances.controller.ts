import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { CompliancesService } from './compliances.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller({ path: 'admin', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class CompliancesController {
  constructor(private readonly service: CompliancesService) {}

  @Get('compliances')
  findAll() {
    return this.service.findAll();
  }

  @Get('branches/:branchId/compliances')
  getBranchCompliances(@Param('branchId', ParseUUIDPipe) branchId: string) {
    return this.service.getBranchCompliances(branchId);
  }

  @Post('branches/:branchId/compliances')
  saveBranchCompliances(
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Body() dto: { clientId: string; complianceIds: string[] },
    @Req() req: any,
  ) {
    return this.service.saveBranchCompliances(
      branchId,
      dto.clientId,
      dto.complianceIds,
      req?.user?.userId ?? null,
    );
  }

  @Post('branches/:branchId/compliances/recompute')
  recompute(@Param('branchId', ParseUUIDPipe) branchId: string) {
    return this.service.recomputeBranchComplianceApplicability(branchId);
  }
}
