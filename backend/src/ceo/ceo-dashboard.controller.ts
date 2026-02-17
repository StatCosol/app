import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CeoDashboardService } from './ceo-dashboard.service';
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
 * CEO Dashboard Controller
 * Endpoints for CEO executive dashboard
 * Requires CEO role
 * Provides high-level KPIs and governance metrics
 */
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
  @Get('summary')
  async getSummary(@Query() query: any) {
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
  @Get('client-overview')
  async getClientOverview(@Query() query: any) {
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
  @Get('cco-crm-performance')
  async getCcoCrmPerformance(@Query() query: any) {
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
  @Get('governance-compliance')
  async getGovernanceCompliance(@Query() query: any) {
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
  @Get('recent-escalations')
  async getRecentEscalations(@Query() query: any) {
    const rows = await this.dashboardService.getRecentEscalations(query);
    return { items: toCamel(rows) };
  }
}
