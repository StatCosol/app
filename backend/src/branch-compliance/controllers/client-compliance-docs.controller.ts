import {
  Controller,
  ForbiddenException,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { BranchComplianceService } from '../branch-compliance.service';
import { ChecklistQueryDto } from '../dto/branch-compliance.dto';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { ReqUser } from '../../access/access-scope.service';

@ApiTags('Branch Compliance')
@ApiBearerAuth('JWT')
@Controller({ path: 'client/branch-compliance', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CLIENT')
export class ClientComplianceDocsController {
  constructor(private readonly svc: BranchComplianceService) {}

  /** Master Client: view all branches' compliance docs */
  @ApiOperation({ summary: 'List' })
  @Get()
  list(@CurrentUser() user: ReqUser, @Query() q: ChecklistQueryDto) {
    return this.svc.listForClient(user, q);
  }

  /**
   * A CLIENT user has exactly one company: the one on their token. These
   * endpoints used to accept `?companyId=` and fall back to the token only when
   * it was absent, so any client could read another company's branch figures —
   * and ScopeGuard never saw it, because it only checks a param named clientId.
   */
  private ownCompany(user: ReqUser): string {
    if (!user.clientId)
      throw new ForbiddenException('No client linked to user');
    return user.clientId;
  }

  /** Dashboard KPIs: branch-wise compliance % */
  @ApiOperation({ summary: 'Dashboard Kpis' })
  @Get('dashboard-kpis')
  dashboardKpis(
    @CurrentUser() user: ReqUser,
    @Query() q: Record<string, string>,
  ) {
    const companyId = this.ownCompany(user);
    const year = q.year ? Number(q.year) : new Date().getFullYear();
    const month = q.month ? Number(q.month) : undefined;
    return this.svc.getClientDashboardKpis(user, companyId, year, month);
  }

  /** Return master list */
  @ApiOperation({ summary: 'Return Master' })
  @Get('return-master')
  returnMaster(@Query() q: Record<string, string>) {
    return this.svc.getReturnMaster(q);
  }

  /** Top 10 lowest compliance branches */
  @ApiOperation({ summary: 'Lowest Branches' })
  @Get('lowest-branches')
  lowestBranches(
    @CurrentUser() user: ReqUser,
    @Query() q: Record<string, string>,
  ) {
    const companyId = this.ownCompany(user);
    const year = q.year ? Number(q.year) : new Date().getFullYear();
    const limit = q.limit ? Number(q.limit) : 10;
    return this.svc.getLowestComplianceBranches(companyId, year, limit);
  }

  /** Company-wide compliance trend (aggregate across all branches) */
  @ApiOperation({ summary: 'Company Trend' })
  @Get('trend')
  companyTrend(
    @CurrentUser() user: ReqUser,
    @Query() q: Record<string, string>,
  ) {
    const companyId = this.ownCompany(user);
    const year = q.year ? Number(q.year) : new Date().getFullYear();
    // Use a special "all-branches" query — pass empty branchId
    return this.svc.getComplianceTrend('', companyId, year);
  }
}
