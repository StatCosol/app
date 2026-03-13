import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { BranchComplianceService } from '../branch-compliance.service';
import { ChecklistQueryDto } from '../dto/branch-compliance.dto';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

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
  list(@Req() req: any, @Query() q: ChecklistQueryDto) {
    return this.svc.listForClient(req.user, q);
  }

  /** Dashboard KPIs: branch-wise compliance % */
  @ApiOperation({ summary: 'Dashboard Kpis' })
  @Get('dashboard-kpis')
  dashboardKpis(@Req() req: any, @Query() q: any) {
    const companyId = q.companyId || req.user.clientId;
    const year = q.year ? Number(q.year) : new Date().getFullYear();
    const month = q.month ? Number(q.month) : undefined;
    return this.svc.getClientDashboardKpis(req.user, companyId, year, month);
  }

  /** Return master list */
  @ApiOperation({ summary: 'Return Master' })
  @Get('return-master')
  returnMaster(@Query() q: any) {
    return this.svc.getReturnMaster(q);
  }

  /** Top 10 lowest compliance branches */
  @ApiOperation({ summary: 'Lowest Branches' })
  @Get('lowest-branches')
  lowestBranches(@Req() req: any, @Query() q: any) {
    const companyId = q.companyId || req.user.clientId;
    const year = q.year ? Number(q.year) : new Date().getFullYear();
    const limit = q.limit ? Number(q.limit) : 10;
    return this.svc.getLowestComplianceBranches(companyId, year, limit);
  }

  /** Company-wide compliance trend (aggregate across all branches) */
  @ApiOperation({ summary: 'Company Trend' })
  @Get('trend')
  companyTrend(@Req() req: any, @Query() q: any) {
    const companyId = q.companyId || req.user.clientId;
    const year = q.year ? Number(q.year) : new Date().getFullYear();
    // Use a special "all-branches" query — pass empty branchId
    return this.svc.getComplianceTrend('', companyId, year);
  }
}
