import { Controller, Get, Res, UseGuards } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { ReportExportService } from './report-export.service';
import type { Response } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'CEO', 'CCO')
@ApiTags('Reports')
@ApiBearerAuth('JWT')
@Controller({ path: 'reports/export', version: '1' })
export class ReportExportController {
  constructor(private readonly svc: ReportExportService) {}

  @ApiOperation({ summary: 'Compliance' })
  @Get('compliance.xlsx')
  compliance(@Res() res: Response) {
    return this.svc.exportComplianceCoverage(res);
  }

  @ApiOperation({ summary: 'Audits' })
  @Get('audits-overdue.xlsx')
  audits(@Res() res: Response) {
    return this.svc.exportOverdueAudits(res);
  }

  @ApiOperation({ summary: 'Assignments' })
  @Get('assignments-health.xlsx')
  assignments(@Res() res: Response) {
    return this.svc.exportAssignmentHealth(res);
  }
}
