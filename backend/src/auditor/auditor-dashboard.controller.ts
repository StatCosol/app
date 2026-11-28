import { Controller, Get, Query, UseGuards, Logger } from '@nestjs/common';
import { normalizeDateFilters } from '../common/utils/filters';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuditorDashboardService } from './auditor-dashboard.service';
import { DataSource } from 'typeorm';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import {
  AuditorSummaryQueryDto,
  AuditorAuditsQueryDto,
  AuditorObservationsQueryDto,
  AuditorReportsQueryDto,
} from './dto/auditor-dashboard-query.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';

/**
 * Auditor Dashboard Controller
 * Endpoints for auditor execution dashboard
 * Requires AUDITOR role
 * ⚠️ CRITICAL: All queries are scoped to auditor's assigned audits via user.id
 */
@ApiTags('Auditor')
@ApiBearerAuth('JWT')
@Controller({ path: 'auditor/dashboard', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('AUDITOR')
export class AuditorDashboardController {
  private readonly logger = new Logger(AuditorDashboardController.name);
  constructor(
    private readonly dashboardService: AuditorDashboardService,
    private readonly dataSource: DataSource,
  ) {}

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
  @ApiOperation({ summary: 'Get Summary' })
  @Get('summary')
  async getSummary(
    @CurrentUser() user: ReqUser,
    @Query() query: AuditorSummaryQueryDto,
  ) {
    return this.dashboardService.getSummary(user.id, query);
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
  @ApiOperation({ summary: 'Get Audits' })
  @Get('audits')
  async getAudits(
    @CurrentUser() user: ReqUser,
    @Query() query: AuditorAuditsQueryDto,
  ) {
    const items = await this.dashboardService.getAudits(user.id, query);
    return { items };
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
  @ApiOperation({ summary: 'Get Observations' })
  @Get('observations')
  async getObservations(
    @CurrentUser() user: ReqUser,
    @Query() query: AuditorObservationsQueryDto,
  ) {
    const items = await this.dashboardService.getObservations(user.id, query);
    return { items };
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
  @ApiOperation({ summary: 'Get Reports' })
  @Get('reports')
  async getReports(
    @CurrentUser() user: ReqUser,
    @Query() query: AuditorReportsQueryDto,
  ) {
    const items = await this.dashboardService.getReports(user.id, query);
    return { items };
  }

  /**
   * GET /api/auditor/dashboard/evidence-pending
   * Returns compliance evidence pending submission for auditor's audits
   */
  @ApiOperation({ summary: 'Get Evidence Pending' })
  @Get('evidence-pending')
  async getEvidencePending(
    @CurrentUser() user: ReqUser,
    @Query() query: AuditorSummaryQueryDto = {},
  ) {
    const f = normalizeDateFilters(query);
    try {
      const auditorId = user.id;
      const items = await this.dataSource.query(
        `SELECT
           ce.id, a.id AS "auditId",
           ct.client_id     AS "clientId",
           ct.branch_id     AS "branchId",
           COALESCE(cm.law_family, cm.law_name, 'Document') AS "evidenceName",
           c.client_name    AS "clientName",
           b.branchname     AS "branchName",
           ct.status,
           ce.created_at::date                              AS "requestedOn",
           GREATEST(0, (CURRENT_DATE - ce.created_at::date)::int) AS "pendingDays"
         FROM compliance_evidence ce
         INNER JOIN compliance_tasks ct ON ct.id = ce.task_id
         LEFT JOIN compliance_master cm ON cm.id = ct.compliance_id
         INNER JOIN audits a ON a.client_id = ct.client_id AND a.assigned_auditor_id = $1
           AND (a.branch_id IS NULL OR ct.branch_id IS NULL OR a.branch_id = ct.branch_id)
         LEFT JOIN clients  c ON c.id = ct.client_id
         LEFT JOIN client_branches b ON b.id = ct.branch_id
         WHERE ct.status IN ('PENDING', 'PENDING_REVIEW')
           AND ($2::uuid IS NULL OR a.client_id = $2)
           AND ($3::date IS NULL OR a.due_date >= $3)
           AND ($4::date IS NULL OR a.due_date <= $4)
           AND ($5::text IS NULL OR a.audit_type = $5)
         ORDER BY ct.due_date ASC
         LIMIT 200`,
        [
          auditorId,
          f.clientId,
          f.fromDate,
          f.toDate,
          query.auditType?.trim().toUpperCase() || null,
        ],
      );
      return { items };
    } catch {
      return { items: [] };
    }
  }

  /**
   * GET /api/auditor/dashboard/activity
   * Returns recent activity timeline for auditor from audit_logs
   */
  @ApiOperation({ summary: 'Get Activity' })
  @Get('activity')
  async getActivity(@CurrentUser() user: ReqUser) {
    try {
      const auditorId = user.id;
      const items = await this.dataSource.query(
        // Name the audit and client: events point at an audit, an NC or an
        // observation, so resolve the audit through whichever one matches.
        `SELECT
           al.id,
           'OTHER'           AS "activityType",
           al.action         AS "description",
           al.created_at     AS "timestamp",
           a.audit_code      AS "auditName",
           c.client_name     AS "clientName"
         FROM audit_logs al
         LEFT JOIN audit_non_compliances nc
           ON al.entity_type = 'AUDIT_NC' AND nc.id = al.entity_id
         LEFT JOIN audit_observations ob
           ON al.entity_type <> 'AUDIT_NC' AND ob.id = al.entity_id
         LEFT JOIN audits a
           ON a.id = COALESCE(nc.audit_id, ob.audit_id, al.entity_id)
          AND a.assigned_auditor_id = $1
         LEFT JOIN clients c ON c.id = a.client_id
         WHERE al.performed_by = $1
         ORDER BY al.created_at DESC
         LIMIT 50`,
        [auditorId],
      );
      return { items };
    } catch {
      return { items: [] };
    }
  }

  // Evidence reminders/status changes were removed: nothing was delivered and
  // compliance_evidence has no status column. CRM owns evidence review.
}
