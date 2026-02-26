import { Controller, Get, Post, Put, Patch, Param, Body, Logger, Query, Res, UseGuards, ParseUUIDPipe, Req, BadRequestException, NotFoundException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { DataSource } from 'typeorm';
import type { Response } from 'express';
import * as XLSX from 'xlsx';

@Controller({ path: 'admin/reports', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminReportsController {
  private readonly logger = new Logger(AdminReportsController.name);
  constructor(private readonly dataSource: DataSource) {}

  @Get('user-activity')
  async getUserActivity(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('download') download?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    try {
      const { clause, params } = this.buildDateFilter('u.created_at', from, to);

      const rows = await this.dataSource.query(
        `SELECT 
           u.id,
           u.user_code as "userCode",
           u.name,
           u.email,
           u.mobile,
           r.name as role,
           r.code as "roleCode",
           u.is_active as "isActive",
           u.created_at as "createdAt",
           u.last_login as "lastLogin"
         FROM users u
         INNER JOIN roles r ON u.role_id = r.id
         ${clause ? `WHERE ${clause}` : ''}
         ORDER BY u.created_at DESC
         LIMIT 1000`,
        params,
      );

      // If download parameter is true, export to Excel
      if (download === 'true' && res) {
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'User Activity');

        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        );
        res.setHeader(
          'Content-Disposition',
          'attachment; filename=user-activity.xlsx',
        );
        res.send(buffer);
        return;
      }

      return rows;
    } catch (error) {
      this.logger.error('Error fetching user activity:', error);
      if (res) {
        res.status(500).json({ error: 'Failed to generate report' });
        return;
      }
      return [];
    }
  }

  @Get('user-registrations')
  async getUserRegistrations(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('download') download?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const startDate = from ? new Date(from) : thirtyDaysAgo;
      const endDate = to ? new Date(to) : new Date();

      const rows = await this.dataSource.query(
        `SELECT 
           u.id,
           u.user_code as "userCode",
           u.name,
           u.email,
           u.mobile,
           r.name as "roleName",
           r.code as "roleCode",
           u.is_active as "isActive",
           u.created_at as "createdAt",
           c.client_name as "clientName"
         FROM users u
         INNER JOIN roles r ON u.role_id = r.id
         LEFT JOIN clients c ON u.client_id = c.id
         WHERE u.created_at BETWEEN $1 AND $2
         ORDER BY u.created_at DESC`,
        [startDate, endDate],
      );

      if (download === 'true' && res) {
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'User Registrations');

        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        );
        res.setHeader(
          'Content-Disposition',
          'attachment; filename=user-registrations.xlsx',
        );
        res.send(buffer);
        return;
      }

      return rows;
    } catch (error) {
      this.logger.error('Error fetching user registrations:', error);
      if (res) {
        res.status(500).json({ error: 'Failed to generate report' });
        return;
      }
      return [];
    }
  }

  @Get('user-deletions')
  async getUserDeletions(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('download') download?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const startDate = from ? new Date(from) : thirtyDaysAgo;
      const endDate = to ? new Date(to) : new Date();

      const rows = await this.dataSource.query(
        `SELECT 
           u.id,
           u.user_code as "userCode",
           u.name,
           u.email,
           r.name as "roleName",
           r.code as "roleCode",
           u.deleted_at as "deletedAt",
           'Admin' as "deletedBy"
         FROM users u
         INNER JOIN roles r ON u.role_id = r.id
         WHERE u.deleted_at IS NOT NULL 
           AND u.deleted_at BETWEEN $1 AND $2
         ORDER BY u.deleted_at DESC`,
        [startDate, endDate],
      );

      if (download === 'true' && res) {
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'User Deletions');

        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        );
        res.setHeader(
          'Content-Disposition',
          'attachment; filename=user-deletions.xlsx',
        );
        res.send(buffer);
        return;
      }

      return rows;
    } catch (error) {
      this.logger.error('Error fetching user deletions:', error);
      if (res) {
        res.status(500).json({ error: 'Failed to generate report' });
        return;
      }
      return [];
    }
  }

  @Get('access-logs')
  async getAccessLogs(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('download') download?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const startDate = from ? new Date(from) : thirtyDaysAgo;
      const endDate = to ? new Date(to) : new Date();

      // Get login activity from users table
      const rows = await this.dataSource.query(
        `SELECT 
           u.id,
           u.user_code as "userCode",
           u.name,
           u.email,
           r.name as role,
           u.last_login as "lastLogin",
           u.is_active as "isActive"
         FROM users u
         INNER JOIN roles r ON u.role_id = r.id
         WHERE u.last_login BETWEEN $1 AND $2
         ORDER BY u.last_login DESC
         LIMIT 1000`,
        [startDate, endDate],
      );

      if (download === 'true' && res) {
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Access Logs');

        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        );
        res.setHeader(
          'Content-Disposition',
          'attachment; filename=access-logs.xlsx',
        );
        res.send(buffer);
        return;
      }

      return rows;
    } catch (error) {
      this.logger.error('Error fetching access logs:', error);
      if (res) {
        res.status(500).json({ error: 'Failed to generate report' });
        return;
      }
      return [];
    }
  }

  @Get('assignments')
  async getAssignments(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('download') download?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const startDate = from ? new Date(from) : thirtyDaysAgo;
      const endDate = to ? new Date(to) : new Date();

      const rows = await this.dataSource.query(
        `SELECT 
           ca.id,
           c.client_name as "clientName",
           ca.assignment_type as "assignmentType",
           u.name as "assignedUserName",
           ca.status,
           ca.assigned_on as "assignedOn",
           ca.rotation_due_on as "rotationDueOn",
           ca.created_at as "createdAt",
           ca.updated_at as "updatedAt"
         FROM client_assignments ca
         INNER JOIN clients c ON ca.client_id = c.id
         LEFT JOIN users u ON ca.assigned_user_id = u.id
         WHERE ca.created_at BETWEEN $1 AND $2
         ORDER BY ca.created_at DESC
         LIMIT 1000`,
        [startDate, endDate],
      );

      if (download === 'true' && res) {
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Assignments');

        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        );
        res.setHeader(
          'Content-Disposition',
          'attachment; filename=assignments.xlsx',
        );
        res.send(buffer);
        return;
      }

      return rows;
    } catch (error) {
      this.logger.error('Error fetching assignments:', error);
      if (res) {
        res.status(500).json({ error: 'Failed to generate report' });
        return;
      }
      return [];
    }
  }

  // =============================================
  // ========= AUDIT REPORTS MANAGEMENT =========
  // =============================================

  /**
   * GET /api/v1/admin/reports/audit-reports
   * List all audit reports with optional filters
   * Query: status, clientId, auditType, from, to, download
   */
  @Get('audit-reports')
  async listAuditReports(
    @Query('status') status?: string,
    @Query('clientId') clientId?: string,
    @Query('auditType') auditType?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('download') download?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    try {
      const conditions: string[] = [];
      const params: any[] = [];
      let paramIdx = 1;

      if (status) {
        conditions.push(`ar.status = $${paramIdx++}`);
        params.push(status);
      }
      if (clientId) {
        conditions.push(`a.client_id = $${paramIdx++}`);
        params.push(clientId);
      }
      if (auditType) {
        conditions.push(`a.audit_type = $${paramIdx++}`);
        params.push(auditType);
      }
      if (from) {
        conditions.push(`ar.prepared_date >= $${paramIdx++}`);
        params.push(from);
      }
      if (to) {
        conditions.push(`ar.prepared_date <= $${paramIdx++}`);
        params.push(to);
      }

      const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

      const rows = await this.dataSource.query(
        `SELECT
           ar.id,
           ar.audit_id          AS "auditId",
           ar.report_type       AS "reportType",
           ar.report_number     AS "reportNumber",
           ar.executive_summary AS "executiveSummary",
           ar.findings,
           ar.recommendations,
           ar.status,
           ar.prepared_date     AS "preparedDate",
           ar.approved_date     AS "approvedDate",
           ar.published_date    AS "publishedDate",
           ar.created_at        AS "createdAt",
           ar.updated_at        AS "updatedAt",
           a.audit_type         AS "auditType",
           a.due_date           AS "auditDueDate",
           c.client_name        AS "clientName",
           c.id                 AS "clientId",
           prep.name            AS "preparedByName",
           prep.email           AS "preparedByEmail",
           appr.name            AS "approvedByName",
           appr.email           AS "approvedByEmail"
         FROM audit_reports ar
         INNER JOIN audits a ON a.id = ar.audit_id
         LEFT JOIN clients c ON c.id = a.client_id
         LEFT JOIN users prep ON prep.id = ar.prepared_by_user_id
         LEFT JOIN users appr ON appr.id = ar.approved_by_user_id
         ${whereClause}
         ORDER BY ar.created_at DESC
         LIMIT 1000`,
        params,
      );

      if (download === 'true' && res) {
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Audit Reports');
        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=audit-reports.xlsx');
        res.send(buffer);
        return;
      }

      return rows;
    } catch (error) {
      this.logger.error('Error fetching audit reports:', error);
      if (res && download === 'true') {
        res.status(500).json({ error: 'Failed to generate report' });
        return;
      }
      return [];
    }
  }

  /**
   * GET /api/v1/admin/reports/audit-reports/summary
   * Returns summary counts by status for KPI cards
   */
  @Get('audit-reports/summary')
  async getAuditReportsSummary() {
    try {
      const rows = await this.dataSource.query(`
        SELECT
          COUNT(*)::int                                         AS "total",
          COUNT(*) FILTER (WHERE status = 'DRAFT')::int        AS "draft",
          COUNT(*) FILTER (WHERE status = 'SUBMITTED')::int    AS "submitted",
          COUNT(*) FILTER (WHERE status = 'APPROVED')::int     AS "approved",
          COUNT(*) FILTER (WHERE status = 'PUBLISHED')::int    AS "published"
        FROM audit_reports
      `);
      return rows[0] ?? { total: 0, draft: 0, submitted: 0, approved: 0, published: 0 };
    } catch (error) {
      this.logger.error('Error fetching audit reports summary:', error);
      return { total: 0, draft: 0, submitted: 0, approved: 0, published: 0 };
    }
  }

  /**
   * GET /api/v1/admin/reports/audit-reports/:id
   * Get a single audit report with full details
   */
  @Get('audit-reports/:id')
  async getAuditReport(@Param('id', ParseUUIDPipe) id: string) {
    const rows = await this.dataSource.query(
      `SELECT
         ar.id,
         ar.audit_id          AS "auditId",
         ar.report_type       AS "reportType",
         ar.report_number     AS "reportNumber",
         ar.executive_summary AS "executiveSummary",
         ar.findings,
         ar.recommendations,
         ar.status,
         ar.prepared_date     AS "preparedDate",
         ar.approved_date     AS "approvedDate",
         ar.published_date    AS "publishedDate",
         ar.prepared_by_user_id AS "preparedByUserId",
         ar.approved_by_user_id AS "approvedByUserId",
         ar.created_at        AS "createdAt",
         ar.updated_at        AS "updatedAt",
         a.audit_type         AS "auditType",
         a.due_date           AS "auditDueDate",
         a.status             AS "auditStatus",
         c.id                 AS "clientId",
         c.client_name        AS "clientName",
         prep.name            AS "preparedByName",
         appr.name            AS "approvedByName"
       FROM audit_reports ar
       INNER JOIN audits a ON a.id = ar.audit_id
       LEFT JOIN clients c ON c.id = a.client_id
       LEFT JOIN users prep ON prep.id = ar.prepared_by_user_id
       LEFT JOIN users appr ON appr.id = ar.approved_by_user_id
       WHERE ar.id = $1`,
      [id],
    );
    if (!rows.length) throw new NotFoundException('Audit report not found');
    return rows[0];
  }

  /**
   * POST /api/v1/admin/reports/audit-reports
   * Create a new audit report
   */
  @Post('audit-reports')
  async createAuditReport(
    @Body() body: {
      auditId: string;
      reportType?: string;
      reportNumber?: string;
      executiveSummary?: string;
      findings?: string;
      recommendations?: string;
    },
    @Req() req: any,
  ) {
    if (!body.auditId) throw new BadRequestException('auditId is required');

    // Verify audit exists
    const audit = await this.dataSource.query('SELECT id FROM audits WHERE id = $1', [body.auditId]);
    if (!audit.length) throw new NotFoundException('Audit not found');

    const rows = await this.dataSource.query(
      `INSERT INTO audit_reports
         (audit_id, report_type, report_number, executive_summary, findings, recommendations, status, prepared_by_user_id, prepared_date)
       VALUES ($1, $2, $3, $4, $5, $6, 'DRAFT', $7, CURRENT_DATE)
       RETURNING id, status, created_at AS "createdAt"`,
      [
        body.auditId,
        body.reportType || 'STANDARD',
        body.reportNumber || null,
        body.executiveSummary || null,
        body.findings || null,
        body.recommendations || null,
        req.user?.userId || req.user?.id || null,
      ],
    );

    return { ...rows[0], message: 'Audit report created' };
  }

  /**
   * PUT /api/v1/admin/reports/audit-reports/:id
   * Update an existing audit report (only DRAFT or SUBMITTED)
   */
  @Put('audit-reports/:id')
  async updateAuditReport(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: {
      reportType?: string;
      reportNumber?: string;
      executiveSummary?: string;
      findings?: string;
      recommendations?: string;
    },
  ) {
    // Verify exists and is editable
    const existing = await this.dataSource.query('SELECT id, status FROM audit_reports WHERE id = $1', [id]);
    if (!existing.length) throw new NotFoundException('Audit report not found');
    if (['APPROVED', 'PUBLISHED'].includes(existing[0].status)) {
      throw new BadRequestException('Cannot edit an approved or published report');
    }

    const sets: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (body.reportType !== undefined) { sets.push(`report_type = $${idx++}`); params.push(body.reportType); }
    if (body.reportNumber !== undefined) { sets.push(`report_number = $${idx++}`); params.push(body.reportNumber || null); }
    if (body.executiveSummary !== undefined) { sets.push(`executive_summary = $${idx++}`); params.push(body.executiveSummary); }
    if (body.findings !== undefined) { sets.push(`findings = $${idx++}`); params.push(body.findings); }
    if (body.recommendations !== undefined) { sets.push(`recommendations = $${idx++}`); params.push(body.recommendations); }

    if (sets.length === 0) throw new BadRequestException('No fields to update');

    sets.push(`updated_at = NOW()`);
    params.push(id);

    await this.dataSource.query(
      `UPDATE audit_reports SET ${sets.join(', ')} WHERE id = $${idx}`,
      params,
    );

    return { ok: true, message: 'Audit report updated' };
  }

  /**
   * PATCH /api/v1/admin/reports/audit-reports/:id/submit
   * Move report from DRAFT → SUBMITTED
   */
  @Patch('audit-reports/:id/submit')
  async submitAuditReport(@Param('id', ParseUUIDPipe) id: string) {
    const existing = await this.dataSource.query('SELECT id, status FROM audit_reports WHERE id = $1', [id]);
    if (!existing.length) throw new NotFoundException('Audit report not found');
    if (existing[0].status !== 'DRAFT') throw new BadRequestException('Only DRAFT reports can be submitted');

    await this.dataSource.query(
      `UPDATE audit_reports SET status = 'SUBMITTED', updated_at = NOW() WHERE id = $1`,
      [id],
    );
    return { ok: true, message: 'Report submitted for approval' };
  }

  /**
   * PATCH /api/v1/admin/reports/audit-reports/:id/approve
   * Move report from SUBMITTED → APPROVED
   */
  @Patch('audit-reports/:id/approve')
  async approveAuditReport(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: any,
  ) {
    const existing = await this.dataSource.query('SELECT id, status FROM audit_reports WHERE id = $1', [id]);
    if (!existing.length) throw new NotFoundException('Audit report not found');
    if (existing[0].status !== 'SUBMITTED') throw new BadRequestException('Only SUBMITTED reports can be approved');

    await this.dataSource.query(
      `UPDATE audit_reports
       SET status = 'APPROVED',
           approved_by_user_id = $1,
           approved_date = CURRENT_DATE,
           updated_at = NOW()
       WHERE id = $2`,
      [req.user?.userId || req.user?.id || null, id],
    );
    return { ok: true, message: 'Report approved' };
  }

  /**
   * PATCH /api/v1/admin/reports/audit-reports/:id/publish
   * Move report from APPROVED → PUBLISHED
   */
  @Patch('audit-reports/:id/publish')
  async publishAuditReport(@Param('id', ParseUUIDPipe) id: string) {
    const existing = await this.dataSource.query('SELECT id, status FROM audit_reports WHERE id = $1', [id]);
    if (!existing.length) throw new NotFoundException('Audit report not found');
    if (existing[0].status !== 'APPROVED') throw new BadRequestException('Only APPROVED reports can be published');

    await this.dataSource.query(
      `UPDATE audit_reports
       SET status = 'PUBLISHED',
           published_date = CURRENT_DATE,
           updated_at = NOW()
       WHERE id = $1`,
      [id],
    );
    return { ok: true, message: 'Report published' };
  }

  /** Build a parameterized date filter — safe from SQL injection */
  private buildDateFilter(
    column: string,
    from?: string,
    to?: string,
    startParamIndex = 1,
  ): { clause: string; params: any[] } {
    const filters: string[] = [];
    const params: any[] = [];
    let idx = startParamIndex;

    if (from) {
      filters.push(`${column} >= $${idx++}`);
      params.push(from);
    }
    if (to) {
      filters.push(`${column} <= $${idx++}`);
      params.push(to);
    }

    return { clause: filters.join(' AND '), params };
  }
}
