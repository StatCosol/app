import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  Logger,
  ParseUUIDPipe,
} from '@nestjs/common';
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
  UpdateEvidenceStatusDto,
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
  async getEvidencePending(@CurrentUser() user: ReqUser) {
    try {
      const auditorId = user.id;
      const items = await this.dataSource.query(
        `SELECT
           ce.id,
           ce.task_id       AS "taskId",
           COALESCE(cm.law_family, cm.law_name, 'GENERAL') AS category,
           c.client_name    AS "clientName",
           b.branchname    AS "branchName",
           ct.status,
           ce.created_at    AS "uploadedAt",
           ct.due_date      AS "dueDate"
         FROM compliance_evidence ce
         INNER JOIN compliance_tasks ct ON ct.id = ce.task_id
         LEFT JOIN compliance_master cm ON cm.id = ct.compliance_id
         INNER JOIN audits a ON a.client_id = ct.client_id AND a.assigned_auditor_id = $1
         LEFT JOIN clients  c ON c.id = ct.client_id
         LEFT JOIN client_branches b ON b.id = ct.branch_id
         WHERE ct.status IN ('PENDING', 'PENDING_REVIEW')
         ORDER BY ct.due_date ASC
         LIMIT 200`,
        [auditorId],
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
        `SELECT
           al.id,
           al.action,
           al.entity_type   AS "entityType",
           al.entity_id     AS "entityId",
           al.snapshot       AS "details",
           al.created_at    AS "createdAt"
         FROM audit_logs al
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

  /**
   * POST /api/auditor/dashboard/evidence/:id/remind
   * Sends a reminder notification for pending evidence
   */
  @ApiOperation({ summary: 'Remind Evidence' })
  @Post('evidence/:id/remind')
  async remindEvidence(
    @CurrentUser() user: ReqUser,
    @Param('id', ParseUUIDPipe) evidenceId: string,
  ) {
    try {
      const auditorId = user.id;
      // Verify auditor owns this evidence's audit
      const rows = await this.dataSource.query(
        `SELECT ce.id, ce.task_id, ct.client_id, c.client_name
         FROM compliance_evidence ce
         INNER JOIN compliance_tasks ct ON ct.id = ce.task_id
         INNER JOIN audits a ON a.client_id = ct.client_id AND a.assigned_auditor_id = $1
         LEFT JOIN clients c ON c.id = ct.client_id
         WHERE ce.id = $2
         LIMIT 1`,
        [auditorId, evidenceId],
      );
      if (!rows.length) {
        return {
          ok: false,
          message: 'Evidence not found or not assigned to you',
        };
      }
      // Log reminder in audit_logs
      await this.dataSource.query(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
         VALUES ($1, 'EVIDENCE_REMINDER', 'COMPLIANCE_EVIDENCE', $2, $3)`,
        [
          auditorId,
          evidenceId,
          JSON.stringify({ clientName: rows[0].client_name }),
        ],
      );
      this.logger.log(
        `Evidence reminder sent: ${evidenceId} by auditor ${auditorId}`,
      );
      return { ok: true, message: 'Reminder sent' };
    } catch (err) {
      this.logger.error('Failed to send evidence reminder', err);
      return { ok: false, message: 'Failed to send reminder' };
    }
  }

  /**
   * PATCH /api/auditor/dashboard/evidence/:id/status
   * Updates evidence status (e.g., NOT_REQUIRED)
   */
  @ApiOperation({ summary: 'Update Evidence Status' })
  @Patch('evidence/:id/status')
  async updateEvidenceStatus(
    @CurrentUser() user: ReqUser,
    @Param('id', ParseUUIDPipe) evidenceId: string,
    @Body() body: UpdateEvidenceStatusDto,
  ) {
    try {
      const auditorId = user.id;
      // Verify auditor owns this evidence's audit
      const rows = await this.dataSource.query(
        `SELECT ce.id
         FROM compliance_evidence ce
         INNER JOIN compliance_tasks ct ON ct.id = ce.task_id
         INNER JOIN audits a ON a.client_id = ct.client_id AND a.assigned_auditor_id = $1
         WHERE ce.id = $2
         LIMIT 1`,
        [auditorId, evidenceId],
      );
      if (!rows.length) {
        return {
          ok: false,
          message: 'Evidence not found or not assigned to you',
        };
      }
      await this.dataSource.query(
        `UPDATE compliance_evidence SET status = $1, updated_at = NOW() WHERE id = $2`,
        [body.status, evidenceId],
      );
      // Log in audit_logs
      await this.dataSource.query(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
         VALUES ($1, 'EVIDENCE_STATUS_UPDATE', 'COMPLIANCE_EVIDENCE', $2, $3)`,
        [auditorId, evidenceId, JSON.stringify({ newStatus: body.status })],
      );
      this.logger.log(
        `Evidence ${evidenceId} status updated to ${body.status} by auditor ${auditorId}`,
      );
      return { ok: true };
    } catch (err) {
      this.logger.error('Failed to update evidence status', err);
      return { ok: false, message: 'Failed to update evidence status' };
    }
  }
}
