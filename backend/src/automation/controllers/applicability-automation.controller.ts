import {
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { ApplicabilityEngineService } from '../services/applicability-engine.service';

@ApiTags('Automation – Applicability')
@ApiBearerAuth('JWT')
@Controller({ path: 'automation/applicability', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'CRM')
export class ApplicabilityAutomationController {
  constructor(private readonly engine: ApplicabilityEngineService) {}

  @ApiOperation({ summary: 'Recompute applicability for a single branch' })
  @Post('branch/:branchId/recompute')
  async recomputeBranch(@Param('branchId', ParseUUIDPipe) branchId: string) {
    return this.engine.recomputeBranchApplicability(branchId);
  }

  @ApiOperation({
    summary: 'Recompute applicability for all branches (manual trigger)',
  })
  @Post('recompute-all')
  async recomputeAll() {
    return this.engine.recomputeAllBranches();
  }
}
