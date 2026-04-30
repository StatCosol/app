import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CrmDashboardService } from './crm-dashboard.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import {
  DashboardWindowQueryDto,
  DashboardTabQueryDto,
  DashboardBaseQueryDto,
  DashboardStatusQueryDto,
  DashboardBranchQueryDto,
  DashboardLimitQueryDto,
  DashboardDaysQueryDto,
} from '../common/dto/dashboard-query.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';

/** Convert snake_case object keys to camelCase */
function toCamel(obj: unknown): unknown {
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
 * ⚠️ CRITICAL: All queries are scoped to CRM's assigned clients via user.id
 */
@ApiTags('CRM')
@ApiBearerAuth('JWT')
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
  @ApiOperation({ summary: 'Get Summary' })
  @Get('summary')
  async getSummary(
    @CurrentUser() user: ReqUser,
    @Query() query: DashboardWindowQueryDto,
  ) {
    const data = await this.dashboardService.getSummary(user.id, query);
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
  @ApiOperation({ summary: 'Get Due Compliances' })
  @Get('due-compliances')
  async getDueCompliances(
    @CurrentUser() user: ReqUser,
    @Query() query: DashboardTabQueryDto,
  ) {
    const rows = await this.dashboardService.getDueCompliances(user.id, query);
    return { items: toCamel(rows) };
  }

  /**
   * GET /api/crm/dashboard/low-coverage-branches
   * Returns branches with low compliance coverage (<70% or >=5 overdue items)
   *
   * Query params: clientId, fromDate, toDate, limit, offset
   */
  @ApiOperation({ summary: 'Get Low Coverage Branches' })
  @Get('low-coverage-branches')
  async getLowCoverageBranches(
    @CurrentUser() user: ReqUser,
    @Query() query: DashboardBaseQueryDto,
  ) {
    const rows = await this.dashboardService.getLowCoverageBranches(
      user.id,
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
  @ApiOperation({ summary: 'Get Queries' })
  @Get('queries')
  async getQueries(
    @CurrentUser() user: ReqUser,
    @Query() query: DashboardStatusQueryDto,
  ) {
    const rows = await this.dashboardService.getQueries(user.id, query);
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
  @ApiOperation({ summary: 'Get Pending Documents' })
  @Get('pending-documents')
  async getPendingDocuments(
    @CurrentUser() user: ReqUser,
    @Query() query: DashboardBranchQueryDto,
  ) {
    const rows = await this.dashboardService.getPendingDocuments(
      user.id,
      query,
    );
    return { items: toCamel(rows) };
  }

  /* ═══════ V2 Dashboard Endpoints (redesigned) ═══════ */

  /** GET /api/v1/crm/dashboard/kpis — 8 KPI cards */
  @ApiOperation({ summary: 'Get Kpis' })
  @Get('kpis')
  async getKpis(@CurrentUser() user: ReqUser) {
    const data = await this.dashboardService.getKpis(user.id);
    return toCamel(data);
  }

  /** GET /api/v1/crm/dashboard/priority-today — urgent items */
  @ApiOperation({ summary: 'Get Priority Today' })
  @Get('priority-today')
  async getPriorityToday(
    @CurrentUser() user: ReqUser,
    @Query() query: DashboardLimitQueryDto,
  ) {
    const limit = Math.min(query.limit || 20, 50);
    const rows = await this.dashboardService.getPriorityToday(user.id, limit);
    return { items: toCamel(rows) };
  }

  /** GET /api/v1/crm/dashboard/top-risk-clients — ranked by compliance */
  @ApiOperation({ summary: 'Get Top Risk Clients' })
  @Get('top-risk-clients')
  async getTopRiskClients(
    @CurrentUser() user: ReqUser,
    @Query() query: DashboardLimitQueryDto,
  ) {
    const limit = Math.min(query.limit || 10, 50);
    const rows = await this.dashboardService.getTopRiskClients(user.id, limit);
    return { items: toCamel(rows) };
  }

  /** GET /api/v1/crm/dashboard/upcoming-audits — next N days */
  @ApiOperation({ summary: 'Get Upcoming Audits' })
  @Get('upcoming-audits')
  async getUpcomingAudits(
    @CurrentUser() user: ReqUser,
    @Query() query: DashboardDaysQueryDto,
  ) {
    const days = Math.min(query.days || 15, 90);
    const rows = await this.dashboardService.getUpcomingAudits(user.id, days);
    return { items: toCamel(rows) };
  }
}
