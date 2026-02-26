import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Req,
  ForbiddenException,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ComplianceMetricsService } from './compliance-metrics.service';

@Controller({ path: 'compliance', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'CCO', 'CEO', 'CRM', 'CLIENT')
export class ComplianceMetricsController {
  constructor(private readonly metrics: ComplianceMetricsService) {}

  /**
   * GET /api/v1/compliance/completion?month=YYYY-MM&branchId=...
   *
   * Returns upload completion % per branch.
   * If branchId omitted → all branches for the client.
   * Branch user → only own branch.
   */
  @Get('completion')
  async completion(
    @Query('month') month: string,
    @Query('branchId') branchId: string,
    @Req() req: any,
  ) {
    if (req.user.roleCode === 'AUDITOR') {
      throw new ForbiddenException('Auditor not allowed');
    }

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      const now = new Date();
      month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }

    return this.metrics.getCompletion({
      clientId: req.user.clientId,
      user: req.user,
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
  @Get('completion-trend')
  async trend(
    @Query('branchId') branchId: string,
    @Query('months') months: string,
    @Req() req: any,
  ) {
    if (req.user.roleCode === 'AUDITOR') {
      throw new ForbiddenException('Auditor not allowed');
    }
    return this.metrics.getCompletionTrend({
      clientId: req.user.clientId,
      user: req.user,
      branchId,
      months: Number(months) || 6,
    });
  }

  /**
   * GET /api/v1/compliance/risk-score?month=YYYY-MM&branchId=...
   *
   * Composite "Inspection Exposure Probability" score for a branch.
   */
  @Get('risk-score')
  async riskScore(
    @Query('month') month: string,
    @Query('branchId') branchId: string,
    @Req() req: any,
  ) {
    if (req.user.roleCode === 'AUDITOR') {
      throw new ForbiddenException('Auditor not allowed');
    }

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      const now = new Date();
      month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }

    return this.metrics.getRiskScore({
      clientId: req.user.clientId,
      user: req.user,
      month,
      branchId: branchId || undefined,
    });
  }

  /**
   * GET /api/v1/compliance/risk-ranking?month=YYYY-MM&limit=10
   *
   * Top N highest + lowest risk branches.
   */
  @Get('risk-ranking')
  async riskRanking(
    @Query('month') month: string,
    @Query('limit') limit: string,
    @Req() req: any,
  ) {
    if (req.user.roleCode === 'AUDITOR') {
      throw new ForbiddenException('Auditor not allowed');
    }

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      const now = new Date();
      month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }

    return this.metrics.getRiskRanking({
      clientId: req.user.clientId,
      user: req.user,
      month,
      limit: limit ? Number(limit) : 10,
    });
  }

  /**
   * GET /api/v1/compliance/risk-heatmap?month=YYYY-MM
   *
   * State-wise risk heatmap aggregation.
   */
  @Get('risk-heatmap')
  async heatmap(
    @Query('month') month: string,
    @Req() req: any,
  ) {
    if (req.user.roleCode === 'AUDITOR') {
      throw new ForbiddenException('Auditor not allowed');
    }

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      const now = new Date();
      month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }

    return this.metrics.getRiskHeatmap({
      clientId: req.user.clientId,
      user: req.user,
      month,
    });
  }

  @Get('lowest-branches')
  async lowestBranches(
    @Query('month') month: string,
    @Query('limit') limit: string,
    @Req() req: any,
  ) {
    if (req.user.roleCode === 'AUDITOR') {
      throw new ForbiddenException('Auditor not allowed');
    }

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      const now = new Date();
      month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }

    return this.metrics.getLowestBranches({
      clientId: req.user.clientId,
      user: req.user,
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
  @Get('action-plan')
  async actionPlan(
    @Query('month') month: string,
    @Query('branchId') branchId: string,
    @Req() req: any,
  ) {
    if (req.user.roleCode === 'AUDITOR') {
      throw new ForbiddenException('Auditor not allowed');
    }

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      const now = new Date();
      month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }

    return this.metrics.getActionPlan({
      clientId: req.user.clientId,
      user: req.user,
      month,
      branchId: branchId || '',
    });
  }

  /**
   * GET /api/v1/compliance/risk-forecast?branchId=...&monthsHistory=6
   *
   * Next-month risk prediction using historical trend + live factors.
   */
  @Get('risk-forecast')
  async forecast(
    @Query('branchId') branchId: string,
    @Query('monthsHistory') monthsHistory: string,
    @Req() req: any,
  ) {
    if (req.user.roleCode === 'AUDITOR') {
      throw new ForbiddenException('Auditor not allowed');
    }
    return this.metrics.getRiskForecast({
      clientId: req.user.clientId,
      user: req.user,
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
  @Get('summary')
  async summary(
    @Query('month') month: string,
    @Query('branchId') branchId: string,
    @Req() req: any,
  ) {
    if (req.user.roleCode === 'AUDITOR') {
      throw new ForbiddenException('Auditor not allowed');
    }

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      const now = new Date();
      month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }

    return this.metrics.getSummary({
      clientId: req.user.clientId,
      user: req.user,
      month,
      branchId: branchId || undefined,
    });
  }

  /**
   * GET /api/v1/compliance/benchmark?month=YYYY-MM
   *
   * Internal peer benchmark — percentile ranks + A/B/C/D grades.
   */
  @Get('benchmark')
  async benchmark(
    @Query('month') month: string,
    @Req() req: any,
  ) {
    if (req.user.roleCode === 'AUDITOR') {
      throw new ForbiddenException('Auditor not allowed');
    }

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      const now = new Date();
      month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }

    return this.metrics.getBenchmark({
      clientId: req.user.clientId,
      user: req.user,
      month,
    });
  }

  /**
   * POST /api/v1/compliance/simulate-risk
   *
   * Inspection simulation — what-if scenario analysis.
   */
  @Post('simulate-risk')
  async simulateRisk(
    @Body() body: {
      month: string;
      branchId: string;
      completionPercent: number;
      overdueSla: number;
      expiringRegistrations: boolean;
      highCritical: number;
    },
    @Req() req: any,
  ) {
    if (req.user.roleCode === 'AUDITOR') {
      throw new ForbiddenException('Auditor not allowed');
    }

    return this.metrics.simulateRisk({
      clientId: req.user.clientId,
      user: req.user,
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
  @Get('export-pack')
  async exportPack(
    @Query('month') month: string,
    @Req() req: any,
  ) {
    if (req.user.roleCode === 'AUDITOR') {
      throw new ForbiddenException('Auditor not allowed');
    }

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      const now = new Date();
      month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }

    return this.metrics.getExportPack({
      clientId: req.user.clientId,
      user: req.user,
      month,
    });
  }
}
