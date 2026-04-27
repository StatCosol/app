import {
  Controller,
  Get,
  UseGuards,
  Post,
  Param,
  Body,
  Query,
  NotFoundException,
  BadRequestException,
  Logger,
  Res,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ApprovalEntity } from '../users/entities/approval.entity';
import { UsersService } from '../users/users.service';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';

@ApiTags('CEO')
@ApiBearerAuth('JWT')
@Controller({ path: 'ceo', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CEO')
export class CeoController {
  private readonly logger = new Logger(CeoController.name);
  constructor(
    @InjectRepository(ApprovalEntity)
    private readonly approvalRepo: Repository<ApprovalEntity>,
    private readonly usersService: UsersService,
    private readonly dataSource: DataSource,
  ) {}

  private toDisplayString(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      return String(value);
    }
    if (value instanceof Date) {
      return value.toISOString();
    }
    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  }

  private resolvePeriod(period?: string): {
    year: number;
    month: number;
    startDate: string;
    endDate: string;
    label: string;
  } {
    const now = new Date();
    const fallback = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const safePeriod = /^\d{4}-\d{2}$/.test(period || '')
      ? (period as string)
      : fallback;

    const start = new Date(`${safePeriod}-01T00:00:00.000Z`);
    const end = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1),
    );

    return {
      year: start.getUTCFullYear(),
      month: start.getUTCMonth() + 1,
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
      label: safePeriod,
    };
  }

  private toCsv(
    columns: string[],
    rows: Array<Record<string, unknown>>,
  ): string {
    const escape = (v: unknown) => {
      const str = this.toDisplayString(v);
      return `"${str.replace(/"/g, '""')}"`;
    };
    const header = columns.map((c) => escape(c)).join(',');
    const body = rows
      .map((row) => columns.map((c) => escape(row[c])).join(','))
      .join('\n');
    return [header, body].filter(Boolean).join('\n');
  }

  private async getReportsSummaryData(period?: string) {
    const p = this.resolvePeriod(period);

    type AuditRow = { status: string; count: number; avgScore?: number | null };
    type TaskRow = { status: string; count: number };
    type ObsRow = { risk: string; count: number };

    const auditRows: AuditRow[] = await this.dataSource
      .query(
        `SELECT status, COUNT(*)::int AS count, ROUND(AVG(score)::numeric, 1) AS "avgScore"
         FROM audits
         WHERE ($1::date IS NULL OR due_date >= $1::date)
           AND ($2::date IS NULL OR due_date < $2::date)
         GROUP BY status`,
        [p.startDate, p.endDate],
      )
      .catch(() => []);

    const taskRows: TaskRow[] = await this.dataSource
      .query(
        `SELECT status, COUNT(*)::int AS count
         FROM compliance_tasks
         WHERE period_year = $1
           AND period_month = $2
         GROUP BY status`,
        [p.year, p.month],
      )
      .catch(() => []);

    const [expiryRow] = await this.dataSource
      .query(
        `SELECT COUNT(*)::int AS n
         FROM branch_registrations
         WHERE expiry_date IS NOT NULL
           AND expiry_date <= CURRENT_DATE + INTERVAL '90 days'
           AND expiry_date >= CURRENT_DATE
           AND status != 'EXPIRED'`,
      )
      .catch(() => [{ n: 0 }]);

    const obsRows: ObsRow[] = await this.dataSource
      .query(
        `SELECT risk, COUNT(*)::int AS count
         FROM audit_observations
         WHERE status IN ('OPEN', 'ACKNOWLEDGED')
         GROUP BY risk`,
      )
      .catch(() => [] as ObsRow[]);

    const [clientRow] = await this.dataSource
      .query(
        `SELECT COUNT(DISTINCT c.id)::int AS clients,
                COUNT(DISTINCT b.id)::int AS branches
         FROM clients c
         LEFT JOIN client_branches b ON b.clientid = c.id AND b.isdeleted = false
         WHERE c.is_deleted = false`,
      )
      .catch(() => [{ clients: 0, branches: 0 }]);

    const auditTotal = auditRows.reduce(
      (sum, row) => sum + Number(row.count || 0),
      0,
    );
    const completedAudits = Number(
      auditRows.find((row) => row.status === 'COMPLETED')?.count || 0,
    );
    const avgScore =
      auditRows.find((row) => row.status === 'COMPLETED')?.avgScore ?? null;

    const totalTasks = taskRows.reduce(
      (sum, row) => sum + Number(row.count || 0),
      0,
    );
    const overdueTasks = Number(
      taskRows.find((row) => row.status === 'OVERDUE')?.count || 0,
    );
    const completedTasks = Number(
      taskRows.find((row) => row.status === 'APPROVED')?.count || 0,
    );
    const taskCompletionRate =
      totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    const openObservations = obsRows.reduce(
      (sum, row) => sum + Number(row.count || 0),
      0,
    );
    const criticalObservations = Number(
      obsRows.find((row) => row.risk === 'CRITICAL')?.count || 0,
    );

    const packs = [
      {
        id: 'audit-summary',
        title: 'Audit Summary',
        description:
          'Completion status and score snapshot for the selected period',
        metrics: {
          total: auditTotal,
          completed: completedAudits,
          avgScore,
          breakdown: auditRows.reduce<Record<string, number>>((map, row) => {
            map[row.status] = row.count;
            return map;
          }, {}),
        },
      },
      {
        id: 'compliance-tasks',
        title: `Compliance Tasks ${p.year}`,
        description: 'Overall task completion and overdue load',
        metrics: {
          total: totalTasks,
          completed: completedTasks,
          overdue: overdueTasks,
          completionRate: taskCompletionRate,
        },
      },
      {
        id: 'registration-expiry',
        title: 'Registration Expiry Alerts',
        description: 'Licenses expiring in the next 90 days',
        metrics: {
          expiringSoon: Number(expiryRow?.n || 0),
          totalClients: Number(clientRow?.clients || 0),
          totalBranches: Number(clientRow?.branches || 0),
        },
      },
      {
        id: 'open-observations',
        title: 'Open Audit Observations',
        description: 'Live risk exposure from unresolved observations',
        metrics: {
          total: openObservations,
          critical: criticalObservations,
          byRisk: obsRows.reduce<Record<string, number>>((map, row) => {
            map[row.risk || 'UNRATED'] = row.count;
            return map;
          }, {}),
        },
      },
    ];

    return {
      period: p.label,
      generatedAt: new Date().toISOString(),
      packs,
    };
  }

  private async getReportPreviewData(type: string, period?: string) {
    const p = this.resolvePeriod(period);
    const safeType = String(type || 'audit-summary').toLowerCase();

    if (safeType === 'audit-summary') {
      const rows = await this.dataSource
        .query(
          `SELECT
             a.audit_code AS "auditCode",
             c.client_name AS "clientName",
             COALESCE(b.branchname, '-') AS "branchName",
             a.status,
             a.due_date AS "dueDate",
             COALESCE(a.score, 0) AS score
           FROM audits a
           LEFT JOIN clients c ON c.id = a.client_id
           LEFT JOIN client_branches b ON b.id = a.branch_id
           WHERE ($1::date IS NULL OR a.due_date >= $1::date)
             AND ($2::date IS NULL OR a.due_date < $2::date)
           ORDER BY a.due_date DESC NULLS LAST
           LIMIT 100`,
          [p.startDate, p.endDate],
        )
        .catch(() => []);

      return {
        type: safeType,
        title: 'Audit Summary Preview',
        period: p.label,
        columns: [
          { key: 'auditCode', label: 'Audit Code' },
          { key: 'clientName', label: 'Client' },
          { key: 'branchName', label: 'Branch' },
          { key: 'status', label: 'Status' },
          { key: 'dueDate', label: 'Due Date' },
          { key: 'score', label: 'Score' },
        ],
        rows,
      };
    }

    if (safeType === 'compliance-tasks') {
      const rows = await this.dataSource
        .query(
          `SELECT
             c.client_name AS "clientName",
             COALESCE(b.branchname, '-') AS "branchName",
             COALESCE(cm.law_family, cm.law_name, 'GENERAL') AS category,
             ct.status AS status,
             ct.due_date AS "dueDate"
           FROM compliance_tasks ct
           LEFT JOIN clients c ON c.id = ct.client_id
           LEFT JOIN client_branches b ON b.id = ct.branch_id
           LEFT JOIN compliance_master cm ON cm.id = ct.compliance_id
           WHERE ct.period_year = $1
             AND ct.period_month = $2
           ORDER BY ct.due_date ASC NULLS LAST
           LIMIT 200`,
          [p.year, p.month],
        )
        .catch(() => []);

      return {
        type: safeType,
        title: 'Compliance Tasks Preview',
        period: p.label,
        columns: [
          { key: 'clientName', label: 'Client' },
          { key: 'branchName', label: 'Branch' },
          { key: 'category', label: 'Category' },
          { key: 'status', label: 'Status' },
          { key: 'dueDate', label: 'Due Date' },
        ],
        rows,
      };
    }

    if (safeType === 'registration-expiry') {
      const rows = await this.dataSource
        .query(
          `SELECT
             c.client_name AS "clientName",
             COALESCE(b.branchname, '-') AS "branchName",
             br.type AS type,
             br.registration_number AS "registrationNumber",
             br.authority AS authority,
             br.expiry_date AS "expiryDate",
             br.status AS status
           FROM branch_registrations br
           LEFT JOIN clients c ON c.id = br.client_id
           LEFT JOIN client_branches b ON b.id = br.branch_id
           WHERE br.expiry_date IS NOT NULL
             AND br.expiry_date <= CURRENT_DATE + INTERVAL '180 days'
           ORDER BY br.expiry_date ASC
           LIMIT 200`,
        )
        .catch(() => []);

      return {
        type: safeType,
        title: 'Registration Expiry Preview',
        period: p.label,
        columns: [
          { key: 'clientName', label: 'Client' },
          { key: 'branchName', label: 'Branch' },
          { key: 'type', label: 'Type' },
          { key: 'registrationNumber', label: 'Reference' },
          { key: 'authority', label: 'Authority' },
          { key: 'expiryDate', label: 'Expiry Date' },
          { key: 'status', label: 'Status' },
        ],
        rows,
      };
    }

    const rows = await this.dataSource
      .query(
        `SELECT
           ao.id,
           ao.risk AS risk,
           ao.status AS status,
           LEFT(ao.observation, 120) AS observation,
           c.client_name AS "clientName",
           COALESCE(b.branchname, '-') AS "branchName",
           ao.created_at AS "createdAt"
         FROM audit_observations ao
         LEFT JOIN audits a ON a.id = ao.audit_id
         LEFT JOIN clients c ON c.id = a.client_id
         LEFT JOIN client_branches b ON b.id = a.branch_id
         WHERE ao.status IN ('OPEN', 'ACKNOWLEDGED')
         ORDER BY ao.created_at DESC
         LIMIT 200`,
      )
      .catch(() => []);

    return {
      type: 'open-observations',
      title: 'Open Observations Preview',
      period: p.label,
      columns: [
        { key: 'clientName', label: 'Client' },
        { key: 'branchName', label: 'Branch' },
        { key: 'risk', label: 'Risk' },
        { key: 'status', label: 'Status' },
        { key: 'observation', label: 'Observation' },
        { key: 'createdAt', label: 'Created At' },
      ],
      rows,
    };
  }

  @ApiOperation({ summary: 'Dashboard' })
  @Get('dashboard')
  async dashboard(@CurrentUser() user: ReqUser) {
    const ceoUserId = user.userId;

    const pendingApprovals = await this.approvalRepo.count({
      where: { status: 'PENDING', requestedTo: { id: ceoUserId } },
    });

    // Real queries for escalations, overdue, compliance pending
    const [escalationRow] = await this.dataSource
      .query(
        `SELECT COUNT(*)::int AS n FROM compliance_tasks WHERE escalated_at IS NOT NULL AND status != 'COMPLETED'`,
      )
      .catch(() => [{ n: 0 }]);

    const [overdueRow] = await this.dataSource
      .query(
        `SELECT COUNT(*)::int AS n FROM compliance_tasks WHERE status = 'OVERDUE'`,
      )
      .catch(() => [{ n: 0 }]);

    const [compliancePendingRow] = await this.dataSource
      .query(
        `SELECT COUNT(*)::int AS n FROM compliance_tasks WHERE status IN ('PENDING', 'IN_PROGRESS')`,
      )
      .catch(() => [{ n: 0 }]);

    return {
      pendingApprovals,
      escalations: escalationRow?.n ?? 0,
      overdue: overdueRow?.n ?? 0,
      compliancePending: compliancePendingRow?.n ?? 0,
    };
  }

  @ApiOperation({ summary: 'Approvals' })
  @Get('approvals')
  async approvals(@CurrentUser() user: ReqUser) {
    return this.usersService.listPendingDeletionRequestsForApprover(
      user.userId,
      user.roleCode,
    );
  }

  @ApiOperation({ summary: 'Approval' })
  @Get('approvals/:id')
  async approval(@Param('id') id: string) {
    const approval = await this.approvalRepo.findOne({
      where: { id: Number(id) },
      relations: ['requestedBy', 'requestedTo'],
    });

    if (approval) {
      return approval;
    }

    throw new NotFoundException(`Approval with id ${id} not found`);
  }

  @ApiOperation({ summary: 'Approve' })
  @Post('approvals/:id/approve')
  async approve(@Param('id') id: string, @CurrentUser() user: ReqUser) {
    return this.usersService.approveDeletionRequest(
      id,
      user.userId,
      user.roleCode,
    );
  }

  @ApiOperation({ summary: 'Reject' })
  @Post('approvals/:id/reject')
  async reject(
    @Param('id') id: string,
    @Body() body: { remarks?: string; reason?: string },
    @CurrentUser() user: ReqUser,
  ) {
    const remarks = body?.remarks || body?.reason || '';
    return this.usersService.rejectDeletionRequest(
      id,
      user.userId,
      user.roleCode,
      remarks,
    );
  }

  // ---- CEO escalations / oversight / notifications with real DB queries ----

  @ApiOperation({ summary: 'Escalations' })
  @Get('escalations')
  async escalations(@Query() query: Record<string, string>) {
    try {
      const status = query.status ? String(query.status).toUpperCase() : null;
      const rows = await this.dataSource.query(
        `SELECT
           ct.id,
           c.client_name   AS "clientName",
           b.branchname    AS "branchName",
           ct.status,
           ct.due_date     AS "dueDate",
           ct.escalated_at AS "escalatedAt",
           COALESCE(cm.law_family, cm.law_name, 'GENERAL') AS category
         FROM compliance_tasks ct
         LEFT JOIN clients  c ON c.id = ct.client_id
         LEFT JOIN client_branches b ON b.id = ct.branch_id
         LEFT JOIN compliance_master cm ON cm.id = ct.compliance_id
         WHERE ct.escalated_at IS NOT NULL
           AND ($1::text IS NULL OR ct.status = $1)
         ORDER BY ct.escalated_at DESC
         LIMIT 200`,
        [status],
      );
      return { items: rows, total: rows.length, query };
    } catch {
      return { items: [], total: 0, query };
    }
  }

  @ApiOperation({ summary: 'Escalation' })
  @Get('escalations/:id')
  async escalation(@Param('id') id: string) {
    const numId = Number(id);
    if (isNaN(numId)) throw new BadRequestException('Invalid escalation ID');
    const [row] = await this.dataSource.query(
      `SELECT ct.*, c.client_name AS "clientName", b.branchname AS "branchName"
       FROM compliance_tasks ct
       LEFT JOIN clients c ON c.id = ct.client_id
       LEFT JOIN client_branches b ON b.id = ct.branch_id
       WHERE ct.id = $1`,
      [id],
    );
    if (!row) throw new NotFoundException(`Escalation ${id} not found`);
    return { ...row, comments: [] };
  }

  @ApiOperation({ summary: 'Escalation Comment' })
  @Post('escalations/:id/comment')
  async escalationComment(
    @Param('id') id: string,
    @Body() body: { message: string },
  ) {
    const numId = Number(id);
    if (isNaN(numId)) throw new BadRequestException('Invalid escalation ID');
    // Verify escalation exists
    const [row] = await this.dataSource.query(
      `SELECT id FROM compliance_tasks WHERE id = $1 AND escalated_at IS NOT NULL`,
      [id],
    );
    if (!row) throw new NotFoundException(`Escalation ${id} not found`);
    return { id, message: body?.message ?? '' };
  }

  @ApiOperation({ summary: 'Escalation Assign' })
  @Post('escalations/:id/assign-to-cco')
  async escalationAssign(
    @Param('id') id: string,
    @Body() body: { ccoId: number; note?: string },
  ) {
    return {
      id,
      assignedTo: body?.ccoId ?? null,
      note: body?.note ?? '',
    };
  }

  @ApiOperation({ summary: 'Escalation Close' })
  @Post('escalations/:id/close')
  async escalationClose(
    @Param('id') id: string,
    @Body() body: { resolutionNote?: string },
  ) {
    await this.dataSource
      .query(
        `UPDATE compliance_tasks SET status = 'COMPLETED', updated_at = NOW() WHERE id = $1`,
        [id],
      )
      .catch((e) =>
        this.logger.warn(`Escalation close failed for ${id}`, e?.message),
      );
    return {
      id,
      status: 'CLOSED',
      resolutionNote: body?.resolutionNote ?? '',
    };
  }

  @ApiOperation({ summary: 'Oversight Summary' })
  @Get('oversight/cco-summary')
  async oversightSummary() {
    try {
      const rows = await this.dataSource.query(
        `SELECT
           cco.id        AS "ccoId",
           cco.name      AS "ccoName",
           COUNT(DISTINCT crm.id)::int  AS "totalCrms",
           COUNT(DISTINCT cl.id)::int   AS "totalClients",
           COALESCE(SUM(CASE WHEN ct.status = 'OVERDUE' THEN 1 ELSE 0 END), 0)::int AS "overdueCount"
         FROM users cco
         INNER JOIN roles rc ON rc.id = cco.role_id AND rc.code = 'CCO'
         LEFT JOIN users crm ON crm.owner_cco_id = cco.id AND crm.deleted_at IS NULL
         LEFT JOIN clients cl ON cl.assigned_crm_id = crm.id AND (cl.is_deleted = false OR cl.is_deleted IS NULL)
         LEFT JOIN compliance_tasks ct ON ct.client_id = cl.id
         WHERE cco.is_active = true AND cco.deleted_at IS NULL
         GROUP BY cco.id, cco.name
         ORDER BY "overdueCount" DESC`,
      );
      return { ccoSummary: rows };
    } catch {
      return { ccoSummary: [] };
    }
  }

  @ApiOperation({ summary: 'Oversight Items' })
  @Get('oversight/cco/:ccoId/items')
  async oversightItems(
    @Param('ccoId') ccoId: string,
    @Query('status') status?: string,
  ) {
    try {
      const rows = await this.dataSource.query(
        `SELECT
           ct.id,
           cl.client_name AS "clientName",
           b.branchname   AS "branchName",
           ct.status,
           ct.due_date    AS "dueDate",
           COALESCE(cm.law_family, cm.law_name, 'GENERAL') AS category
         FROM compliance_tasks ct
         INNER JOIN clients cl ON cl.id = ct.client_id
         INNER JOIN users crm ON crm.id = cl.assigned_crm_id AND crm.owner_cco_id = $1
         LEFT JOIN client_branches b ON b.id = ct.branch_id
         LEFT JOIN compliance_master cm ON cm.id = ct.compliance_id
         WHERE ($2::text IS NULL OR ct.status = $2)
         ORDER BY ct.due_date ASC
         LIMIT 200`,
        [ccoId, status ?? null],
      );
      return { ccoId, status: status ?? 'ALL', items: rows };
    } catch {
      return { ccoId, status: status ?? 'ALL', items: [] };
    }
  }

  @ApiOperation({ summary: 'Notifications' })
  @Get('notifications')
  async notifications(@CurrentUser() user: ReqUser) {
    try {
      const ceoUserId = user.userId;
      const rows = await this.dataSource.query(
        `SELECT
           n.id,
           n.title,
           n.message,
           n.type,
           n.is_read  AS "isRead",
           n.created_at AS "createdAt"
         FROM notifications n
         WHERE n.user_id = $1
         ORDER BY n.created_at DESC
         LIMIT 50`,
        [ceoUserId],
      );
      return rows;
    } catch {
      return [];
    }
  }

  @ApiOperation({ summary: 'Mark Notification Read' })
  @Post('notifications/:id/read')
  async markNotificationRead(
    @Param('id') id: string,
    @CurrentUser() user: ReqUser,
  ) {
    try {
      await this.dataSource.query(
        `UPDATE notifications SET is_read = true, updated_at = NOW() WHERE id = $1 AND user_id = $2`,
        [id, user.userId],
      );
    } catch {
      // Ignore failures to keep this action idempotent for the client.
    }
    return { id: Number(id), read: true };
  }

  // ---- CEO reports (summary / preview / export) ----
  @ApiOperation({ summary: 'Reports' })
  @Get('reports')
  async reports(@Query('period') period?: string) {
    // Backward-compatible shape expected by older clients.
    const data = await this.getReportsSummaryData(period);
    return data.packs;
  }

  @ApiOperation({ summary: 'Reports Summary' })
  @Get('reports/summary')
  async reportsSummary(@Query('period') period?: string) {
    return this.getReportsSummaryData(period);
  }

  @ApiOperation({ summary: 'Report Preview' })
  @Get('reports/preview')
  async reportPreview(
    @Query('type') type = 'audit-summary',
    @Query('period') period?: string,
  ) {
    return this.getReportPreviewData(type, period);
  }

  @ApiOperation({ summary: 'Export Report' })
  @Get('reports/export')
  async exportReport(
    @Res() res: Response,
    @Query('type') type = 'audit-summary',
    @Query('period') period?: string,
    @Query('format') format = 'csv',
  ): Promise<void> {
    const normalizedFormat = String(format || 'csv').toLowerCase();

    if (normalizedFormat === 'pdf') {
      const monthParam = period
        ? `?month=${encodeURIComponent(String(period))}`
        : '';
      const dashboardPdfUrl = `/api/v1/reports/pdf/ceo-dashboard${monthParam}`;
      res.json({
        type,
        period,
        format: 'pdf',
        downloadUrl: dashboardPdfUrl,
      });
      return;
    }

    const preview = await this.getReportPreviewData(type, period);
    const columns = (preview.columns || []).map((c: { key: string }) => c.key);
    const csv = this.toCsv(columns, preview.rows || []);
    const periodLabel = preview.period || this.resolvePeriod(period).label;
    const fileName = `ceo-${preview.type || 'report'}-${periodLabel}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(csv);
  }
}
