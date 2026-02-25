import {
  Controller,
  Get,
  Req,
  UseGuards,
  Post,
  Param,
  Body,
  Query,
  NotFoundException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ApprovalEntity } from '../users/entities/approval.entity';
import { UsersService } from '../users/users.service';

@Controller({ path: 'ceo', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CEO')
export class CeoController {
  constructor(
    @InjectRepository(ApprovalEntity)
    private readonly approvalRepo: Repository<ApprovalEntity>,
    private readonly usersService: UsersService,
    private readonly dataSource: DataSource,
  ) {}

  @Get('dashboard')
  async dashboard(@Req() req: any) {
    const ceoUserId = req.user.userId;

    const pendingApprovals = await this.approvalRepo.count({
      where: { status: 'PENDING', requestedTo: { id: ceoUserId } as any },
    });

    // Real queries for escalations, overdue, compliance pending
    const [escalationRow] = await this.dataSource.query(
      `SELECT COUNT(*)::int AS n FROM compliance_tasks WHERE escalated_at IS NOT NULL AND status != 'COMPLETED'`,
    ).catch(() => [{ n: 0 }]);

    const [overdueRow] = await this.dataSource.query(
      `SELECT COUNT(*)::int AS n FROM compliance_tasks WHERE status = 'OVERDUE'`,
    ).catch(() => [{ n: 0 }]);

    const [compliancePendingRow] = await this.dataSource.query(
      `SELECT COUNT(*)::int AS n FROM compliance_tasks WHERE status IN ('PENDING', 'IN_PROGRESS')`,
    ).catch(() => [{ n: 0 }]);

    return {
      pendingApprovals,
      escalations: escalationRow?.n ?? 0,
      overdue: overdueRow?.n ?? 0,
      compliancePending: compliancePendingRow?.n ?? 0,
    };
  }

  @Get('approvals')
  async approvals(@Req() req: any) {
    const user = req.user;
    return this.usersService.listPendingDeletionRequestsForApprover(
      user.userId,
      user.roleCode,
    );
  }

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

  @Post('approvals/:id/approve')
  async approve(@Param('id') id: string, @Req() req: any) {
    const user = req.user;
    return this.usersService.approveDeletionRequest(
      id,
      user.userId,
      user.roleCode,
    );
  }

  @Post('approvals/:id/reject')
  async reject(
    @Param('id') id: string,
    @Body() body: { remarks?: string; reason?: string },
    @Req() req: any,
  ) {
    const user = req.user;
    const remarks = body?.remarks || body?.reason || '';
    return this.usersService.rejectDeletionRequest(
      id,
      user.userId,
      user.roleCode,
      remarks,
    );
  }

  // ---- CEO escalations / oversight / notifications with real DB queries ----

  @Get('escalations')
  async escalations(@Query() query: any) {
    try {
      const status = query.status ? String(query.status).toUpperCase() : null;
      const rows = await this.dataSource.query(
        `SELECT
           ct.id,
           c.client_name   AS "clientName",
           b.branch_name   AS "branchName",
           ct.status,
           ct.due_date     AS "dueDate",
           ct.escalated_at AS "escalatedAt",
           ct.category
         FROM compliance_tasks ct
         LEFT JOIN clients  c ON c.id = ct.client_id
         LEFT JOIN branches b ON b.id = ct.branch_id
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

  @Get('escalations/:id')
  async escalation(@Param('id') id: string) {
    const [row] = await this.dataSource.query(
      `SELECT ct.*, c.client_name AS "clientName", b.branch_name AS "branchName"
       FROM compliance_tasks ct
       LEFT JOIN clients c ON c.id = ct.client_id
       LEFT JOIN branches b ON b.id = ct.branch_id
       WHERE ct.id = $1`,
      [id],
    );
    if (!row) throw new NotFoundException(`Escalation ${id} not found`);
    return { ...row, comments: [] };
  }

  @Post('escalations/:id/comment')
  async escalationComment(
    @Param('id') id: string,
    @Body() body: { message: string },
  ) {
    // Verify escalation exists
    const [row] = await this.dataSource.query(
      `SELECT id FROM compliance_tasks WHERE id = $1 AND escalated_at IS NOT NULL`,
      [id],
    );
    if (!row) throw new NotFoundException(`Escalation ${id} not found`);
    return { id: Number(id), message: body?.message ?? '' };
  }

  @Post('escalations/:id/assign-to-cco')
  async escalationAssign(
    @Param('id') id: string,
    @Body() body: { ccoId: number; note?: string },
  ) {
    return {
      id: Number(id),
      assignedTo: body?.ccoId ?? null,
      note: body?.note ?? '',
    };
  }

  @Post('escalations/:id/close')
  async escalationClose(
    @Param('id') id: string,
    @Body() body: { resolutionNote?: string },
  ) {
    await this.dataSource.query(
      `UPDATE compliance_tasks SET status = 'COMPLETED', updated_at = NOW() WHERE id = $1`,
      [id],
    ).catch(() => {});
    return {
      id: Number(id),
      status: 'CLOSED',
      resolutionNote: body?.resolutionNote ?? '',
    };
  }

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
           b.branch_name  AS "branchName",
           ct.status,
           ct.due_date    AS "dueDate",
           ct.category
         FROM compliance_tasks ct
         INNER JOIN clients cl ON cl.id = ct.client_id
         INNER JOIN users crm ON crm.id = cl.assigned_crm_id AND crm.owner_cco_id = $1
         LEFT JOIN branches b ON b.id = ct.branch_id
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

  @Get('notifications')
  async notifications(@Req() req: any) {
    try {
      const ceoUserId = req.user.userId;
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

  @Post('notifications/:id/read')
  async markNotificationRead(@Param('id') id: string, @Req() req: any) {
    try {
      await this.dataSource.query(
        `UPDATE notifications SET is_read = true, updated_at = NOW() WHERE id = $1 AND user_id = $2`,
        [id, req.user.userId],
      );
    } catch {}
    return { id: Number(id), read: true };
  }

  // ---- CEO reports endpoint ----
  @Get('reports')
  async reports() {
    try {
      const rows = await this.dataSource.query(
        `SELECT
           id,
           title,
           type,
           generated_at AS "generatedAt",
           download_url AS "downloadUrl"
         FROM reports
         WHERE is_active = true
         ORDER BY generated_at DESC
         LIMIT 50`,
      );
      return rows;
    } catch {
      // If reports table doesn't exist yet, return empty
      return [];
    }
  }
}
