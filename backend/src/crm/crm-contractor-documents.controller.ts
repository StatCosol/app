import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DbService } from '../common/db/db.service';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';

/**
 * CRM Contractor Documents Controller
 * Provides document list, review, and expiry tracking for CRM users
 * Scoped to CRM's assigned clients via client_assignments_current
 */
@ApiTags('CRM')
@ApiBearerAuth('JWT')
@Controller({ path: 'crm/contractor-documents', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CRM')
export class CrmContractorDocumentsController {
  constructor(private readonly db: DbService) {}

  /**
   * GET /api/v1/crm/contractor-documents/kpis
   * Document work-queue KPI chip counts
   */
  @ApiOperation({ summary: 'Kpis' })
  @Get('kpis')
  async kpis(@CurrentUser() user: ReqUser) {
    const crmUserId = user.id;
    const rows = await this.db.many(
      `WITH crm_clients AS (
         SELECT ca.client_id
         FROM client_assignments_current ca
         WHERE ca.assignment_type = 'CRM'
           AND ca.assigned_to_user_id = $1::uuid
       )
       SELECT
         COUNT(*) FILTER (WHERE cd.status = 'UPLOADED')        AS uploaded,
         COUNT(*) FILTER (WHERE cd.status = 'PENDING_REVIEW')  AS pending_review,
         COUNT(*) FILTER (WHERE cd.status = 'APPROVED')        AS approved,
         COUNT(*) FILTER (WHERE cd.status = 'REJECTED')        AS reupload_required,
         COUNT(*) FILTER (WHERE cd.status = 'EXPIRED'
           OR (cd.expiry_date IS NOT NULL AND cd.expiry_date < CURRENT_DATE)) AS expired
       FROM contractor_documents cd
       JOIN crm_clients cc ON cc.client_id = cd.client_id`,
      [crmUserId],
    );
    return (
      rows[0] || {
        uploaded: 0,
        pending_review: 0,
        approved: 0,
        reupload_required: 0,
        expired: 0,
      }
    );
  }

  /**
   * GET /api/v1/crm/contractor-documents
   * List contractor documents for CRM's assigned clients
   *
   * Query params:
   *  - clientId (optional)
   *  - branchId (optional)
   *  - contractorId (optional)
   *  - status (optional): UPLOADED | PENDING_REVIEW | APPROVED | REJECTED | EXPIRED
   *  - expiringInDays (optional): filter docs expiring within N days
   *  - limit (default 200)
   *  - offset (default 0)
   */
  @ApiOperation({ summary: 'List' })
  @Get()
  async list(
    @CurrentUser() user: ReqUser,
    @Query() query: Record<string, string>,
  ) {
    const crmUserId = user.id;
    const clientId = query.clientId || null;
    const branchId = query.branchId || null;
    const contractorId = query.contractorId || null;
    const status = query.status || null;
    const expiringInDays = query.expiringInDays
      ? parseInt(query.expiringInDays, 10)
      : null;
    const limit = Math.min(parseInt(query.limit, 10) || 200, 500);
    const offset = parseInt(query.offset, 10) || 0;

    const rows = await this.db.many(
      `SELECT
         cd.id,
         cd.doc_type       AS "docType",
         cd.title,
         cd.doc_month      AS "docMonth",
         cd.status,
         cd.file_name      AS "fileName",
         cd.file_path      AS "filePath",
         cd.file_type      AS "fileType",
         cd.expiry_date    AS "expiryDate",
         cd.created_at     AS "createdAt",
         cd.review_notes   AS "reviewNotes",
         cd.reviewed_at    AS "reviewedAt",
         cd.branch_id      AS "branchId",
         b.branchname      AS "branchName",
         cd.client_id      AS "clientId",
         c.client_name     AS "clientName",
         cd.contractor_user_id AS "contractorUserId",
         u.name            AS "contractorName"
       FROM contractor_documents cd
       INNER JOIN clients c ON c.id = cd.client_id
       LEFT JOIN client_branches b ON b.id = cd.branch_id
       INNER JOIN users u ON u.id = cd.contractor_user_id
       INNER JOIN client_assignments_current cac
         ON cac.client_id = c.id
         AND cac.assigned_to_user_id = $1
         AND cac.assignment_type = 'CRM'
       WHERE ($2::uuid IS NULL OR c.id = $2)
         AND ($3::uuid IS NULL OR b.id = $3)
         AND ($4::uuid IS NULL OR cd.contractor_user_id = $4)
         AND ($5::text IS NULL OR cd.status = $5::text)
         AND (
           $6::int IS NULL
           OR (cd.expiry_date IS NOT NULL AND cd.expiry_date <= CURRENT_DATE + ($6 || ' days')::interval)
         )
       ORDER BY cd.created_at DESC
       LIMIT $7 OFFSET $8`,
      [
        crmUserId,
        clientId,
        branchId,
        contractorId,
        status,
        expiringInDays,
        limit,
        offset,
      ],
    );

    return { data: rows };
  }

  /**
   * POST /api/v1/crm/contractor-documents/:id/review
   * Approve or reject a contractor document
   *
   * Body: { status: 'APPROVED' | 'REJECTED', reviewNotes?: string }
   */
  @ApiOperation({ summary: 'Review' })
  @Post(':id/review')
  async review(
    @CurrentUser() user: ReqUser,
    @Param('id') id: string,
    @Body() body: { status: string; reviewNotes?: string },
  ) {
    const crmUserId = user.id;
    const newStatus = body.status;
    const notes = body.reviewNotes || null;

    if (!['APPROVED', 'REJECTED'].includes(newStatus)) {
      throw new BadRequestException('Status must be APPROVED or REJECTED');
    }

    // Verify doc belongs to CRM's assigned client
    const docs = await this.db.many(
      `SELECT cd.id
       FROM contractor_documents cd
       INNER JOIN clients c ON c.id = cd.client_id
       INNER JOIN client_assignments_current cac
         ON cac.client_id = c.id
         AND cac.assigned_to_user_id = $1
         AND cac.assignment_type = 'CRM'
       WHERE cd.id = $2`,
      [crmUserId, id],
    );

    if (!docs.length) {
      throw new NotFoundException('Document not found or not in your scope');
    }

    await this.db.many(
      `UPDATE contractor_documents
       SET status = $1::contractor_document_status,
           review_notes = $2,
           reviewed_by_user_id = $3,
           reviewed_at = NOW()
       WHERE id = $4
       RETURNING id`,
      [newStatus, notes, crmUserId, id],
    );

    return { ok: true };
  }
}
