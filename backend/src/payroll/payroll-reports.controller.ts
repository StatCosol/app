import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PayrollReportsService } from './payroll-reports.service';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';

@ApiTags('Payroll')
@ApiBearerAuth('JWT')
@Controller({ path: 'payroll/reports', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('PAYROLL', 'ADMIN')
export class PayrollReportsController {
  constructor(private readonly svc: PayrollReportsService) {}

  /** Download bank statement CSV for a run or period */
  @ApiOperation({ summary: 'Bank Statement' })
  @Get('bank-statement')
  async bankStatement(
    @CurrentUser() user: ReqUser,
    @Res() res: Response,
    @Query('runId') runId?: string,
    @Query('clientId') clientId?: string,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    const result = await this.svc.generateBankStatement(
      user,
      runId,
      clientId,
      year ? parseInt(year, 10) : undefined,
      month ? parseInt(month, 10) : undefined,
    );
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${result.fileName}"`,
    );
    res.end(result.csv);
  }

  /** Download muster roll CSV for a period */
  @ApiOperation({ summary: 'Muster Roll' })
  @Get('muster-roll')
  async musterRoll(
    @CurrentUser() user: ReqUser,
    @Res() res: Response,
    @Query('clientId') clientId?: string,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    const result = await this.svc.generateMusterRoll(
      user,
      clientId,
      year ? parseInt(year, 10) : undefined,
      month ? parseInt(month, 10) : undefined,
    );
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${result.fileName}"`,
    );
    res.end(result.csv);
  }

  /** Download cost analysis CSV */
  @ApiOperation({ summary: 'Cost Analysis' })
  @Get('cost-analysis')
  async costAnalysis(
    @CurrentUser() user: ReqUser,
    @Res() res: Response,
    @Query('clientId') clientId?: string,
    @Query('year') year?: string,
  ) {
    const result = await this.svc.generateCostAnalysis(
      user,
      clientId,
      year ? parseInt(year, 10) : undefined,
    );
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${result.fileName}"`,
    );
    res.end(result.csv);
  }

  /** Download Form 16 / TDS summary CSV */
  @ApiOperation({ summary: 'Form16' })
  @Get('form16')
  async form16(
    @CurrentUser() user: ReqUser,
    @Res() res: Response,
    @Query('clientId') clientId?: string,
    @Query('financialYear') financialYear?: string,
  ) {
    const result = await this.svc.generateForm16Summary(
      user,
      clientId,
      financialYear,
    );
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${result.fileName}"`,
    );
    res.end(result.csv);
  }
}
