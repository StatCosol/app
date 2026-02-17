import { Controller, Get, Query, UseGuards, Req } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AuditorDashboardService } from './auditor-dashboard.service';

/**
 * Auditor Dashboard Controller
 * Endpoints for auditor execution dashboard
 * Requires AUDITOR role
 * ⚠️ CRITICAL: All queries are scoped to auditor's assigned audits via req.user.id
 */
@Controller({ path: 'auditor/dashboard', version: '1' })
@UseGuards(RolesGuard)
@Roles('AUDITOR')
export class AuditorDashboardController {
  constructor(private readonly dashboardService: AuditorDashboardService) {}

  /**
   * GET /api/auditor/dashboard/summary
   * Returns auditor execution KPIs: assigned audits, overdue, due soon, observations, high-risk, reports
   *
   * Query params:
   * - clientId (optional): Filter by specific client UUID
   * - fromDate (optional): Date range start (YYYY-MM-DD)
   * - toDate (optional): Date range end (YYYY-MM-DD)
   * - windowDays (optional, default 30): Days ahead for "due soon" calculation
   *
   * ⚠️ User scope enforced: Auditor sees only audits assigned to them
   */
  @Get('summary')
  async getSummary(@Req() req, @Query() query: any) {
    return this.dashboardService.getSummary(req.user.id, query);
  }

  /**
   * GET /api/auditor/dashboard/audits
   * Returns auditor's assigned audits by tab (ACTIVE, OVERDUE, DUE_SOON, COMPLETED)
   *
   * Query params:
   * - tab (required): ACTIVE | OVERDUE | DUE_SOON | COMPLETED
   * - clientId (optional)
   * - fromDate (optional)
   * - toDate (optional)
   * - windowDays (optional, default 30)
   * - limit (optional, default 200, max 500): Max results per page
   * - offset (optional, default 0): Pagination offset
   */
  @Get('audits')
  async getAudits(@Req() req, @Query() query: any) {
    return this.dashboardService.getAudits(req.user.id, query);
  }

  /**
   * GET /api/auditor/dashboard/observations
   * Returns observations pending closure for auditor's audits
   *
   * Query params:
   * - status (optional): OPEN | IN_PROGRESS | RESOLVED | CLOSED
   * - risk (optional): CRITICAL | HIGH | MEDIUM | LOW
   * - clientId (optional)
   * - limit (optional, default 200, max 500): Max results per page
   * - offset (optional, default 0): Pagination offset
   */
  @Get('observations')
  async getObservations(@Req() req, @Query() query: any) {
    return this.dashboardService.getObservations(req.user.id, query);
  }

  /**
   * GET /api/auditor/dashboard/reports
   * Returns audit reports pending submission
   *
   * Query params:
   * - status (optional): PENDING_SUBMISSION | SUBMITTED
   * - clientId (optional)
   * - fromDate (optional)
   * - toDate (optional)
   * - limit (optional, default 200, max 500): Max results per page
   * - offset (optional, default 0): Pagination offset
   */
  @Get('reports')
  async getReports(@Req() req, @Query() query: any) {
    return this.dashboardService.getReports(req.user.id, query);
  }

  /**
   * GET /api/auditor/dashboard/evidence-pending
   * Returns evidence/documents pending submission for auditor's audits
   */
  @Get('evidence-pending')
  async getEvidencePending(@Req() req, @Query() query: any) {
    // Stub — will be backed by real SQL once evidence tracking tables are live
    return { items: [] };
  }

  /**
   * GET /api/auditor/dashboard/activity
   * Returns recent activity timeline for auditor
   */
  @Get('activity')
  async getActivity(@Req() req) {
    // Stub — will be backed by audit_logs once timeline view is implemented
    return { items: [] };
  }
}
