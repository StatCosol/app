import { Controller, Get, Res, UseGuards } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { ReportExportService } from './report-export.service';
import type { Response } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';
import { OperationalScopeService } from '../access/operational-scope.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'CEO', 'CCO')
@ApiTags('Reports')
@ApiBearerAuth('JWT')
@Controller({ path: 'reports/export', version: '1' })
export class ReportExportController {
  constructor(
    private readonly svc: ReportExportService,
    private readonly scope: OperationalScopeService,
  ) {}

  private async clientIds(user: ReqUser): Promise<string[] | null> {
    const scope = await this.scope.resolve(user);
    return scope.level === 'clients' ? (scope.clientIds ?? []) : null;
  }

  @ApiOperation({ summary: 'Compliance' })
  @Get('compliance.xlsx')
  async compliance(@CurrentUser() user: ReqUser, @Res() res: Response) {
    return this.svc.exportComplianceCoverage(res, await this.clientIds(user));
  }

  @ApiOperation({ summary: 'Audits' })
  @Get('audits-overdue.xlsx')
  async audits(@CurrentUser() user: ReqUser, @Res() res: Response) {
    return this.svc.exportOverdueAudits(res, await this.clientIds(user));
  }

  @ApiOperation({ summary: 'Assignments' })
  @Get('assignments-health.xlsx')
  async assignments(@CurrentUser() user: ReqUser, @Res() res: Response) {
    return this.svc.exportAssignmentHealth(res, await this.clientIds(user));
  }
}
