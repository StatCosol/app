import { AutomationControlService } from '../control-center.service';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { ReqUser } from '../../access/access-scope.service';
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
@Roles('ADMIN')
export class ApplicabilityAutomationController {
  constructor(
    private readonly engine: ApplicabilityEngineService,
    private readonly controls: AutomationControlService,
  ) {}

  @ApiOperation({ summary: 'Recompute applicability for a single branch' })
  @Post('branch/:branchId/recompute')
  async recomputeBranch(
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @CurrentUser() user: ReqUser,
  ) {
    return this.controls.legacyBranchRun(
      'applicability',
      user.userId || user.id,
      branchId,
    );
  }

  @ApiOperation({
    summary: 'Recompute applicability for all branches (manual trigger)',
  })
  @Post('recompute-all')
  async recomputeAll(@CurrentUser() user: ReqUser) {
    return this.controls.legacyRun('applicability', user.userId || user.id);
  }
}
