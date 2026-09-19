import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AccessScopeService, ReqUser } from '../access/access-scope.service';
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
  constructor(
    private readonly applicability: ComplianceApplicabilityService,
    private readonly access: AccessScopeService,
  ) {}

  @ApiOperation({ summary: 'Recompute' })
  @Get(':branchId/compliances/recompute')
  async recompute(
    @CurrentUser() user: ReqUser,
    @Param('branchId') branchId: string,
  ) {
    // Any CRM could recompute any company's branch.
    await this.access.assertBranchAllowed(user, branchId);
    return this.applicability.recomputeForBranch(branchId);
  }
}
