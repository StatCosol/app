import { Controller, Get, Res, UseGuards } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { ReportExportService } from './report-export.service';
import type { Response } from 'express';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'CEO', 'CCO')
@Controller({ path: 'reports/export', version: '1' })
export class ReportExportController {
  constructor(private readonly svc: ReportExportService) {}

  @Get('compliance.xlsx')
  compliance(@Res() res: Response) {
    return this.svc.exportComplianceCoverage(res);
  }

  @Get('audits-overdue.xlsx')
  audits(@Res() res: Response) {
    return this.svc.exportOverdueAudits(res);
  }

  @Get('assignments-health.xlsx')
  assignments(@Res() res: Response) {
    return this.svc.exportAssignmentHealth(res);
  }
}
