import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Res,
  ForbiddenException,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { BranchAccessService } from '../auth/branch-access.service';
import { ComplianceMetricsService } from './compliance-metrics.service';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';

@ApiTags('Compliance')
@ApiBearerAuth('JWT')
@Controller({ path: 'compliance', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'CCO', 'CEO', 'CRM', 'CLIENT')
export class ComplianceMetricsController {
  constructor(
    private readonly metrics: ComplianceMetricsService,
    private readonly branchAccess: BranchAccessService,
  ) {}

  /**
   * GET /api/v1/compliance/completion?month=YYYY-MM&branchId=...
   *
   * Returns upload completion % per branch.
   * If branchId omitted → all branches for the client.
   * Branch user → only own branch.
   */
  @ApiOperation({ summary: 'Completion' })
  @Get('completion')
  async completion(
    @Query('month') month: string,
    @Query('branchId') branchId: string,
    @CurrentUser() user: ReqUser,
  ) {
    if (user.roleCode === 'AUDITOR') {
      throw new ForbiddenException('Auditor not allowed');
    }

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      const now = new Date();
      month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }

    return this.metrics.getCompletion({
      clientId: user.clientId!,
      user: user,
      month,
      branchId: branchId || undefined,
    });
  }

  /**
   * GET /api/v1/compliance/lowest-branches?month=YYYY-MM&limit=10
   *
   * Returns top N branches with lowest completion %.
   * For Admin / CRM / Client dashboard widgets.
   */
  /**
   * GET /api/v1/compliance/completion-trend?branchId=...&months=6
   *
   * Returns last N months completion % for a specific branch.
   */
  @ApiOperation({ summary: 'Trend' })
  @Get('completion-trend')
  async trend(
    @Query('branchId') branchId: string,
    @Query('months') months: string,
    @CurrentUser() user: ReqUser,
  ) {
    if (user.roleCode === 'AUDITOR') {
      throw new ForbiddenException('Auditor not allowed');
    }
    return this.metrics.getCompletionTrend({
      clientId: user.clientId!,
      user: user,
      branchId,
      months: Number(months) || 6,
    });
  }

  /**
   * GET /api/v1/compliance/risk-score?month=YYYY-MM&branchId=...
   *
   * Composite "Inspection Exposure Probability" score for a branch.
   */
  @ApiOperation({ summary: 'Risk Score' })
  @Get('risk-score')
  async riskScore(
    @Query('month') month: string,
    @Query('branchId') branchId: string,
    @CurrentUser() user: ReqUser,
  ) {
    if (user.roleCode === 'AUDITOR') {
      throw new ForbiddenException('Auditor not allowed');
    }

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      const now = new Date();
      month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }

    return this.metrics.getRiskScore({
      clientId: user.clientId!,
      user: user,
      month,
      branchId: branchId || undefined,
    });
  }

  /**
   * GET /api/v1/compliance/risk-ranking?month=YYYY-MM&limit=10
   *
   * Top N highest + lowest risk branches.
   */
  @ApiOperation({ summary: 'Risk Ranking' })
  @Get('risk-ranking')
  async riskRanking(
    @Query('month') month: string,
    @Query('limit') limit: string,
    @CurrentUser() user: ReqUser,
  ) {
    if (user.roleCode === 'AUDITOR') {
      throw new ForbiddenException('Auditor not allowed');
    }

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      const now = new Date();
      month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }

    return this.metrics.getRiskRanking({
      clientId: user.clientId!,
      user: user,
      month,
      limit: limit ? Number(limit) : 10,
    });
  }

  /**
   * GET /api/v1/compliance/risk-heatmap?month=YYYY-MM
   *
   * State-wise risk heatmap aggregation.
   */
  @ApiOperation({ summary: 'Heatmap' })
  @Get('risk-heatmap')
  async heatmap(@Query('month') month: string, @CurrentUser() user: ReqUser) {
    if (user.roleCode === 'AUDITOR') {
      throw new ForbiddenException('Auditor not allowed');
    }

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      const now = new Date();
      month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }

    return this.metrics.getRiskHeatmap({
      clientId: user.clientId!,
      user: user,
      month,
    });
  }

  @ApiOperation({ summary: 'Lowest Branches' })
  @Get('lowest-branches')
  async lowestBranches(
    @Query('month') month: string,
    @Query('limit') limit: string,
    @CurrentUser() user: ReqUser,
  ) {
    if (user.roleCode === 'AUDITOR') {
      throw new ForbiddenException('Auditor not allowed');
    }

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      const now = new Date();
      month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }

    return this.metrics.getLowestBranches({
      clientId: user.clientId!,
      user: user,
      month,
      limit: limit ? Number(limit) : 10,
    });
  }

  /**
   * GET /api/v1/compliance/action-plan?month=YYYY-MM&branchId=...
   *
   * Smart "What To Fix" action plan for a specific branch.
   * Returns prioritised remediation steps with estimated impact.
   */
  @ApiOperation({ summary: 'Action Plan' })
  @Get('action-plan')
  async actionPlan(
    @Query('month') month: string,
    @Query('branchId') branchId: string,
    @CurrentUser() user: ReqUser,
  ) {
    if (user.roleCode === 'AUDITOR') {
      throw new ForbiddenException('Auditor not allowed');
    }

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      const now = new Date();
      month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }

    return this.metrics.getActionPlan({
      clientId: user.clientId!,
      user: user,
      month,
      branchId: branchId || '',
    });
  }

  /**
   * GET /api/v1/compliance/risk-forecast?branchId=...&monthsHistory=6
   *
   * Next-month risk prediction using historical trend + live factors.
   */
  @ApiOperation({ summary: 'Forecast' })
  @Get('risk-forecast')
  async forecast(
    @Query('branchId') branchId: string,
    @Query('monthsHistory') monthsHistory: string,
    @CurrentUser() user: ReqUser,
  ) {
    if (user.roleCode === 'AUDITOR') {
      throw new ForbiddenException('Auditor not allowed');
    }
    return this.metrics.getRiskForecast({
      clientId: user.clientId!,
      user: user,
      branchId,
      monthsHistory: Number(monthsHistory) || 6,
    });
  }

  /**
   * GET /api/v1/compliance/summary?month=YYYY-MM&branchId=...
   *
   * AI-style compliance summary narrative.
   * branchId omitted → company-wide executive summary.
   */
  @ApiOperation({ summary: 'Summary' })
  @Get('summary')
  async summary(
    @Query('month') month: string,
    @Query('branchId') branchId: string,
    @CurrentUser() user: ReqUser,
  ) {
    if (user.roleCode === 'AUDITOR') {
      throw new ForbiddenException('Auditor not allowed');
    }

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      const now = new Date();
      month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }

    return this.metrics.getSummary({
      clientId: user.clientId!,
      user: user,
      month,
      branchId: branchId || undefined,
    });
  }

  /**
   * GET /api/v1/compliance/benchmark?month=YYYY-MM
   *
   * Internal peer benchmark — percentile ranks + A/B/C/D grades.
   */
  @ApiOperation({ summary: 'Benchmark' })
  @Get('benchmark')
  async benchmark(@Query('month') month: string, @CurrentUser() user: ReqUser) {
    if (user.roleCode === 'AUDITOR') {
      throw new ForbiddenException('Auditor not allowed');
    }

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      const now = new Date();
      month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }

    return this.metrics.getBenchmark({
      clientId: user.clientId!,
      user: user,
      month,
    });
  }

  /**
   * POST /api/v1/compliance/simulate-risk
   *
   * Inspection simulation — what-if scenario analysis.
   */
  @ApiOperation({ summary: 'Simulate Risk' })
  @Post('simulate-risk')
  async simulateRisk(
    @Body()
    body: {
      month: string;
      branchId: string;
      completionPercent: number;
      overdueSla: number;
      expiringRegistrations: boolean;
      highCritical: number;
    },
    @CurrentUser() user: ReqUser,
  ) {
    if (user.roleCode === 'AUDITOR') {
      throw new ForbiddenException('Auditor not allowed');
    }
    if (body.branchId && user.roleCode === 'CLIENT') {
      await this.branchAccess.assertBranchAccess(user.userId, body.branchId);
    }

    return this.metrics.simulateRisk({
      clientId: user.clientId!,
      user: user,
      month: body.month,
      branchId: body.branchId,
      completionPercent: body.completionPercent ?? 100,
      overdueSla: body.overdueSla ?? 0,
      expiringRegistrations: body.expiringRegistrations ?? false,
      highCritical: body.highCritical ?? 0,
    });
  }

  /**
   * GET /api/v1/compliance/export-pack?month=YYYY-MM
   *
   * Executive report pack — bundled JSON for PDF/PPT generation.
   */
  @ApiOperation({ summary: 'Export Pack' })
  @Get('export-pack')
  async exportPack(
    @Query('month') month: string,
    @CurrentUser() user: ReqUser,
  ) {
    if (user.roleCode === 'AUDITOR') {
      throw new ForbiddenException('Auditor not allowed');
    }

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      const now = new Date();
      month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }

    return this.metrics.getExportPack({
      clientId: user.clientId!,
      user: user,
      month,
    });
  }

  /**
   * GET /api/v1/compliance/export-pack/xlsx?month=YYYY-MM
   *
   * Executive report pack as downloadable XLSX file.
   */
  @ApiOperation({ summary: 'Export Pack XLSX' })
  @Get('export-pack/xlsx')
  async exportPackXlsx(
    @Query('month') month: string,
    @CurrentUser() user: ReqUser,
    @Res() res: Response,
  ) {
    if (user.roleCode === 'AUDITOR') {
      throw new ForbiddenException('Auditor not allowed');
    }

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      const now = new Date();
      month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }

    const data = await this.metrics.getExportPack({
      clientId: user.clientId!,
      user: user,
      month,
    });

    const buffer = await this.metrics.buildExportPackXlsx(data, month);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="compliance-report-${month}.xlsx"`,
    );
    res.end(buffer);
  }
}
