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
import { BranchAccessService } from '../auth/branch-access.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CLIENT', 'BRANCH', 'CEO', 'CCO', 'CRM', 'AUDITOR', 'PAYROLL', 'ADMIN')
@ApiTags('Compliance')
@ApiBearerAuth('JWT')
@Controller({ path: 'legitx/dashboard', version: '1' })
export class LegitxDashboardController {
  constructor(
    private readonly dashboardService: LegitxDashboardService,
    private readonly branchAccess: BranchAccessService,
  ) {}

  /**
   * If the caller carries a clientId on their JWT (CLIENT/BRANCH/PAYROLL,
   * and CRM/AUDITOR scoped to a single client), make sure any branchId
   * supplied in the query string actually belongs to one of their mapped
   * branches in that client. Without this guard, a low-privilege CLIENT
   * user could pass another tenant's branch UUID and read its dashboard
   * slices.
   */
  private async assertBranchScope(
    user: ReqUser,
    branchId?: string,
  ): Promise<void> {
    if (!branchId) return;
    if (!user?.clientId) return; // staff roles (CEO/CCO/ADMIN) without tenant
    const allowed = await this.branchAccess.getAllowedBranchIds(
      user.userId,
      user.clientId,
    );
    if (allowed !== 'ALL' && !allowed.includes(branchId)) {
      throw new ForbiddenException('You do not have access to this branch');
    }
  }

  @ApiOperation({ summary: 'Base' })
  @Get()
  async base(
    @CurrentUser() user: ReqUser,
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: DashboardQueryDto,
  ) {
    await this.assertBranchScope(user, query.branchId);
    return this.dashboardService.getSummary(
      user?.id,
      query,
      user?.clientId ?? null,
    );
  }

  @ApiOperation({ summary: 'Summary' })
  @Get('summary')
  async summary(
    @CurrentUser() user: ReqUser,
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: DashboardQueryDto,
  ) {
    await this.assertBranchScope(user, query.branchId);
    return this.dashboardService.getSummary(
      user?.id,
      query,
      user?.clientId ?? null,
    );
  }
}
