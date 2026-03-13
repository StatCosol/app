import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ComplianceApplicabilityService } from './compliance-applicability.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@ApiTags('Compliance')
@ApiBearerAuth('JWT')
@Controller({ path: 'branches', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'CRM')
export class BranchComplianceRecomputeController {
  constructor(private readonly applicability: ComplianceApplicabilityService) {}

  @ApiOperation({ summary: 'Recompute' })
  @Get(':branchId/compliances/recompute')
  async recompute(@Param('branchId') branchId: string) {
    return this.applicability.recomputeForBranch(branchId);
  }
}
