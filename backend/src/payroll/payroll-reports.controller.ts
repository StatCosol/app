import { Controller, Get, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PayrollReportsService } from './payroll-reports.service';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

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
    @Req() req: any,
    @Res() res: Response,
    @Query('runId') runId?: string,
    @Query('clientId') clientId?: string,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    const result = await this.svc.generateBankStatement(
      req.user,
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
    @Req() req: any,
    @Res() res: Response,
    @Query('clientId') clientId?: string,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    const result = await this.svc.generateMusterRoll(
      req.user,
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
    @Req() req: any,
    @Res() res: Response,
    @Query('clientId') clientId?: string,
    @Query('year') year?: string,
  ) {
    const result = await this.svc.generateCostAnalysis(
      req.user,
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
    @Req() req: any,
    @Res() res: Response,
    @Query('clientId') clientId?: string,
    @Query('financialYear') financialYear?: string,
  ) {
    const result = await this.svc.generateForm16Summary(
      req.user,
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
