import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CeoDashboardService } from './ceo-dashboard.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import {
  DashboardBaseQueryDto,
  DashboardSearchQueryDto,
  DashboardStatusQueryDto,
  DashboardMonthsQueryDto,
  DashboardRankingsQueryDto,
} from '../common/dto/dashboard-query.dto';

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
 * CEO Dashboard Controller
 * Endpoints for CEO executive dashboard
 * Requires CEO role
 * Provides high-level KPIs and governance metrics
 */
@ApiTags('CEO')
@ApiBearerAuth('JWT')
@Controller({ path: 'ceo/dashboard', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CEO')
export class CeoDashboardController {
  constructor(private readonly dashboardService: CeoDashboardService) {}

  /**
   * GET /api/ceo/dashboard/summary
   * Returns high-level executive KPIs
   * - Total clients, branches, team size
   * - Active audits, compliance score
   * - Recent escalations count
   */
  @ApiOperation({ summary: 'Get Summary' })
  @Get('summary')
  async getSummary(@Query() query: DashboardBaseQueryDto) {
    const data = await this.dashboardService.getSummary(query);
    return toCamel(data);
  }

  /**
   * GET /api/ceo/dashboard/client-overview
   * Returns client list with branch counts and compliance metrics
   *
   * Query params:
   * - limit (optional, default 100)
   * - offset (optional, default 0)
   * - search (optional): Search by client name or code
   */
  @ApiOperation({ summary: 'Get Client Overview' })
  @Get('client-overview')
  async getClientOverview(@Query() query: DashboardSearchQueryDto) {
    const rows = await this.dashboardService.getClientOverview(query);
    return { items: toCamel(rows) };
  }

  /**
   * GET /api/ceo/dashboard/cco-crm-performance
   * Returns CCO and CRM team performance metrics
   * - Client assignments per CCO/CRM
   * - Compliance scores
   * - Overdue items
   */
  @ApiOperation({ summary: 'Get Cco Crm Performance' })
  @Get('cco-crm-performance')
  async getCcoCrmPerformance(@Query() query: DashboardBaseQueryDto) {
    const rows = await this.dashboardService.getCcoCrmPerformance(query);
    return { items: toCamel(rows) };
  }

  /**
   * GET /api/ceo/dashboard/governance-compliance
   * Returns governance and compliance statistics
   * - Audit completion rates
   * - Compliance coverage
   * - Risk indicators
   */
  @ApiOperation({ summary: 'Get Governance Compliance' })
  @Get('governance-compliance')
  async getGovernanceCompliance(@Query() query: DashboardBaseQueryDto) {
    const data = await this.dashboardService.getGovernanceCompliance(query);
    return toCamel(data);
  }

  /**
   * GET /api/ceo/dashboard/recent-escalations
   * Returns recent escalations requiring CEO attention
   *
   * Query params:
   * - status (optional): PENDING | RESOLVED
   * - limit (optional, default 50)
   * - offset (optional, default 0)
   */
  @ApiOperation({ summary: 'Get Recent Escalations' })
  @Get('recent-escalations')
  async getRecentEscalations(@Query() query: DashboardStatusQueryDto) {
    const rows = await this.dashboardService.getRecentEscalations(query);
    return { items: toCamel(rows) };
  }

  /**
   * GET /api/ceo/dashboard/compliance-trend
   * Returns monthly compliance trend data
   *
   * Query params:
   * - months (optional, default 12): Number of months to return
   */
  @ApiOperation({ summary: 'Get Compliance Trend' })
  @Get('compliance-trend')
  async getComplianceTrend(@Query() query: DashboardMonthsQueryDto) {
    const rows = await this.dashboardService.getComplianceTrend(query);
    return { items: toCamel(rows) };
  }

  /**
   * GET /api/ceo/dashboard/branch-rankings
   * Returns top and bottom branch rankings for the selected month.
   *
   * Query params:
   * - month (optional, YYYY-MM)
   * - limit (optional, default 10, max 25)
   */
  @ApiOperation({ summary: 'Get Branch Rankings' })
  @Get('branch-rankings')
  async getBranchRankings(@Query() query: DashboardRankingsQueryDto) {
    const data = await this.dashboardService.getBranchRankings(query);
    return toCamel(data);
  }

  /**
   * GET /api/ceo/dashboard/audit-closure-trend
   * Returns monthly closure trend for audits.
   *
   * Query params:
   * - months (optional, default 12, min 3, max 24)
   */
  @ApiOperation({ summary: 'Get Audit Closure Trend' })
  @Get('audit-closure-trend')
  async getAuditClosureTrend(@Query() query: DashboardMonthsQueryDto) {
    const rows = await this.dashboardService.getAuditClosureTrend(query);
    return { items: toCamel(rows) };
  }
}
