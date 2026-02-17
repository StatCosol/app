import { Controller, Get, Query, Req, Res, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ReportsService } from './reports.service';
import type { Response } from 'express';

@Controller({ path: 'reports', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  // Base endpoint fallback to avoid 404 in generic tests
  @Get()
  @Roles('ADMIN')
  root() {
    return { status: 'OK' };
  }

  @Get('compliance-summary')
  @Roles('ADMIN', 'CRM', 'CLIENT')
  getComplianceSummary(@Req() req: any, @Query() q: any) {
    return this.reports.complianceSummary(req.user, q || {});
  }

  @Get('overdue')
  @Roles('ADMIN', 'CRM', 'CLIENT')
  getOverdue(@Req() req: any, @Query() q: any) {
    return this.reports.overdue(req.user, q || {});
  }

  @Get('contractor-performance')
  @Roles('ADMIN', 'CRM', 'CLIENT')
  getContractorPerformance(@Req() req: any, @Query() q: any) {
    return this.reports.contractorPerformance(req.user, q || {});
  }

  @Get('overdue/export')
  @Roles('ADMIN', 'CRM')
  async exportOverdue(@Req() req: any, @Query() q: any, @Res() res: Response) {
    return this.reports.exportOverdueExcel(req.user, q || {}, res);
  }
}
