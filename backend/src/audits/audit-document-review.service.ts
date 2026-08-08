import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { ReqUser } from '../access/access-scope.service';
import { NonComplianceEngineService } from '../automation/services/non-compliance-engine.service';
import { AuditEntity } from './entities/audit.entity';
import { AuditObservationEntity } from './entities/audit-observation.entity';
import { AuditChecklistItemEntity } from './entities/audit-checklist-item.entity';
import { AuditDocumentReviewEntity } from './entities/audit-document-review.entity';
import { AuditNonComplianceEntity } from './entities/audit-non-compliance.entity';
import { RejectionMailService } from '../email/rejection-mail.service';
import { AuditListingService } from './audit-listing.service';

@Injectable()
export class AuditDocumentReviewService {
  private readonly logger = new Logger(AuditDocumentReviewService.name);

  constructor(
    @InjectRepository(AuditEntity)
    private readonly repo: Repository<AuditEntity>,
    @InjectRepository(AuditObservationEntity)
    private readonly observationRepo: Repository<AuditObservationEntity>,
    @InjectRepository(AuditChecklistItemEntity)
    private readonly checklistRepo: Repository<AuditChecklistItemEntity>,
    @InjectRepository(AuditDocumentReviewEntity)
    private readonly docReviewRepo: Repository<AuditDocumentReviewEntity>,
    @InjectRepository(AuditNonComplianceEntity)
    private readonly ncRepo: Repository<AuditNonComplianceEntity>,
    private readonly dataSource: DataSource,
    private readonly ncEngine: NonComplianceEngineService,
    private readonly listingService: AuditListingService,
    private readonly rejectionMail: RejectionMailService,
  ) {}

  private assertAuditor(user: ReqUser) {
    if (!user || user.roleCode !== 'AUDITOR') {
      throw new ForbiddenException('Auditor access only');
    }
  }

  // ─── Auditor: List Documents for Audit ─────────────────────────
  async listDocumentsForAudit(user: ReqUser, auditId: string) {
    const audit = await this.listingService.getForAuditor(user, auditId);

    // Parse period from period_code (e.g. "2026-03" → year=2026, month=3)
    const periodParts = (audit.periodCode || '').split('-');
    const pYear = Number(periodParts[0]) || audit.periodYear;
    const pMonth = periodParts.length >= 2 ? Number(periodParts[1]) : null;

    // ── Branch documents (for branch-scoped audits like FACTORY, S&E, etc.) ──
    let branchDocs: Array<Record<string, unknown>> = [];
    if (audit.branchId) {
      const bp: unknown[] = [audit.clientId, audit.branchId];
      let bWhere = `WHERE bd.client_id = $1 AND bd.branch_id = $2`;

      // Filter by period if available
      if (pYear) {
        bp.push(pYear);
        bWhere += ` AND bd.period_year = $${bp.length}`;
      }
      if (pMonth) {
        bp.push(pMonth);
        bWhere += ` AND bd.period_month = $${bp.length}`;
      }

      branchDocs = await this.dataSource.query(
        `SELECT bd.id, 'branch_documents' AS "sourceTable",
                bd.branch_id AS "branchId",
                bd.doc_type AS "docType", bd.category,
                bd.file_name AS "fileName",
                bd.file_path AS "filePath", bd.mime_type AS "fileType",
                bd.file_size AS "fileSize", bd.status,
                bd.remarks AS "reviewNotes",
                bd.reviewed_by AS "reviewedByUserId",
                bd.reviewed_at AS "reviewedAt",
                bd.period_year AS "periodYear", bd.period_month AS "periodMonth",
                bd.created_at AS "createdAt",
                u.name AS "uploadedByName", u.email AS "uploadedByEmail",
                cb.branchname AS "branchName"
         FROM branch_documents bd
         LEFT JOIN users u ON u.id = bd.uploaded_by
         LEFT JOIN client_branches cb ON cb.id = bd.branch_id
         ${bWhere}
         ORDER BY bd.created_at DESC`,
        bp,
      );
    }

    // ── Contractor documents (for contractor-scoped or linked docs) ──
    let contractorDocs: Array<Record<string, unknown>> = [];
    {
      const cp: unknown[] = [audit.clientId];
      let cWhere = `WHERE cd.client_id = $1`;

      if (audit.contractorUserId) {
        cp.push(audit.contractorUserId);
        cWhere += ` AND cd.contractor_user_id = $${cp.length}`;
      }
      if (audit.branchId) {
        cp.push(audit.branchId);
        cWhere += ` AND cd.branch_id = $${cp.length}`;
      }
      // Include docs explicitly linked to this audit OR matching the period
      cp.push(auditId);
      const auditFilter = `cd.audit_id = $${cp.length}`;
      let periodFilter = '';
      if (pYear && pMonth) {
        const monthKey = `${pYear}-${String(pMonth).padStart(2, '0')}`;
        cp.push(monthKey);
        periodFilter = `cd.doc_month = $${cp.length}`;
      }
      if (periodFilter) {
        cWhere += ` AND (${auditFilter} OR ${periodFilter})`;
      } else {
        cWhere += ` AND ${auditFilter}`;
      }

      contractorDocs = await this.dataSource.query(
        `SELECT cd.id, 'contractor_documents' AS "sourceTable",
                cd.contractor_user_id AS "contractorUserId",
                cd.branch_id AS "branchId",
                cd.doc_type AS "docType", cd.title,
                cd.file_name AS "fileName",
                cd.file_path AS "filePath", cd.file_type AS "fileType",
                cd.file_size AS "fileSize", cd.status,
                cd.review_notes AS "reviewNotes",
                cd.reviewed_by_user_id AS "reviewedByUserId",
                cd.reviewed_at AS "reviewedAt",
                cd.doc_month AS "docMonth", cd.expiry_date AS "expiryDate",
                cd.created_at AS "createdAt",
                u.name AS "contractorName", u.email AS "contractorEmail",
                cb.branchname AS "branchName"
         FROM contractor_documents cd
         LEFT JOIN users u ON u.id = cd.contractor_user_id
         LEFT JOIN client_branches cb ON cb.id = cd.branch_id
         ${cWhere}
         ORDER BY cb.branchname NULLS LAST, cd.created_at DESC`,
        cp,
      );
    }

    return {
      auditId,
      auditType: audit.auditType,
      branchId: audit.branchId,
      contractorUserId: audit.contractorUserId,
      periodCode: audit.periodCode,
      branchDocuments: branchDocs,
      contractorDocuments: contractorDocs,
    };
  }

  // ─── Auditor: Review Document (COMPLIED / NON_COMPLIED) ───────
  async reviewDocumentForAudit(
    user: ReqUser,
    auditId: string,
    docId: string,
    decision: 'COMPLIED' | 'NON_COMPLIED',
    remarks?: string,
    sourceTable?: string,
  ) {
    this.assertAuditor(user);
    const audit = await this.repo.findOne({ where: { id: auditId } });
    if (!audit) throw new NotFoundException('Audit not found');
    if (audit.assignedAuditorId !== user.userId) {
      throw new ForbiddenException('Not your audit');
    }

    const statusMap: Record<string, string> = {
      COMPLIED: 'APPROVED',
      NON_COMPLIED: 'REJECTED',
    };

    const newStatus = statusMap[decision];
    if (!newStatus) throw new BadRequestException('Invalid decision');
    if (
      decision === 'NON_COMPLIED' &&
      (!remarks || remarks.trim().length < 5)
    ) {
      throw new BadRequestException(
        'Remarks of at least 5 characters are required when rejecting a document',
      );
    }

    if (sourceTable === 'branch_documents') {
      // AX-H2: ensure the branch document is actually scoped to this audit
      // (either explicitly via audit_id, or via matching client/branch).
      const docRows = await this.dataSource.query(
        `SELECT audit_id, client_id, branch_id
         FROM branch_documents WHERE id = $1`,
        [docId],
      );
      if (!docRows.length) {
        throw new NotFoundException('Document not found');
      }
      const d = docRows[0] as {
        audit_id?: string | null;
        client_id?: string | null;
        branch_id?: string | null;
      };
      const matchesAudit =
        (d.audit_id && d.audit_id === auditId) ||
        (d.client_id === audit.clientId &&
          (audit.branchId ? d.branch_id === audit.branchId : true));
      if (!matchesAudit) {
        throw new ForbiddenException('Document does not belong to this audit');
      }
      await this.dataSource.query(
        `UPDATE branch_documents
         SET status = $1,
             remarks = $2,
             reviewed_by = $3,
             reviewed_at = NOW(),
             reviewer_role = 'AUDITOR'
         WHERE id = $4`,
        [newStatus, remarks || null, user.userId, docId],
      );
    } else {
      // AX-H2: ensure the contractor document is in scope of this audit.
      const docRows = await this.dataSource.query(
        `SELECT audit_id, client_id, branch_id, contractor_user_id
         FROM contractor_documents WHERE id = $1`,
        [docId],
      );
      if (!docRows.length) {
        throw new NotFoundException('Document not found');
      }
      const d = docRows[0] as {
        audit_id?: string | null;
        client_id?: string | null;
        branch_id?: string | null;
        contractor_user_id?: string | null;
      };
      const matchesAudit =
        (d.audit_id && d.audit_id === auditId) ||
        (d.client_id === audit.clientId &&
          (audit.branchId ? d.branch_id === audit.branchId : true) &&
          (audit.contractorUserId
            ? d.contractor_user_id === audit.contractorUserId
            : true));
      if (!matchesAudit) {
        throw new ForbiddenException('Document does not belong to this audit');
      }
      await this.dataSource.query(
        `UPDATE contractor_documents
         SET status = $1,
             review_notes = $2,
             reviewed_by_user_id = $3,
             reviewed_at = NOW(),
             audit_id = $4
         WHERE id = $5`,
        [newStatus, remarks || null, user.userId, auditId, docId],
      );
    }

    // Create formal review record
    const tbl = sourceTable || 'contractor_documents';
    const existingReview = await this.docReviewRepo.findOne({
      where: { auditId, documentId: docId, sourceTable: tbl },
      order: { version: 'DESC' },
    });
    const version = existingReview ? existingReview.version + 1 : 1;
    const reviewRecord = this.docReviewRepo.create({
      auditId,
      documentId: docId,
      sourceTable: tbl,
      complianceMark: decision,
      auditorRemark: remarks || null,
      version,
      reviewedBy: user.userId,
      reviewedAt: new Date(),
    });
    await this.docReviewRepo.save(reviewRecord);

    // Auto-create NC entry if NON_COMPLIED
    if (decision === 'NON_COMPLIED') {
      // Get document name for display
      const docNameQuery =
        tbl === 'branch_documents'
          ? `SELECT file_name AS name FROM branch_documents WHERE id = $1`
          : `SELECT COALESCE(title, file_name) AS name FROM contractor_documents WHERE id = $1`;
      const docNameRows = await this.dataSource.query(docNameQuery, [docId]);
      const docName = docNameRows[0]?.name || 'Unknown document';

      // Determine who to request correction from
      let requestedToRole: string | null = null;
      let requestedToUserId: string | null = null;
      if (tbl === 'contractor_documents' && audit.contractorUserId) {
        requestedToRole = 'CONTRACTOR';
        requestedToUserId = audit.contractorUserId;
      } else if (tbl === 'branch_documents' && audit.branchId) {
        requestedToRole = 'CLIENT';
        // Find branch user
        const branchUsers = await this.dataSource.query(
          `SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id
           WHERE u.client_id = $1 AND r.code = 'CLIENT' AND u.deleted_at IS NULL LIMIT 1`,
          [audit.clientId],
        );
        requestedToUserId = branchUsers[0]?.id || null;
      }

      const nc = this.ncRepo.create({
        auditId,
        documentId: docId,
        sourceTable: tbl,
        documentReviewId: reviewRecord.id,
        documentName: docName,
        requestedToRole,
        requestedToUserId,
        remark: remarks || null,
        status: 'NC_RAISED',
      });
      await this.ncRepo.save(nc);

      // Create a system task for the NC so it shows in the task center
      try {
        await this.ncEngine.createTaskForNc(nc.id);
      } catch {
        // non-critical: task creation failure should not break the review
      }

      // Item #7: notify the contractor with NC + Solution mail (best-effort).
      this.notifyAuditRejection(audit, docName, remarks).catch(() => undefined);
    }

    // If previously NON_COMPLIED and now COMPLIED, close the NC + task
    if (decision === 'COMPLIED') {
      const openNcs = await this.ncRepo.find({
        where: {
          auditId,
          documentId: docId,
          sourceTable: tbl,
          status: 'NC_RAISED',
        },
      });
      for (const openNc of openNcs) {
        try {
          await this.ncEngine.closeNc(openNc.id);
        } catch (e: unknown) {
          this.logger.warn(
            `Best-effort NC close failed for ${openNc.id}`,
            (e as Error)?.message,
          );
        }
      }
      // Fallback: also do the direct update for any missed rows
      await this.ncRepo.update(
        {
          auditId,
          documentId: docId,
          sourceTable: tbl,
          status: 'NC_RAISED',
        },
        { status: 'CLOSED', closedAt: new Date() },
      );
    }

    // ── Auto-link checklist item ──────────────────────────────────
    try {
      await this.autoLinkChecklistItem(
        auditId,
        docId,
        tbl,
        decision,
        remarks,
        user.userId,
      );
    } catch {
      // Non-critical: don't fail the review if checklist sync fails
    }

    // ── Auto-create observation when rejecting a document ─────────
    if (decision === 'NON_COMPLIED') {
      try {
        await this.autoCreateObservationFromRejection(
          auditId,
          docId,
          tbl,
          remarks || '',
          user.userId,
          audit,
        );
      } catch {
        // Non-critical
      }
    }

    return {
      docId,
      status: newStatus,
      decision,
      sourceTable: tbl,
      reviewId: reviewRecord.id,
    };
  }

  /**
   * When a document is reviewed, find a matching checklist item by docType or
   * label similarity and auto-update its status to COMPLIED or NON_COMPLIED.
   */
  private async autoLinkChecklistItem(
    auditId: string,
    docId: string,
    sourceTable: string,
    decision: 'COMPLIED' | 'NON_COMPLIED',
    remarks: string | undefined,
    reviewerUserId: string,
  ): Promise<void> {
    // Fetch the document's docType / fileName for matching
    const docQuery =
      sourceTable === 'branch_documents'
        ? `SELECT doc_type AS "docType", file_name AS "fileName", category FROM branch_documents WHERE id = $1`
        : `SELECT doc_type AS "docType", COALESCE(title, file_name) AS "fileName", NULL AS category FROM contractor_documents WHERE id = $1`;
    const docRows = await this.dataSource.query(docQuery, [docId]);
    if (!docRows.length) return;
    const { docType, fileName } = docRows[0];

    // Find checklist items not yet reviewed (PENDING = no doc uploaded yet, UPLOADED = doc uploaded but not reviewed)
    const pendingItems = await this.checklistRepo.find({
      where: { auditId, status: In(['PENDING', 'UPLOADED']) },
    });
    if (!pendingItems.length) return;

    const normalize = (s: string) =>
      String(s || '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, ' ')
        .trim();
    const wordsOf = (s: string) => s.split(/\s+/).filter((w) => w.length > 1);
    const stem = (w: string) =>
      w.endsWith('s') && w.length > 3 ? w.slice(0, -1) : w;
    const docTypeNorm = normalize(docType);
    const fileNameNorm = normalize(fileName);

    // Match: exact docType, word-by-word overlap (handles "PF_CHALLAN" → "pf monthly challan"), or filename
    const matched = pendingItems.find((item) => {
      const labelNorm = normalize(item.itemLabel);
      const itemDocTypeNorm = normalize(item.docType ?? '');
      // 1. Exact docType match (works when checklist item has docType set)
      if (itemDocTypeNorm && docTypeNorm && itemDocTypeNorm === docTypeNorm)
        return true;
      // 2. All words of docType found individually in label words (e.g. "pf challan" ⊆ words of "pf monthly challan")
      const dtWords = wordsOf(docTypeNorm).map(stem);
      const lblWordSet = new Set(wordsOf(labelNorm).map(stem));
      if (dtWords.length > 0 && dtWords.every((w) => lblWordSet.has(w)))
        return true;
      // 3. All words of label found in docType words (handles short labels that are subsets of docType)
      const lblWords = wordsOf(labelNorm).map(stem);
      const dtWordSet = new Set(wordsOf(docTypeNorm).map(stem));
      if (lblWords.length > 0 && lblWords.every((w) => dtWordSet.has(w)))
        return true;
      // 4. All significant label words appear in the uploaded filename
      if (
        fileNameNorm &&
        wordsOf(labelNorm)
          .filter((w) => w.length > 3)
          .every((w) => fileNameNorm.includes(w))
      )
        return true;
      return false;
    });

    if (!matched) return;

    const checklistStatus =
      decision === 'COMPLIED' ? 'COMPLIED' : 'NON_COMPLIED';
    matched.status = checklistStatus;
    matched.remarks = remarks
      ? remarks.slice(0, 500)
      : decision === 'COMPLIED'
        ? 'Document approved by auditor'
        : matched.remarks;
    matched.reviewedBy = reviewerUserId;
    matched.reviewedAt = new Date();
    matched.linkedDocId = docId;
    matched.linkedDocTable = sourceTable;
    await this.checklistRepo.save(matched);
  }

  /**
   * When a document is rejected, auto-create a structured observation so the
   * auditor doesn't have to re-enter the same finding in the Observation Builder.
   * Skips creation if an identical observation already exists for this audit+document.
   */
  private async autoCreateObservationFromRejection(
    auditId: string,
    docId: string,
    sourceTable: string,
    remarks: string,
    auditorUserId: string,
    audit: AuditEntity,
  ): Promise<void> {
    // Fetch doc name and docType for the observation text
    const docQuery =
      sourceTable === 'branch_documents'
        ? `SELECT doc_type AS "docType", file_name AS "fileName", category FROM branch_documents WHERE id = $1`
        : `SELECT doc_type AS "docType", COALESCE(title, file_name) AS "fileName", NULL AS category FROM contractor_documents WHERE id = $1`;
    const docRows = await this.dataSource.query(docQuery, [docId]);
    if (!docRows.length) return;
    const { docType, fileName } = docRows[0];

    // Avoid duplicate observation for the same document in this audit
    const existing = await this.dataSource.query(
      `SELECT id FROM audit_observations WHERE audit_id = $1 AND observation ILIKE $2 LIMIT 1`,
      [auditId, `%${docType || fileName}%`],
    );
    if (existing.length) return;

    // Derive a brief, meaningful observation text
    const docLabel = docType || fileName || 'Document';
    const observationText =
      `${docLabel} found Non-Compliant. ${remarks}`.trim();

    // Map audit type → likely act reference for context
    const actMap: Record<string, string> = {
      CONTRACTOR: 'CLRA Act, 1970',
      FACTORY: 'Factories Act, 1948',
      SHOPS_ESTABLISHMENT: 'Shops & Establishments Act',
      LABOUR_EMPLOYMENT: 'Labour Laws',
      PAYROLL: 'PF Act / ESI Act',
      FSSAI: 'Food Safety and Standards Act, 2006',
      HR: 'Industrial Employment (Standing Orders) Act',
    };
    const actRef = actMap[audit.auditType] || 'Applicable Labour Laws';

    const obs = this.observationRepo.create({
      auditId,
      observation: observationText,
      complianceRequirements: actRef,
      recommendation: `Ensure ${docLabel} is obtained, renewed, and maintained as required.`,
      risk: 'LOW',
      status: 'OPEN',
      recordedByUserId: auditorUserId,
    });
    await this.observationRepo.save(obs);
  }

  /**
   * Item #7: notify the contractor when an audit doc is marked NON_COMPLIED.
   * Best-effort; never throws.
   */
  private async notifyAuditRejection(
    audit: AuditEntity,
    docName: string,
    remarks: string | null | undefined,
  ): Promise<void> {
    try {
      if (!audit?.contractorUserId) return;
      const rows = await this.dataSource.query(
        `SELECT u.email AS email,
                b.branchname AS branch_name
           FROM users u
           LEFT JOIN branches b ON b.id = $2::uuid
          WHERE u.id = $1::uuid AND u.deleted_at IS NULL
          LIMIT 1`,
        [audit.contractorUserId, audit.branchId || null],
      );
      const email = rows?.[0]?.email as string | undefined;
      if (!email) return;

      let auditorCc: string[] = [];
      if (audit.assignedAuditorId) {
        try {
          const aRows = await this.dataSource.query(
            `SELECT email FROM users WHERE id = $1::uuid AND deleted_at IS NULL LIMIT 1`,
            [audit.assignedAuditorId],
          );
          const aEmail = aRows?.[0]?.email as string | undefined;
          if (aEmail && aEmail.toLowerCase() !== email.toLowerCase()) {
            auditorCc = [aEmail];
          }
        } catch {
          // cc is best-effort
        }
      }

      const period = audit.periodCode || null;
      await this.rejectionMail.sendAuditRejection({
        to: email,
        cc: auditorCc.length ? auditorCc : undefined,
        docName,
        branchName: rows?.[0]?.branch_name ?? null,
        auditPeriod: period,
        nonCompliance: remarks ?? null,
        applicableLaw: null,
        impact: null,
        solution: remarks ?? null,
      });
    } catch {
      // swallow
    }
  }

}
