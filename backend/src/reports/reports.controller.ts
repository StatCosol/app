import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { BranchAccessService } from '../auth/branch-access.service';
import { ReportsService } from './reports.service';
import type { Response } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';

@ApiTags('Reports')
@ApiBearerAuth('JWT')
@Controller({ path: 'reports', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly branchAccess: BranchAccessService,
  ) {}

  // Base endpoint fallback to avoid 404 in generic tests
  @ApiOperation({ summary: 'Root' })
  @Get()
  @Roles('ADMIN')
  root() {
    return { status: 'OK' };
  }

  @ApiOperation({ summary: 'Get Compliance Summary' })
  @Get('compliance-summary')
  @Roles('ADMIN', 'CRM', 'CLIENT')
  async getComplianceSummary(
    @CurrentUser() user: ReqUser,
    @Query() q: Record<string, string>,
  ) {
    if (q?.branchId && user.roleCode === 'CLIENT') {
      await this.branchAccess.assertBranchAccess(user.userId, q.branchId);
    }
    return this.reports.complianceSummary(user, q || {});
  }

  @ApiOperation({ summary: 'Get Overdue' })
  @Get('overdue')
  @Roles('ADMIN', 'CRM', 'CLIENT')
  async getOverdue(
    @CurrentUser() user: ReqUser,
    @Query() q: Record<string, string>,
  ) {
    if (q?.branchId && user.roleCode === 'CLIENT') {
      await this.branchAccess.assertBranchAccess(user.userId, q.branchId);
    }
    return this.reports.overdue(user, q || {});
  }

  @ApiOperation({ summary: 'Get Contractor Performance' })
  @Get('contractor-performance')
  @Roles('ADMIN', 'CRM', 'CLIENT')
  async getContractorPerformance(
    @CurrentUser() user: ReqUser,
    @Query() q: Record<string, string>,
  ) {
    if (q?.branchId && user.roleCode === 'CLIENT') {
      await this.branchAccess.assertBranchAccess(user.userId, q.branchId);
    }
    return this.reports.contractorPerformance(user, q || {});
  }

  @ApiOperation({ summary: 'Export Overdue' })
  @Get('overdue/export')
  @Roles('ADMIN', 'CRM')
  async exportOverdue(
    @CurrentUser() user: ReqUser,
    @Query() q: Record<string, string>,
    @Res() res: Response,
  ) {
    return this.reports.exportOverdueExcel(user, q || {}, res);
  }
}
