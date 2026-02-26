import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards, Req, Logger, ParseUUIDPipe } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AuditorDashboardService } from './auditor-dashboard.service';
import { DataSource } from 'typeorm';

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
   * Returns compliance evidence pending submission for auditor's audits
   */
  @Get('evidence-pending')
  async getEvidencePending(@Req() req, @Query() query: any) {
    try {
      const auditorId = req.user.id;
      const items = await this.dataSource.query(
        `SELECT
           ce.id,
           ce.task_id       AS "taskId",
           ct.category,
           c.client_name    AS "clientName",
           b.branch_name    AS "branchName",
           ce.status,
           ce.uploaded_at   AS "uploadedAt",
           ct.due_date      AS "dueDate"
         FROM compliance_evidence ce
         INNER JOIN compliance_tasks ct ON ct.id = ce.task_id
         INNER JOIN audits a ON a.client_id = ct.client_id AND a.auditor_id = $1
         LEFT JOIN clients  c ON c.id = ct.client_id
         LEFT JOIN branches b ON b.id = ct.branch_id
         WHERE ce.status IN ('PENDING', 'PENDING_REVIEW')
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
  @Get('activity')
  async getActivity(@Req() req) {
    try {
      const auditorId = req.user.id;
      const items = await this.dataSource.query(
        `SELECT
           al.id,
           al.action,
           al.entity_type   AS "entityType",
           al.entity_id     AS "entityId",
           al.details,
           al.created_at    AS "createdAt"
         FROM audit_logs al
         WHERE al.user_id = $1
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
  @Post('evidence/:id/remind')
  async remindEvidence(
    @Req() req,
    @Param('id', ParseUUIDPipe) evidenceId: string,
  ) {
    try {
      const auditorId = req.user.id;
      // Verify auditor owns this evidence's audit
      const rows = await this.dataSource.query(
        `SELECT ce.id, ce.task_id, ct.client_id, c.client_name
         FROM compliance_evidence ce
         INNER JOIN compliance_tasks ct ON ct.id = ce.task_id
         INNER JOIN audits a ON a.client_id = ct.client_id AND a.auditor_id = $1
         LEFT JOIN clients c ON c.id = ct.client_id
         WHERE ce.id = $2
         LIMIT 1`,
        [auditorId, evidenceId],
      );
      if (!rows.length) {
        return { ok: false, message: 'Evidence not found or not assigned to you' };
      }
      // Log reminder in audit_logs
      await this.dataSource.query(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
         VALUES ($1, 'EVIDENCE_REMINDER', 'COMPLIANCE_EVIDENCE', $2, $3)`,
        [auditorId, evidenceId, JSON.stringify({ clientName: rows[0].client_name })],
      );
      this.logger.log(`Evidence reminder sent: ${evidenceId} by auditor ${auditorId}`);
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
  @Patch('evidence/:id/status')
  async updateEvidenceStatus(
    @Req() req,
    @Param('id', ParseUUIDPipe) evidenceId: string,
    @Body() body: { status: string },
  ) {
    try {
      const auditorId = req.user.id;
      // Verify auditor owns this evidence's audit
      const rows = await this.dataSource.query(
        `SELECT ce.id
         FROM compliance_evidence ce
         INNER JOIN compliance_tasks ct ON ct.id = ce.task_id
         INNER JOIN audits a ON a.client_id = ct.client_id AND a.auditor_id = $1
         WHERE ce.id = $2
         LIMIT 1`,
        [auditorId, evidenceId],
      );
      if (!rows.length) {
        return { ok: false, message: 'Evidence not found or not assigned to you' };
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
      this.logger.log(`Evidence ${evidenceId} status updated to ${body.status} by auditor ${auditorId}`);
      return { ok: true };
    } catch (err) {
      this.logger.error('Failed to update evidence status', err);
      return { ok: false, message: 'Failed to update evidence status' };
    }
  }
}
