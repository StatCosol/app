import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ReqUser } from '../access/access-scope.service';
import { NonComplianceEngineService } from '../automation/services/non-compliance-engine.service';
import { AuditOutputEngineService } from '../automation/services/audit-output-engine.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AuditEntity } from './entities/audit.entity';
import { AuditDocumentReviewEntity } from './entities/audit-document-review.entity';
import { AuditNonComplianceEntity } from './entities/audit-non-compliance.entity';
import { AuditResubmissionEntity } from './entities/audit-resubmission.entity';

@Injectable()
export class AuditNcService {
  constructor(
    @InjectRepository(AuditEntity)
    private readonly repo: Repository<AuditEntity>,
    @InjectRepository(AuditDocumentReviewEntity)
    private readonly docReviewRepo: Repository<AuditDocumentReviewEntity>,
    @InjectRepository(AuditNonComplianceEntity)
    private readonly ncRepo: Repository<AuditNonComplianceEntity>,
    @InjectRepository(AuditResubmissionEntity)
    private readonly resubRepo: Repository<AuditResubmissionEntity>,
    private readonly dataSource: DataSource,
    private readonly ncEngine: NonComplianceEngineService,
    private readonly auditOutputEngine: AuditOutputEngineService,
    @Optional() private readonly auditLogs?: AuditLogsService,
  ) {}

  private assertAuditor(user: ReqUser) {
    if (!user || user.roleCode !== 'AUDITOR') {
      throw new ForbiddenException('Auditor access only');
    }
  }

  /** List NCs for an audit (auditor view). */
  async listNcsForAudit(user: ReqUser, auditId: string) {
    this.assertAuditor(user);
    const audit = await this.repo.findOne({ where: { id: auditId } });
    if (!audit) throw new NotFoundException('Audit not found');
    if (audit.assignedAuditorId !== user.userId) {
      throw new ForbiddenException('Audit not assigned to you');
    }
    const ncs = await this.ncRepo.find({
      where: { auditId },
      order: { createdAt: 'DESC' },
    });
    const todayStr = new Date().toISOString().slice(0, 10);
    return {
      auditId,
      preliminaryPublishedAt: audit.preliminaryPublishedAt,
      vendorWindowDays: audit.vendorWindowDays,
      counts: {
        total: ncs.length,
        open: ncs.filter(
          (n) => n.status === 'NC_RAISED' || n.status === 'AWAITING_REUPLOAD',
        ).length,
        reuploaded: ncs.filter(
          (n) =>
            n.status === 'REUPLOADED' || n.status === 'REVERIFICATION_PENDING',
        ).length,
        accepted: ncs.filter(
          (n) => n.status === 'ACCEPTED' || n.status === 'CLOSED',
        ).length,
        recurring: ncs.filter((n) => n.isRecurring).length,
        overdue: ncs.filter(
          (n) =>
            (n.status === 'NC_RAISED' || n.status === 'AWAITING_REUPLOAD') &&
            n.vendorWindowUntil &&
            n.vendorWindowUntil < todayStr,
        ).length,
      },
      items: ncs.map((n) => ({
        id: n.id,
        documentName: n.documentName,
        remark: n.remark,
        status: n.status,
        requestedToRole: n.requestedToRole,
        publishedAt: n.publishedAt,
        vendorWindowUntil: n.vendorWindowUntil,
        dueDate: n.dueDate,
        isRecurring: n.isRecurring,
        recurrenceCount: n.recurrenceCount,
        originalNcId: n.originalNcId,
        raisedAt: n.raisedAt,
        closedAt: n.closedAt,
      })),
    };
  }

  /** List NCs assigned to the calling vendor/contractor. */
  async listNcsForVendor(user: ReqUser, auditId: string) {
    if (!user) throw new ForbiddenException('Auth required');
    const audit = await this.repo.findOne({ where: { id: auditId } });
    if (!audit) throw new NotFoundException('Audit not found');
    // Vendor must either be the contractor on this audit, or a CLIENT user for the same client
    const isContractor = audit.contractorUserId === user.userId;
    let isClientUser = false;
    if (!isContractor && user.roleCode === 'CLIENT') {
      const rows = await this.dataSource.query(
        `SELECT 1 FROM users WHERE id = $1 AND client_id = $2 AND deleted_at IS NULL LIMIT 1`,
        [user.userId, audit.clientId],
      );
      isClientUser = rows.length > 0;
    }
    if (!isContractor && !isClientUser) {
      throw new ForbiddenException('You do not have access to this audit');
    }

    if (!audit.preliminaryPublishedAt) {
      return {
        auditId,
        publishedAt: null,
        message: 'Preliminary findings have not been published yet.',
        items: [],
      };
    }

    const ncs = await this.ncRepo.find({
      where: { auditId },
      order: { createdAt: 'DESC' },
    });
    const visible = ncs.filter((n) => !!n.publishedAt);
    const todayStr = new Date().toISOString().slice(0, 10);
    return {
      auditId,
      publishedAt: audit.preliminaryPublishedAt,
      vendorWindowDays: audit.vendorWindowDays,
      counts: {
        total: visible.length,
        open: visible.filter(
          (n) => n.status === 'NC_RAISED' || n.status === 'AWAITING_REUPLOAD',
        ).length,
        overdue: visible.filter(
          (n) =>
            (n.status === 'NC_RAISED' || n.status === 'AWAITING_REUPLOAD') &&
            n.vendorWindowUntil &&
            n.vendorWindowUntil < todayStr,
        ).length,
      },
      items: visible.map((n) => ({
        id: n.id,
        documentName: n.documentName,
        remark: n.remark,
        status: n.status,
        vendorWindowUntil: n.vendorWindowUntil,
        isOverdue:
          (n.status === 'NC_RAISED' || n.status === 'AWAITING_REUPLOAD') &&
          !!n.vendorWindowUntil &&
          n.vendorWindowUntil < todayStr,
        publishedAt: n.publishedAt,
      })),
    };
  }


  async getNonCompliancesForAudit(user: ReqUser, auditId: string) {
    this.assertAuditor(user);
    const audit = await this.repo.findOne({ where: { id: auditId } });
    if (!audit) throw new NotFoundException('Audit not found');
    if (audit.assignedAuditorId !== user.userId)
      throw new ForbiddenException('Not your audit');

    const ncs = await this.dataSource.query(
      `SELECT nc.id,
              nc.audit_id AS "auditId",
              nc.document_id AS "documentId",
              nc.source_table AS "sourceTable",
              nc.document_name AS "documentName",
              nc.requested_to_role AS "requestedToRole",
              nc.requested_to_user_id AS "requestedToUserId",
              nc.remark,
              nc.status,
              nc.raised_at AS "raisedAt",
              nc.closed_at AS "closedAt",
              nc.updated_at AS "updatedAt",
              rs.id AS "resubmissionId",
              rs.file_path AS "correctedFilePath",
              rs.file_name AS "correctedFileName",
              rs.mime_type AS "correctedMimeType",
              rs.file_size AS "correctedFileSize",
              rs.resubmitted_at AS "resubmittedAt",
              rs.final_mark AS "finalMark",
              rs.auditor_remark AS "auditorRemark",
              rs.reviewed_at AS "reviewedAt",
              u.name AS "resubmittedByName"
       FROM audit_non_compliances nc
       LEFT JOIN audit_resubmissions rs
         ON rs.non_compliance_id = nc.id
        AND rs.id = (
          SELECT r2.id
          FROM audit_resubmissions r2
          WHERE r2.non_compliance_id = nc.id
          ORDER BY r2.resubmitted_at DESC
          LIMIT 1
        )
       LEFT JOIN users u ON u.id = rs.resubmitted_by
       WHERE nc.audit_id = $1
       ORDER BY COALESCE(rs.resubmitted_at, nc.raised_at) DESC, nc.raised_at DESC`,
      [auditId],
    );
    const summary = {
      total: ncs.length,
      ncRaised: ncs.filter((n) => n.status === 'NC_RAISED').length,
      awaitingReupload: ncs.filter((n) => n.status === 'AWAITING_REUPLOAD')
        .length,
      reuploaded: ncs.filter((n) => n.status === 'REUPLOADED').length,
      reverificationPending: ncs.filter(
        (n) => n.status === 'REVERIFICATION_PENDING',
      ).length,
      accepted: ncs.filter((n) => n.status === 'ACCEPTED').length,
      closed: ncs.filter((n) => n.status === 'CLOSED').length,
    };
    return { items: ncs, summary };
  }

  // ─── Reverification List (all audits for this auditor with reuploaded NC) ──
  async getReverificationList(user: ReqUser) {
    this.assertAuditor(user);
    const rows = await this.dataSource.query(
      `SELECT nc.id AS "ncId", nc.audit_id AS "auditId", nc.document_id AS "documentId",
              nc.source_table AS "sourceTable", nc.document_name AS "documentName",
              nc.remark AS "previousRemark", nc.status,
              nc.raised_at AS "raisedAt", nc.requested_to_role AS "requestedToRole",
              a.audit_code AS "auditCode", a.audit_type AS "auditType",
              a.period_code AS "periodCode",
              c.client_name AS "clientName",
              cb.branchname AS "branchName",
              cu.name AS "contractorName",
              rs.id AS "resubmissionId", rs.file_path AS "correctedFilePath",
              rs.file_name AS "correctedFileName", rs.resubmitted_at AS "resubmittedAt",
              rsu.name AS "resubmittedByName"
       FROM audit_non_compliances nc
       JOIN audits a ON a.id = nc.audit_id
       JOIN clients c ON c.id = a.client_id
       LEFT JOIN client_branches cb ON cb.id = a.branch_id
       LEFT JOIN users cu ON cu.id = a.contractor_user_id
       LEFT JOIN audit_resubmissions rs ON rs.non_compliance_id = nc.id
         AND rs.id = (SELECT r2.id FROM audit_resubmissions r2
                      WHERE r2.non_compliance_id = nc.id ORDER BY r2.resubmitted_at DESC LIMIT 1)
       LEFT JOIN users rsu ON rsu.id = rs.resubmitted_by
       WHERE a.assigned_auditor_id = $1
         AND nc.status IN ('REUPLOADED','REVERIFICATION_PENDING')
       ORDER BY rs.resubmitted_at DESC NULLS LAST, nc.raised_at DESC`,
      [user.userId],
    );
    return rows;
  }

  // ─── Review corrected document (reverification) ────────────────
  async reviewCorrectedDocument(
    user: ReqUser,
    ncId: string,
    decision: 'COMPLIED' | 'NON_COMPLIED',
    remark?: string,
  ) {
    this.assertAuditor(user);
    const nc = await this.ncRepo.findOne({ where: { id: ncId } });
    if (!nc) throw new NotFoundException('Non-compliance not found');

    const audit = await this.repo.findOne({ where: { id: nc.auditId } });
    if (!audit || audit.assignedAuditorId !== user.userId) {
      throw new ForbiddenException('Not your audit');
    }
    if (decision === 'NON_COMPLIED' && (!remark || remark.trim().length < 5)) {
      throw new BadRequestException(
        'Remarks of at least 5 characters are required when rejecting a corrected document',
      );
    }

    if (decision === 'COMPLIED') {
      nc.status = 'ACCEPTED';
      nc.closedAt = new Date();
    } else {
      nc.status = 'NC_RAISED'; // re-raise
      audit.status = 'CORRECTION_PENDING';
    }
    nc.remark = remark || nc.remark;
    await this.ncRepo.save(nc);

    // Update the latest resubmission record
    const latestResub = await this.resubRepo.findOne({
      where: { nonComplianceId: ncId },
      order: { resubmittedAt: 'DESC' },
    });
    if (latestResub) {
      latestResub.finalMark = decision;
      latestResub.auditorRemark = remark || null;
      latestResub.reviewedBy = user.userId;
      latestResub.reviewedAt = new Date();
      await this.resubRepo.save(latestResub);
    }

    // Also update the original document status
    if (nc.documentId && nc.sourceTable) {
      const statusMap: Record<string, string> = {
        COMPLIED: 'APPROVED',
        NON_COMPLIED: 'REJECTED',
      };
      if (nc.sourceTable === 'branch_documents') {
        await this.dataSource.query(
          `UPDATE branch_documents SET status = $1, remarks = $2, reviewed_by = $3, reviewed_at = NOW() WHERE id = $4`,
          [statusMap[decision], remark || null, user.userId, nc.documentId],
        );
      } else {
        await this.dataSource.query(
          `UPDATE contractor_documents SET status = $1, review_notes = $2, reviewed_by_user_id = $3, reviewed_at = NOW() WHERE id = $4`,
          [statusMap[decision], remark || null, user.userId, nc.documentId],
        );
      }
    }

    // Create a new review record for the corrected version
    if (nc.documentId) {
      const tbl = nc.sourceTable || 'contractor_documents';
      const prevReview = await this.docReviewRepo.findOne({
        where: {
          auditId: nc.auditId,
          documentId: nc.documentId,
          sourceTable: tbl,
        },
        order: { version: 'DESC' },
      });
      const reviewRecord = this.docReviewRepo.create({
        auditId: nc.auditId,
        documentId: nc.documentId,
        sourceTable: tbl,
        complianceMark: decision,
        auditorRemark: remark || null,
        version: prevReview ? prevReview.version + 1 : 1,
        reviewedBy: user.userId,
        reviewedAt: new Date(),
      });
      await this.docReviewRepo.save(reviewRecord);
    }

    // Check if all NCs for this audit are resolved — auto-transition to CLOSED
    const openNcs = await this.ncRepo.count({
      where: { auditId: nc.auditId },
    });
    const closedNcs = await this.ncRepo.count({
      where: [
        { auditId: nc.auditId, status: 'ACCEPTED' },
        { auditId: nc.auditId, status: 'CLOSED' },
      ],
    });
    if (openNcs > 0 && openNcs === closedNcs) {
      audit.status = 'CLOSED';
      await this.repo.save(audit);
    }

    // ── Automation hooks ──
    try {
      if (decision === 'COMPLIED') {
        await this.ncEngine.closeNc(ncId);
        // Recalculate score + report after this NC acceptance
        await this.auditOutputEngine.refreshAuditOutputs(nc.auditId);
      } else {
        // Re-raised NC → create a new system task
        await this.ncEngine.createTaskForNc(ncId);
      }
    } catch {
      // Non-critical automation hooks
    }

    // Phase 5: emit NC review log
    try {
      await this.auditLogs?.log({
        entityType: 'AUDIT_NC',
        entityId: ncId,
        action: decision === 'COMPLIED' ? 'NC_ACCEPTED' : 'NC_REJECTED',
        performedBy: user.userId,
        performedRole: user.roleCode || null,
        reason: remark || null,
        meta: { auditId: nc.auditId },
      });
    } catch {
      /* non-critical */
    }

    return { ncId, status: nc.status, decision };
  }

  /** Phase 5 — Repeat-NC analytics for a client across all audits. */
  async getRepeatNcAnalytics(user: ReqUser, clientId: string) {
    if (!user) throw new ForbiddenException('Auth required');
    if (
      !['AUDITOR', 'ADMIN', 'CRM', 'CCO', 'CEO'].includes(user.roleCode || '')
    ) {
      throw new ForbiddenException('Insufficient role for analytics');
    }
    if (user.roleCode === 'CCO') {
      const rows = await this.dataSource.query(
        `SELECT 1
           FROM clients c
           INNER JOIN users crm ON crm.id = c.assigned_crm_id
          WHERE c.id = $1
            AND crm.owner_cco_id = $2
            AND crm.deleted_at IS NULL
          LIMIT 1`,
        [clientId, user.userId ?? user.id],
      );
      if (!rows.length) throw new ForbiddenException('Client not in CCO scope');
    }
    const rows = await this.dataSource.query(
      `SELECT nc.finding_signature        AS "signature",
              MAX(nc.document_name)       AS "documentName",
              COUNT(*)::int               AS "occurrences",
              COUNT(DISTINCT nc.audit_id)::int AS "audits",
              MAX(nc.created_at)          AS "lastSeenAt",
              MAX(nc.recurrence_count)::int AS "maxRecurrenceCount"
         FROM audit_non_compliances nc
         JOIN audits a ON a.id = nc.audit_id
        WHERE a.client_id = $1
          AND nc.finding_signature IS NOT NULL
        GROUP BY nc.finding_signature
       HAVING COUNT(DISTINCT nc.audit_id) > 1
        ORDER BY COUNT(*) DESC, MAX(nc.created_at) DESC
        LIMIT 100`,
      [clientId],
    );
    return {
      clientId,
      totalRepeatGroups: rows.length,
      items: rows,
    };
  }

  /** Phase 5 — list overdue NCs across the calling auditor's audits. */
  async listOverdueNcsForAuditor(user: ReqUser) {
    this.assertAuditor(user);
    const today = new Date().toISOString().slice(0, 10);
    const rows = await this.dataSource.query(
      `SELECT nc.id                       AS "ncId",
              nc.audit_id                 AS "auditId",
              a.audit_code                AS "auditCode",
              a.client_id                 AS "clientId",
              c.client_name               AS "clientName",
              a.branch_id                 AS "branchId",
              b.branchname                AS "branchName",
              nc.document_name            AS "documentName",
              nc.remark                   AS "remark",
              nc.status                   AS "status",
              nc.vendor_window_until      AS "vendorWindowUntil",
              nc.requested_to_role        AS "requestedToRole",
              nc.requested_to_user_id     AS "requestedToUserId",
              nc.recurrence_count         AS "recurrenceCount",
              nc.created_at               AS "createdAt",
              ($1::date - nc.vendor_window_until)::int AS "daysOverdue"
         FROM audit_non_compliances nc
         JOIN audits a ON a.id = nc.audit_id
         LEFT JOIN clients  c ON c.id = a.client_id
         LEFT JOIN client_branches b ON b.id = a.branch_id
        WHERE a.assigned_auditor_id = $2
          AND nc.status IN ('NC_RAISED','AWAITING_REUPLOAD')
          AND nc.vendor_window_until IS NOT NULL
          AND nc.vendor_window_until < $1::date
          AND nc.closed_at IS NULL
        ORDER BY nc.vendor_window_until ASC
        LIMIT 500`,
      [today, user.userId],
    );
    return { total: rows.length, asOf: today, items: rows };
  }

  async getNonCompliancesForContractor(user: ReqUser) {
    return this.dataSource.query(
      `SELECT nc.id, nc.audit_id AS "auditId", nc.document_name AS "documentName",
              nc.remark, nc.status, nc.raised_at AS "raisedAt",
              a.audit_code AS "auditCode", a.audit_type AS "auditType",
              cb.branchname AS "branchName"
       FROM audit_non_compliances nc
       JOIN audits a ON a.id = nc.audit_id
       LEFT JOIN client_branches cb ON cb.id = a.branch_id
       WHERE nc.requested_to_user_id = $1
         AND nc.status NOT IN ('CLOSED','ACCEPTED')
       ORDER BY nc.raised_at DESC`,
      [user.userId],
    );
  }

  async uploadCorrectedFile(
    user: ReqUser,
    ncId: string,
    file: {
      path: string;
      originalname: string;
      mimetype: string;
      size: number;
    },
  ) {
    const nc = await this.ncRepo.findOne({ where: { id: ncId } });
    if (!nc) throw new NotFoundException('Non-compliance not found');
    if (nc.requestedToUserId !== user.userId)
      throw new ForbiddenException('Not your NC');

    const resub = this.resubRepo.create({
      auditId: nc.auditId,
      nonComplianceId: ncId,
      documentId: nc.documentId,
      sourceTable: nc.sourceTable,
      filePath: file.path,
      fileName: file.originalname,
      mimeType: file.mimetype,
      fileSize: file.size,
      resubmittedBy: user.userId,
    });
    await this.resubRepo.save(resub);

    nc.status = 'REUPLOADED';
    await this.ncRepo.save(nc);

    // Phase 5: emit log
    try {
      await this.auditLogs?.log({
        entityType: 'AUDIT_NC',
        entityId: nc.id,
        action: 'NC_REUPLOADED',
        performedBy: user.userId,
        performedRole: user.roleCode || null,
        meta: { auditId: nc.auditId, fileName: file.originalname },
      });
    } catch {
      /* non-critical */
    }

    // Update audit status to REVERIFICATION_PENDING if it was CORRECTION_PENDING
    const audit = await this.repo.findOne({ where: { id: nc.auditId } });
    if (
      audit &&
      (audit.status === 'CORRECTION_PENDING' || audit.status === 'SUBMITTED')
    ) {
      audit.status = 'REVERIFICATION_PENDING';
      await this.repo.save(audit);
    }

    return { resubmissionId: resub.id, status: nc.status };
  }
}
