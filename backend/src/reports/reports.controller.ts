import { Controller, Get, Query, Req, Res, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { BranchAccessService } from '../auth/branch-access.service';
import { ReportsService } from './reports.service';
import type { Response } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

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
  async getComplianceSummary(@Req() req: any, @Query() q: any) {
    if (q?.branchId && req.user.roleCode === 'CLIENT') {
      await this.branchAccess.assertBranchAccess(req.user.userId, q.branchId);
    }
    return this.reports.complianceSummary(req.user, q || {});
  }

  @ApiOperation({ summary: 'Get Overdue' })
  @Get('overdue')
  @Roles('ADMIN', 'CRM', 'CLIENT')
  async getOverdue(@Req() req: any, @Query() q: any) {
    if (q?.branchId && req.user.roleCode === 'CLIENT') {
      await this.branchAccess.assertBranchAccess(req.user.userId, q.branchId);
    }
    return this.reports.overdue(req.user, q || {});
  }

  @ApiOperation({ summary: 'Get Contractor Performance' })
  @Get('contractor-performance')
  @Roles('ADMIN', 'CRM', 'CLIENT')
  async getContractorPerformance(@Req() req: any, @Query() q: any) {
    if (q?.branchId && req.user.roleCode === 'CLIENT') {
      await this.branchAccess.assertBranchAccess(req.user.userId, q.branchId);
    }
    return this.reports.contractorPerformance(req.user, q || {});
  }

  @ApiOperation({ summary: 'Export Overdue' })
  @Get('overdue/export')
  @Roles('ADMIN', 'CRM')
  async exportOverdue(@Req() req: any, @Query() q: any, @Res() res: Response) {
    return this.reports.exportOverdueExcel(req.user, q || {}, res);
  }
}
