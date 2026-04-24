import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DbService } from '../common/db/db.service';
import { ComplianceService } from '../compliance/compliance.service';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';
import * as fs from 'fs';
import * as path from 'path';

/**
 * CRM Compliance Tracker Controller
 * MCD Tracker + Audit Closures tabs
 * Scoped to CRM's assigned clients via client_assignments_current
 */
@ApiTags('CRM')
@ApiBearerAuth('JWT')
@Controller({ path: 'crm/compliance-tracker', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CRM')
export class CrmComplianceTrackerController {
  private readonly logger = new Logger(CrmComplianceTrackerController.name);
  /** Tracks which user+client+year+month combos already had auto-gen run this process lifetime */
  private readonly autoGenDone = new Set<string>();
  constructor(
    private readonly db: DbService,
    private readonly complianceService: ComplianceService,
  ) {}

  @ApiOperation({ summary: 'Overview (Compatibility)' })
  @Get()
  overview(
    @CurrentUser() user: ReqUser,
    @Query() query: Record<string, string>,
  ) {
    return this.mcd(user, query);
  }

  /* ═══════ Tab 2: MCD Tracker ═══════ */

  /**
   * GET /api/v1/crm/compliance-tracker/mcd
   * Branch-wise monthly closure dashboard
   * Query: year, month, clientId (optional)
   */
  @ApiOperation({ summary: 'Mcd' })
  @Get('mcd')
  async mcd(
    @CurrentUser() user: ReqUser,
    @Query() query: Record<string, string>,
  ) {
    const crmUserId = user.id;
    const year = parseInt(query.year, 10) || new Date().getFullYear();
    const month = parseInt(query.month, 10) || new Date().getMonth() + 1;
    const clientId = query.clientId || null;

    // Auto-generate monthly compliance tasks (idempotent, skip if already done for this month)
    const genKey = `${crmUserId}:${clientId || 'all'}:${year}:${month}`;
    if (!this.autoGenDone.has(genKey)) {
      const branches: any[] = await this.db.many(
        `SELECT b.id AS branch_id, b.clientid AS client_id
         FROM client_branches b
         JOIN client_assignments_current ca
           ON ca.client_id = b.clientid
           AND ca.assignment_type = 'CRM'
           AND ca.assigned_to_user_id = $1::uuid
         WHERE b.isactive = TRUE
           AND ($2::uuid IS NULL OR b.clientid = $2)`,
        [crmUserId, clientId],
      );
      this.logger.log(`MCD auto-gen: found ${branches.length} branches for CRM user=${crmUserId} clientId=${clientId}`);
      for (const br of branches) {
        try {
          await this.complianceService.autoGenerateMonthlyTasks(
            br.client_id, br.branch_id, year, month,
          );
        } catch (e) {
          this.logger.error(`MCD auto-gen failed for branch=${br.branch_id}: ${(e as Error).message}`, (e as Error).stack);
        }
      }
      this.autoGenDone.add(genKey);
    }

    const rows = await this.db.many(
      `WITH crm_clients AS (
         SELECT ca.client_id
         FROM client_assignments_current ca
         WHERE ca.assignment_type = 'CRM'
           AND ca.assigned_to_user_id = $1::uuid
       ),
       crm_branches AS (
         SELECT b.id AS branch_id, b.branchname AS branch_name, b.clientid AS client_id
         FROM client_branches b
         JOIN crm_clients cc ON cc.client_id = b.clientid
         WHERE b.isactive = TRUE
           AND ($4::uuid IS NULL OR b.clientid = $4)
       )
       SELECT
         cb.branch_id                                    AS "branchId",
         cb.branch_name                                  AS "branchName",
         c.client_name                                   AS "clientName",
         $2::int                                         AS "year",
         $3::int                                         AS "month",
         COUNT(mci.id)                                   AS "totalApplicable",
         COUNT(mci.id) FILTER (WHERE mci.status != 'PENDING')              AS "uploaded",
         COUNT(mci.id) FILTER (WHERE mci.status = 'PENDING')               AS "pending",
         COUNT(mci.id) FILTER (WHERE mci.status = 'RETURNED')              AS "returned",
         COUNT(mci.id) FILTER (WHERE mci.verified_by_user_id IS NOT NULL)  AS "reviewed",
         CASE WHEN COUNT(mci.id) = 0 THEN 0
              ELSE ROUND(100.0 * COUNT(mci.id) FILTER (WHERE mci.status NOT IN ('PENDING','RETURNED'))
                   / NULLIF(COUNT(mci.id), 0))::int
         END                                             AS "pct",
         BOOL_AND(COALESCE(mci.status,'PENDING') NOT IN ('PENDING','RETURNED')) AS "finalized"
       FROM crm_branches cb
       JOIN clients c ON c.id = cb.client_id
       LEFT JOIN compliance_tasks ct
         ON ct.branch_id = cb.branch_id
         AND ct.period_year  = $2::int
         AND ct.period_month = $3::int
       LEFT JOIN compliance_mcd_items mci ON mci.task_id = ct.id
       GROUP BY cb.branch_id, cb.branch_name, c.client_name
       ORDER BY cb.branch_name ASC`,
      [crmUserId, year, month, clientId],
    );

    return { data: rows };
  }

  /**
   * GET /api/v1/crm/compliance-tracker/mcd/:branchId/items
   * List individual MCD checklist items for a branch/month
   * Query: year, month
   */
  @ApiOperation({ summary: 'Mcd Items' })
  @Get('mcd/:branchId/items')
  async mcdItems(
    @CurrentUser() user: ReqUser,
    @Param('branchId') branchId: string,
    @Query() query: Record<string, string>,
  ) {
    const crmUserId = user.id;
    const year = parseInt(query.year, 10) || new Date().getFullYear();
    const month = parseInt(query.month, 10) || new Date().getMonth() + 1;

    // Verify branch is in CRM scope
    const scope = await this.db.many(
      `SELECT b.id
       FROM client_branches b
       JOIN client_assignments_current cac
         ON cac.client_id = b.clientid
         AND cac.assigned_to_user_id = $1
         AND cac.assignment_type = 'CRM'
       WHERE b.id = $2::uuid`,
      [crmUserId, branchId],
    );
    if (!scope.length)
      return { data: [] };

    const items = await this.db.many(
      `SELECT
         mci.id,
         mci.item_key     AS "itemKey",
         mci.item_label   AS "itemLabel",
         mci.unit_type    AS "unitType",
         mci.status,
         mci.remarks,
         mci.uploaded_by_role AS "uploadedByRole",
         mci.verified_at  AS "verifiedAt",
         ct.id            AS "taskId",
         cm.code          AS "complianceCode",
         cm.compliance_name AS "complianceName"
       FROM compliance_mcd_items mci
       JOIN compliance_tasks ct ON ct.id = mci.task_id
       JOIN compliance_master cm ON cm.id = ct.compliance_id
       WHERE ct.branch_id = $1::uuid
         AND ct.period_year = $2::int
         AND ct.period_month = $3::int
       ORDER BY cm.code ASC, mci.item_key ASC`,
      [branchId, year, month],
    );

    // Attach evidence files to each item
    const itemIds = (items as any[]).map((i: any) => i.id);
    const evidenceMap = new Map<number, any[]>();
    if (itemIds.length) {
      const evidenceRows = await this.db.many(
        `SELECT id, mcd_item_id AS "mcdItemId", file_name AS "fileName",
                file_path AS "filePath", file_type AS "fileType",
                file_size AS "fileSize", notes, created_at AS "createdAt"
         FROM compliance_evidence
         WHERE mcd_item_id = ANY($1::int[])
         ORDER BY created_at DESC`,
        [itemIds],
      );
      for (const ev of evidenceRows as any[]) {
        const key = Number(ev.mcdItemId);
        if (!evidenceMap.has(key)) evidenceMap.set(key, []);
        evidenceMap.get(key)!.push(ev);
      }
    }

    const data = (items as any[]).map((i: any) => ({
      ...i,
      evidenceCount: evidenceMap.get(i.id)?.length || 0,
      evidenceFiles: evidenceMap.get(i.id) || [],
    }));

    return { data };
  }

  /**
   * POST /api/v1/crm/compliance-tracker/mcd/item/:itemId/upload
   * Upload evidence for a single MCD checklist item
   * Sets item status to SUBMITTED
   */
  @ApiOperation({ summary: 'Upload MCD Item Evidence' })
  @Post('mcd/item/:itemId/upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async uploadMcdItem(
    @CurrentUser() user: ReqUser,
    @Param('itemId') itemId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('File is required');

    const allowedMimes = new Set([
      'application/pdf',
      'image/png',
      'image/jpeg',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ]);
    if (!allowedMimes.has(file.mimetype)) {
      throw new BadRequestException('File type not allowed. Accepted: PDF, PNG, JPEG, XLS/XLSX');
    }

    const crmUserId = user.id;

    // Verify the MCD item exists and belongs to a branch in CRM scope
    const itemRows = await this.db.many(
      `SELECT mci.id, mci.task_id, mci.status,
              ct.branch_id, ct.period_year, ct.period_month,
              b.clientid AS client_id
       FROM compliance_mcd_items mci
       JOIN compliance_tasks ct ON ct.id = mci.task_id
       JOIN client_branches b ON b.id = ct.branch_id
       JOIN client_assignments_current cac
         ON cac.client_id = b.clientid
         AND cac.assigned_to_user_id = $1
         AND cac.assignment_type = 'CRM'
       WHERE mci.id = $2::int`,
      [crmUserId, parseInt(itemId, 10)],
    );
    if (!itemRows.length) {
      throw new BadRequestException('MCD item not found or not in your scope');
    }

    const item = itemRows[0] as any;
    if (item.status === 'APPROVED' || item.status === 'VERIFIED') {
      throw new BadRequestException('Cannot upload for an already approved/verified item');
    }

    // Save file to disk
    const dir = path.join(
      process.cwd(), 'uploads', 'mcd-evidence',
      item.client_id, item.branch_id,
    );
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const ext = path.extname(file.originalname) || '.pdf';
    const safeName = `mcd_${itemId}_${Date.now()}${ext}`;
    const diskPath = path.join(dir, safeName);
    fs.writeFileSync(diskPath, file.buffer);
    const fileUrl = `mcd-evidence/${item.client_id}/${item.branch_id}/${safeName}`;

    // Create evidence record
    await this.db.many(
      `INSERT INTO compliance_evidence (task_id, mcd_item_id, uploaded_by_user_id, file_name, file_path, file_type, file_size, notes, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       RETURNING id`,
      [item.task_id, parseInt(itemId, 10), crmUserId, file.originalname, fileUrl, file.mimetype, file.size, 'Uploaded by CRM'],
    );

    // Update MCD item status to SUBMITTED, mark as CRM-uploaded
    await this.db.many(
      `UPDATE compliance_mcd_items SET status = 'SUBMITTED', remarks = NULL, uploaded_by_role = 'CRM', updated_at = NOW() WHERE id = $1`,
      [parseInt(itemId, 10)],
    );

    return { ok: true, message: 'Evidence uploaded successfully' };
  }

  /**
   * POST /api/v1/crm/compliance-tracker/mcd/item/:itemId/approve
   * Approve a single MCD checklist item
   */
  @ApiOperation({ summary: 'Approve MCD Item' })
  @Post('mcd/item/:itemId/approve')
  async approveMcdItem(
    @CurrentUser() user: ReqUser,
    @Param('itemId') itemId: string,
  ) {
    const crmUserId = user.id;
    const itemIdNum = parseInt(itemId, 10);

    // Verify the MCD item exists and belongs to a branch in CRM scope
    const itemRows = await this.db.many(
      `SELECT mci.id, mci.status
       FROM compliance_mcd_items mci
       JOIN compliance_tasks ct ON ct.id = mci.task_id
       JOIN client_branches b ON b.id = ct.branch_id
       JOIN client_assignments_current cac
         ON cac.client_id = b.clientid
         AND cac.assigned_to_user_id = $1
         AND cac.assignment_type = 'CRM'
       WHERE mci.id = $2::int`,
      [crmUserId, itemIdNum],
    );
    if (!itemRows.length) {
      throw new BadRequestException('MCD item not found or not in your scope');
    }

    const item = itemRows[0] as any;
    if (item.status === 'APPROVED' || item.status === 'VERIFIED') {
      throw new BadRequestException('Item is already approved/verified');
    }
    if (item.status === 'PENDING') {
      throw new BadRequestException('Cannot approve an item that has not been submitted');
    }

    await this.db.many(
      `UPDATE compliance_mcd_items
       SET status = 'APPROVED',
           verified_by_user_id = $1::uuid,
           verified_at = NOW(),
           updated_at = NOW()
       WHERE id = $2::int`,
      [crmUserId, itemIdNum],
    );

    return { ok: true, message: 'Item approved' };
  }

  /**
   * POST /api/v1/crm/compliance-tracker/mcd/item/:itemId/reject
   * Reject a single MCD checklist item — remarks required
   */
  @ApiOperation({ summary: 'Reject MCD Item' })
  @Post('mcd/item/:itemId/reject')
  async rejectMcdItem(
    @CurrentUser() user: ReqUser,
    @Param('itemId') itemId: string,
    @Body() body: { remarks: string },
  ) {
    const crmUserId = user.id;
    const itemIdNum = parseInt(itemId, 10);
    const remarks = (body.remarks || '').trim();
    if (!remarks) {
      throw new BadRequestException('Remarks are required when rejecting');
    }

    // Verify the MCD item exists and belongs to a branch in CRM scope
    const itemRows = await this.db.many(
      `SELECT mci.id, mci.status
       FROM compliance_mcd_items mci
       JOIN compliance_tasks ct ON ct.id = mci.task_id
       JOIN client_branches b ON b.id = ct.branch_id
       JOIN client_assignments_current cac
         ON cac.client_id = b.clientid
         AND cac.assigned_to_user_id = $1
         AND cac.assignment_type = 'CRM'
       WHERE mci.id = $2::int`,
      [crmUserId, itemIdNum],
    );
    if (!itemRows.length) {
      throw new BadRequestException('MCD item not found or not in your scope');
    }

    const item = itemRows[0] as any;
    if (item.status === 'APPROVED' || item.status === 'VERIFIED') {
      throw new BadRequestException('Cannot reject an already approved/verified item');
    }

    await this.db.many(
      `UPDATE compliance_mcd_items
       SET status = 'REJECTED',
           remarks = $1,
           verified_by_user_id = $2::uuid,
           verified_at = NOW(),
           updated_at = NOW()
       WHERE id = $3::int`,
      [remarks, crmUserId, itemIdNum],
    );

    return { ok: true, message: 'Item rejected' };
  }

  /**
   * POST /api/v1/crm/compliance-tracker/mcd/:branchId/finalize
   * Mark all MCD items for a branch/month as finalized
   * Body: { year, month }
   */
  @ApiOperation({ summary: 'Finalize Mcd' })
  @Post('mcd/:branchId/finalize')
  async finalizeMcd(
    @CurrentUser() user: ReqUser,
    @Param('branchId') branchId: string,
    @Body() body: { year: number; month: number },
  ) {
    const crmUserId = user.id;
    const year = body.year || new Date().getFullYear();
    const month = body.month || new Date().getMonth() + 1;

    // Verify branch is in CRM scope
    const scope = await this.db.many(
      `SELECT b.id
       FROM client_branches b
       JOIN client_assignments_current cac
         ON cac.client_id = b.clientid
         AND cac.assigned_to_user_id = $1
         AND cac.assignment_type = 'CRM'
       WHERE b.id = $2::uuid`,
      [crmUserId, branchId],
    );
    if (!scope.length)
      return { ok: false, message: 'Branch not in your scope' };

    await this.db.many(
      `UPDATE compliance_mcd_items mci
       SET status = 'APPROVED',
           verified_by_user_id = $1::uuid,
           verified_at = NOW(),
           updated_at = NOW()
       FROM compliance_tasks ct
       WHERE mci.task_id = ct.id
         AND ct.branch_id = $2::uuid
         AND ct.period_year = $3::int
         AND ct.period_month = $4::int
         AND mci.status NOT IN ('APPROVED')
       RETURNING mci.id`,
      [crmUserId, branchId, year, month],
    );

    return { ok: true };
  }

  /**
   * POST /api/v1/crm/compliance-tracker/mcd/:branchId/return
   * Return MCD items to branch for correction
   * Body: { year, month, remarks, itemIds? }
   */
  @ApiOperation({ summary: 'Return Mcd' })
  @Post('mcd/:branchId/return')
  async returnMcd(
    @CurrentUser() user: ReqUser,
    @Param('branchId') branchId: string,
    @Body()
    body: { year: number; month: number; remarks: string; itemIds?: string[] },
  ) {
    const crmUserId = user.id;
    const year = body.year || new Date().getFullYear();
    const month = body.month || new Date().getMonth() + 1;
    const remarks = (body.remarks || '').trim();

    if (!remarks) return { ok: false, message: 'Remarks required for return' };

    // Verify branch is in CRM scope
    const scope = await this.db.many(
      `SELECT b.id
       FROM client_branches b
       JOIN client_assignments_current cac
         ON cac.client_id = b.clientid
         AND cac.assigned_to_user_id = $1
         AND cac.assignment_type = 'CRM'
       WHERE b.id = $2::uuid`,
      [crmUserId, branchId],
    );
    if (!scope.length)
      return { ok: false, message: 'Branch not in your scope' };

    // If specific itemIds provided, return only those; otherwise return all non-APPROVED items
    let whereClause = `AND mci.status NOT IN ('RETURNED')`;
    const params: unknown[] = [branchId, year, month, remarks];
    if (body.itemIds?.length) {
      whereClause = `AND mci.id = ANY($5::int[])`;
      params.push(body.itemIds.map(Number));
    }

    const returned = await this.db.many(
      `UPDATE compliance_mcd_items mci
       SET status = 'RETURNED',
           remarks = $4,
           updated_at = NOW()
       FROM compliance_tasks ct
       WHERE mci.task_id = ct.id
         AND ct.branch_id = $1::uuid
         AND ct.period_year = $2::int
         AND ct.period_month = $3::int
         ${whereClause}
       RETURNING mci.id`,
      params,
    );

    return { ok: true, returned: returned.length };
  }

  /**
   * POST /api/v1/crm/compliance-tracker/mcd/:branchId/lock
   * Lock MCD after finalize — prevents further edits
   * Body: { year, month }
   */
  @ApiOperation({ summary: 'Lock Mcd' })
  @Post('mcd/:branchId/lock')
  async lockMcd(
    @CurrentUser() user: ReqUser,
    @Param('branchId') branchId: string,
    @Body() body: { year: number; month: number },
  ) {
    const crmUserId = user.id;
    const year = body.year || new Date().getFullYear();
    const month = body.month || new Date().getMonth() + 1;

    // Verify branch is in CRM scope
    const scope = await this.db.many(
      `SELECT b.id
       FROM client_branches b
       JOIN client_assignments_current cac
         ON cac.client_id = b.clientid
         AND cac.assigned_to_user_id = $1
         AND cac.assignment_type = 'CRM'
       WHERE b.id = $2::uuid`,
      [crmUserId, branchId],
    );
    if (!scope.length)
      return { ok: false, message: 'Branch not in your scope' };

    // Check all items are APPROVED before locking
    const pending = await this.db.many(
      `SELECT mci.id
       FROM compliance_mcd_items mci
       JOIN compliance_tasks ct ON ct.id = mci.task_id
       WHERE ct.branch_id = $1::uuid
         AND ct.period_year = $2::int
         AND ct.period_month = $3::int
         AND mci.status NOT IN ('APPROVED', 'VERIFIED')
       LIMIT 1`,
      [branchId, year, month],
    );
    if (pending.length) {
      return {
        ok: false,
        message: 'Cannot lock: some items are not yet approved',
      };
    }

    // Mark items as VERIFIED (locked)
    await this.db.many(
      `UPDATE compliance_mcd_items mci
       SET status = 'VERIFIED',
           verified_by_user_id = $1::uuid,
           verified_at = NOW(),
           updated_at = NOW()
       FROM compliance_tasks ct
       WHERE mci.task_id = ct.id
         AND ct.branch_id = $2::uuid
         AND ct.period_year = $3::int
         AND ct.period_month = $4::int
         AND mci.status = 'APPROVED'
       RETURNING mci.id`,
      [crmUserId, branchId, year, month],
    );

    return { ok: true };
  }

  /* ═══════ Reupload Backlog KPIs ═══════ */

  /**
   * GET /api/v1/crm/compliance-tracker/reupload-backlog
   * Returns reupload request counts by status + breakdown by targetRole + topUnits
   */
  @ApiOperation({ summary: 'Reupload Backlog' })
  @Get('reupload-backlog')
  async reuploadBacklog(@CurrentUser() user: ReqUser) {
    const crmUserId = user.id;

    // Counts by status + targetRole
    const statusRows = await this.db.many(
      `WITH crm_clients AS (
         SELECT ca.client_id
         FROM client_assignments_current ca
         WHERE ca.assignment_type = 'CRM'
           AND ca.assigned_to_user_id = $1::uuid
       )
       SELECT
         r.status          AS "status",
         r.target_role     AS "targetRole",
         COUNT(*)::int     AS "count"
       FROM document_reupload_requests r
       JOIN crm_clients cc ON cc.client_id = r.client_id
       WHERE r.status IN ('OPEN','SUBMITTED','REJECTED')
       GROUP BY r.status, r.target_role`,
      [crmUserId],
    );

    const sum = (st: string, role?: string) =>
      (statusRows as { status: string; targetRole?: string; count?: number | string }[])
        .filter(
          (r) => r.status === st && (!role || r.targetRole === role),
        )
        .reduce(
          (acc, r) => acc + Number(r.count || 0),
          0,
        );

    const byTargetRole = ['CONTRACTOR', 'CLIENT', 'BRANCH'].map((role) => ({
      targetRole: role,
      open: sum('OPEN', role),
      submitted: sum('SUBMITTED', role),
    }));

    // Top units with most open requests
    const topUnits = await this.db.many(
      `WITH crm_clients AS (
         SELECT ca.client_id
         FROM client_assignments_current ca
         WHERE ca.assignment_type = 'CRM'
           AND ca.assigned_to_user_id = $1::uuid
       )
       SELECT
         r.unit_id                         AS "unitId",
         COALESCE(b.branchname, 'N/A')    AS "unitName",
         COUNT(*) FILTER (WHERE r.status = 'OPEN')::int      AS "open",
         COUNT(*) FILTER (WHERE r.status = 'SUBMITTED')::int AS "submitted"
       FROM document_reupload_requests r
       JOIN crm_clients cc ON cc.client_id = r.client_id
       LEFT JOIN client_branches b ON b.id = r.unit_id
       WHERE r.status IN ('OPEN','SUBMITTED')
       GROUP BY r.unit_id, b.branchname
       ORDER BY COUNT(*) FILTER (WHERE r.status = 'OPEN') DESC
       LIMIT 10`,
      [crmUserId],
    );

    return {
      open: sum('OPEN'),
      submitted: sum('SUBMITTED'),
      rejected: sum('REJECTED'),
      byTargetRole,
      topUnits,
    };
  }

  /* ═══════ Reupload Requests List (drill-down) ═══════ */

  /**
   * GET /api/v1/crm/compliance-tracker/reupload-requests
   * Paginated list with server-side search, overdue/dueSoon filters
   * Query: status, targetRole, clientId, unitId, q, page, limit, overdue, dueSoon, slaDays
   */
  @ApiOperation({ summary: 'Reupload Requests' })
  @Get('reupload-requests')
  async reuploadRequests(
    @CurrentUser() user: ReqUser,
    @Query() query: Record<string, string>,
  ) {
    return this.complianceService.crmListReuploadRequests(user, query);
  }

  /**
   * GET /api/v1/crm/compliance-tracker/reupload-top-units
   * Top 10 units by OPEN/SUBMITTED overdue count
   * Query: slaDays (default 2)
   */
  @ApiOperation({ summary: 'Top Overdue Units' })
  @Get('reupload-top-units')
  async topOverdueUnits(
    @CurrentUser() user: ReqUser,
    @Query() query: Record<string, string>,
  ) {
    return this.complianceService.crmTopOverdueReuploadUnits(user, query);
  }

  /* ═══════ Tab 4: Audit Closures ═══════ */

  /**
   * GET /api/v1/crm/compliance-tracker/audit-closures
   * Audits with observations for CRM's clients
   * Query: clientId (optional)
   */
  @ApiOperation({ summary: 'Audit Closures' })
  @Get('audit-closures')
  async auditClosures(
    @CurrentUser() user: ReqUser,
    @Query() query: Record<string, string>,
  ) {
    const crmUserId = user.id;
    const clientId = query.clientId || null;

    const rows = await this.db.many(
      `WITH crm_clients AS (
         SELECT ca.client_id
         FROM client_assignments_current ca
         WHERE ca.assignment_type = 'CRM'
           AND ca.assigned_to_user_id = $1::uuid
       )
       SELECT
         a.id             AS "auditId",
         a.audit_code     AS "auditCode",
         a.audit_type     AS "auditType",
         c.client_name    AS "clientName",
         b.branchname     AS "branchName",
         u.name           AS "contractorName",
         COUNT(ao.id) FILTER (WHERE ao.status = 'OPEN' AND COALESCE(ao.risk,'') = 'CRITICAL')  AS "criticalOpen",
         COUNT(ao.id) FILTER (WHERE ao.status = 'OPEN' AND COALESCE(ao.risk,'') = 'HIGH')      AS "majorOpen",
         COUNT(ao.id) FILTER (WHERE ao.status = 'OPEN' AND COALESCE(ao.risk,'') IN ('MEDIUM','LOW',''))  AS "minorOpen",
         COUNT(ao.id)                                                     AS "totalObservations",
         COUNT(ao.id) FILTER (WHERE ao.status IN ('RESOLVED','CLOSED'))   AS "closedObservations",
         CASE WHEN COUNT(ao.id) = 0 THEN 100
              ELSE ROUND(100.0 * COUNT(ao.id) FILTER (WHERE ao.status IN ('RESOLVED','CLOSED'))
                   / NULLIF(COUNT(ao.id),0))::int
         END AS "closurePct"
       FROM audits a
       JOIN clients c ON c.id = a.client_id
       JOIN crm_clients cc ON cc.client_id = c.id
       LEFT JOIN client_branches b ON b.id = a.branch_id
       LEFT JOIN users u ON u.id = a.contractor_user_id
       LEFT JOIN audit_observations ao ON ao.audit_id = a.id
       WHERE a.status NOT IN ('CANCELLED')
         AND ($2::uuid IS NULL OR c.id = $2)
       GROUP BY a.id, a.audit_code, a.audit_type, c.client_name, b.branchname, u.name
       HAVING COUNT(ao.id) > 0
       ORDER BY
         COUNT(ao.id) FILTER (WHERE ao.status = 'OPEN' AND COALESCE(ao.risk,'') = 'CRITICAL') DESC,
         CASE WHEN COUNT(ao.id) = 0 THEN 100
              ELSE ROUND(100.0 * COUNT(ao.id) FILTER (WHERE ao.status IN ('RESOLVED','CLOSED'))
                   / NULLIF(COUNT(ao.id),0))::int
         END ASC`,
      [crmUserId, clientId],
    );

    return { data: rows };
  }

  /**
   * POST /api/v1/crm/compliance-tracker/audit-closures/:observationId/close
   * Close an observation
   * Body: { notes?: string }
   */
  @ApiOperation({ summary: 'Close Observation' })
  @Post('audit-closures/:observationId/close')
  async closeObservation(
    @CurrentUser() user: ReqUser,
    @Param('observationId') observationId: string,
    @Body() _body: { notes?: string },
  ) {
    const crmUserId = user.id;

    // Verify observation belongs to CRM's client scope
    const scope = await this.db.many(
      `SELECT ao.id
       FROM audit_observations ao
       JOIN audits a ON a.id = ao.audit_id
       JOIN client_assignments_current cac
         ON cac.client_id = a.client_id
         AND cac.assigned_to_user_id = $1
         AND cac.assignment_type = 'CRM'
       WHERE ao.id = $2::uuid`,
      [crmUserId, observationId],
    );
    if (!scope.length)
      return { ok: false, message: 'Observation not in your scope' };

    await this.db.many(
      `UPDATE audit_observations
       SET status = 'CLOSED',
           updated_at = NOW()
       WHERE id = $1::uuid
       RETURNING id`,
      [observationId],
    );

    return { ok: true };
  }
}
