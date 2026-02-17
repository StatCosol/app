import { Controller, Get, Query, UseGuards, Req } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CrmDashboardService } from './crm-dashboard.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

/** Convert snake_case object keys to camelCase */
function toCamel(obj: any): any {
  if (Array.isArray(obj)) return obj.map(toCamel);
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [
        k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()),
        toCamel(v),
      ]),
    );
  }
  return obj;
}

/**
 * CRM Dashboard Controller
 * Endpoints for CRM compliance owner dashboard
 * Requires CRM role
 * ⚠️ CRITICAL: All queries are scoped to CRM's assigned clients via req.user.id
 */
@Controller({ path: 'crm/dashboard', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CRM')
export class CrmDashboardController {
  constructor(private readonly dashboardService: CrmDashboardService) {}

  /**
   * GET /api/crm/dashboard/summary
   * Returns CRM operational KPIs: assigned clients/branches, coverage %, overdue, due soon, queries
   *
   * Query params:
   * - clientId (optional): Filter by specific assigned client UUID
   * - fromDate (optional): Date range start (YYYY-MM-DD)
   * - toDate (optional): Date range end (YYYY-MM-DD)
   * - windowDays (optional, default 30): Days ahead for "due soon" calculation
   *
   * ⚠️ User scope enforced: CRM sees only clients assigned via client_assignments
   */
  @Get('summary')
  async getSummary(@Req() req, @Query() query: any) {
    const data = await this.dashboardService.getSummary(req.user.id, query);
    return toCamel(data);
  }

  /**
   * GET /api/crm/dashboard/due-compliances
   * Returns compliance items by tab (OVERDUE, DUE_SOON, THIS_MONTH)
   *
   * Query params:
   * - tab (required): OVERDUE | DUE_SOON | THIS_MONTH
   * - clientId (optional)
   * - fromDate (optional)
   * - toDate (optional)
   * - windowDays (optional, default 30)
   */
  @Get('due-compliances')
  async getDueCompliances(@Req() req, @Query() query: any) {
    const rows = await this.dashboardService.getDueCompliances(
      req.user.id,
      query,
    );
    return { items: toCamel(rows) };
  }

  /**
   * GET /api/crm/dashboard/low-coverage-branches
   * Returns branches with low compliance coverage (<70% or >=5 overdue items)
   *
   * Query params: clientId, fromDate, toDate, limit, offset
   */
  @Get('low-coverage-branches')
  async getLowCoverageBranches(@Req() req, @Query() query: any) {
    const rows = await this.dashboardService.getLowCoverageBranches(
      req.user.id,
      query,
    );
    return { items: toCamel(rows) };
  }

  /**
   * GET /api/crm/dashboard/queries
   * Returns compliance queries inbox for CRM
   *
   * Query params:
   * - status (optional): UNREAD | READ | CLOSED
   * - clientId (optional)
   * - fromDate (optional)
   * - toDate (optional)
   * - limit (optional, default 200)
   * - offset (optional, default 0)
   */
  @Get('queries')
  async getQueries(@Req() req, @Query() query: any) {
    const rows = await this.dashboardService.getQueries(req.user.id, query);
    return { items: toCamel(rows) };
  }

  /**
   * GET /api/crm/dashboard/pending-documents
   * Returns documents pending upload by contractors
   *
   * Query params:
   * - clientId (optional)
   * - branchId (optional)
   * - status (optional): PENDING | OVERDUE
   * - limit (optional, default 200)
   * - offset (optional, default 0)
   */
  @Get('pending-documents')
  async getPendingDocuments(@Req() req, @Query() query: any) {
    const rows = await this.dashboardService.getPendingDocuments(
      req.user.id,
      query,
    );
    return { items: toCamel(rows) };
  }
}
