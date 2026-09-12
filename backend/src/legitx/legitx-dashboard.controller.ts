import {
  Controller,
  ForbiddenException,
  Get,
  Query,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { LegitxDashboardService } from './legitx-dashboard.service';
import { DashboardQueryDto } from './dto/dashboard-query.dto';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';
import { LegitxScopeService } from './legitx-scope.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(
  'CLIENT',
  'BRANCH_DESK',
  'CEO',
  'CCO',
  'CRM',
  'AUDITOR',
  'PAYROLL',
  'ADMIN',
)
@ApiTags('Compliance')
@ApiBearerAuth('JWT')
@Controller({ path: 'legitx/dashboard', version: '1' })
export class LegitxDashboardController {
  constructor(
    private readonly dashboardService: LegitxDashboardService,
    private readonly scopeService: LegitxScopeService,
  ) {}
  private async scopedSummary(user: ReqUser, query: DashboardQueryDto) {
    const scope = await this.scopeService.resolve(user, query);
    if (!scope.clientId)
      throw new ForbiddenException('A company or branch is required');
    return this.dashboardService.getSummary(
      user.id,
      { ...query, branchId: scope.branchId || undefined },
      scope.clientId,
      scope.allowedBranchIds,
    );
  }

  @ApiOperation({ summary: 'Base' })
  @Get()
  async base(
    @CurrentUser() user: ReqUser,
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: DashboardQueryDto,
  ) {
    return this.scopedSummary(user, query);
  }

  @ApiOperation({ summary: 'Summary' })
  @Get('summary')
  async summary(
    @CurrentUser() user: ReqUser,
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: DashboardQueryDto,
  ) {
    return this.scopedSummary(user, query);
  }
}
