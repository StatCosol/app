import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { AuditEntity, AuditStatus } from './entities/audit.entity';
import { AuditObservationEntity } from './entities/audit-observation.entity';
import { AuditChecklistItemEntity } from './entities/audit-checklist-item.entity';
import { AuditDocumentReviewEntity } from './entities/audit-document-review.entity';
import { AuditNonComplianceEntity } from './entities/audit-non-compliance.entity';
import { AuditResubmissionEntity } from './entities/audit-resubmission.entity';
import { CreateAuditDto } from './dto/create-audit.dto';
import { ClientsService } from '../clients/clients.service';
import { UsersService } from '../users/users.service';
import { AssignmentsService } from '../assignments/assignments.service';
import { AuditType, Frequency } from '../common/enums';
import {
  generateAuditReportPdfBuffer,
  generatePreliminaryReportPdfBuffer,
} from './utils/report-pdf';
import { NotificationsService } from '../notifications/notifications.service';
import { NonComplianceEngineService } from '../automation/services/non-compliance-engine.service';
import { AuditOutputEngineService } from '../automation/services/audit-output-engine.service';
import { ReqUser } from '../access/access-scope.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AuditNcService } from './audit-nc.service';
import { AuditChecklistService } from './audit-checklist.service';
import { AuditAuditorDashboardService } from './audit-auditor-dashboard.service';
import { AuditReportService } from './audit-report.service';
import { AuditListingService } from './audit-listing.service';
import { AuditDocumentReviewService } from './audit-document-review.service';

export type { BranchAuditKpiItem } from './audit-listing.service';

@Injectable()
export class AuditsService implements OnModuleInit {
  private readonly logger = new Logger(AuditsService.name);

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
    @InjectRepository(AuditResubmissionEntity)
    private readonly resubRepo: Repository<AuditResubmissionEntity>,
    private readonly clientsService: ClientsService,
    private readonly usersService: UsersService,
    private readonly assignmentsService: AssignmentsService,
    private readonly dataSource: DataSource,
    private readonly notificationsService: NotificationsService,
    private readonly ncEngine: NonComplianceEngineService,
    private readonly auditOutputEngine: AuditOutputEngineService,
    private readonly ncService: AuditNcService,
    private readonly checklistService: AuditChecklistService,
    private readonly auditorDashboardService: AuditAuditorDashboardService,
    private readonly reportService: AuditReportService,
    private readonly listingService: AuditListingService,
    private readonly documentReviewService: AuditDocumentReviewService,
    @Optional() private readonly auditLogs?: AuditLogsService,
  ) {}

  async onModuleInit() {
    try {
      await this.dataSource.query(`
        ALTER TABLE audits
          ADD COLUMN IF NOT EXISTS upload_lock_from DATE NULL,
          ADD COLUMN IF NOT EXISTS upload_lock_until DATE NULL,
          ADD COLUMN IF NOT EXISTS preliminary_published_at         timestamptz NULL,
          ADD COLUMN IF NOT EXISTS preliminary_published_by_user_id uuid        NULL,
          ADD COLUMN IF NOT EXISTS preliminary_findings_count       int         NULL,
          ADD COLUMN IF NOT EXISTS vendor_window_days               int         NOT NULL DEFAULT 6
      `);
      await this.dataSource.query(`
        ALTER TABLE audit_non_compliances
          ADD COLUMN IF NOT EXISTS published_at         timestamptz NULL,
          ADD COLUMN IF NOT EXISTS vendor_window_until  date        NULL,
          ADD COLUMN IF NOT EXISTS is_recurring         boolean     NOT NULL DEFAULT false,
          ADD COLUMN IF NOT EXISTS original_nc_id       uuid        NULL,
          ADD COLUMN IF NOT EXISTS recurrence_count     int         NOT NULL DEFAULT 0,
          ADD COLUMN IF NOT EXISTS finding_signature    varchar(64) NULL
      `);
      this.logger.log(
        'audit lifecycle columns ensured (upload_lock + preliminary_publish + vendor_window)',
      );
    } catch (e: any) {
      this.logger.error(
        'Failed to ensure audit lifecycle columns: ' + e.message,
      );
    }
  }

  private assertCrm(user: ReqUser) {
    if (!user || user.roleCode !== 'CRM') {
      throw new ForbiddenException('CRM access only');
    }
  }

  private assertAuditor(user: ReqUser) {
    if (!user || user.roleCode !== 'AUDITOR') {
      throw new ForbiddenException('Auditor access only');
    }
  }

  private assertContractor(user: ReqUser) {
    if (!user || user.roleCode !== 'CONTRACTOR') {
      throw new ForbiddenException('Contractor access only');
    }
  }

  private normalizeAndValidateFrequency(freq: Frequency): Frequency {
    if (!Object.values(Frequency).includes(freq)) {
      throw new BadRequestException('Invalid frequency');
    }
    return freq;
  }

  private normalizeAndValidateAuditType(t: AuditType): AuditType {
    if (!Object.values(AuditType).includes(t)) {
      throw new BadRequestException('Invalid auditType');
    }
    return t;
  }

  /**
   * Generate a human-readable audit code: AUD-YYYY-NNN
   * e.g. AUD-2026-001, AUD-2026-002
   */
  private async generateAuditCode(year: number): Promise<string> {
    const prefix = `AUD-${year}-`;
    const latest = await this.repo
      .createQueryBuilder('a')
      .select('a.auditCode', 'auditCode')
      .where('a.auditCode LIKE :p', { p: `${prefix}%` })
      .orderBy('a.auditCode', 'DESC')
      .limit(1)
      .getRawOne<{ auditCode: string }>();

    let seq = 1;
    if (latest?.auditCode) {
      const num = parseInt(latest.auditCode.replace(prefix, ''), 10);
      if (!isNaN(num)) seq = num + 1;
    }
    return `${prefix}${String(seq).padStart(3, '0')}`;
  }

  async createForCrm(user: ReqUser, dto: CreateAuditDto) {
    this.assertCrm(user);

    if (!dto.clientId) {
      throw new BadRequestException('clientId required');
    }

    const client = await this.clientsService.getOrFail(dto.clientId);
    if (!client || client.status !== 'ACTIVE') {
      throw new BadRequestException('Client not active');
    }

    const frequency = this.normalizeAndValidateFrequency(dto.frequency);
    const auditType = this.normalizeAndValidateAuditType(dto.auditType);

    if (!dto.periodYear || !dto.periodCode?.trim()) {
      throw new BadRequestException('periodYear and periodCode required');
    }

    if (!dto.assignedAuditorId) {
      throw new BadRequestException('assignedAuditorId required');
    }

    const auditorRole = await this.usersService.getUserRoleCode(
      dto.assignedAuditorId,
    );
    if (auditorRole !== 'AUDITOR') {
      throw new BadRequestException(
        'assignedAuditorId must be an AUDITOR user',
      );
    }

    // Optional contractor scope validation
    let contractorUserId: string | null = null;
    if (dto.contractorUserId != null) {
      contractorUserId = dto.contractorUserId;
      const contractorRole =
        await this.usersService.getUserRoleCode(contractorUserId);
      if (contractorRole !== 'CONTRACTOR') {
        throw new BadRequestException(
          'contractorUserId must be a CONTRACTOR user',
        );
      }
      const contractor = await this.usersService.findById(contractorUserId);
      if (!contractor || contractor.clientId !== dto.clientId) {
        throw new BadRequestException('Contractor not linked to this client');
      }
    }

    // Ensure CRM is actually assigned to this client
    const ok = await this.assignmentsService.isClientAssignedToCrm(
      dto.clientId,
      user.userId,
    );
    if (!ok) {
      throw new ForbiddenException('Client not assigned to this CRM');
    }

    // Validate branch belongs to client (if provided)
    let branchId: string | null = null;
    if (dto.branchId) {
      const branchRows = await this.dataSource.query(
        `SELECT id FROM client_branches WHERE id = $1 AND clientid = $2 AND isactive = TRUE AND isdeleted = FALSE`,
        [dto.branchId, dto.clientId],
      );
      if (!branchRows.length) {
        throw new BadRequestException(
          'Branch not found or not linked to this client',
        );
      }
      branchId = dto.branchId;
    }

    const auditCode = await this.generateAuditCode(Number(dto.periodYear));

    // Item #9: auto-derive the upload-lock window from the audit's due date.
    // Convention: dueDate marks the day the audit is to be conducted, so we
    // lock contractor uploads from that date until +7 days (the typical
    // on-site review window). Auditor can override later via setUploadLock.
    const { uploadLockFrom, uploadLockUntil } = this.deriveUploadLockWindow(
      dto.dueDate ?? null,
    );

    const entity = this.repo.create({
      auditCode,
      clientId: dto.clientId,
      branchId,
      contractorUserId,
      frequency,
      auditType,
      periodYear: Number(dto.periodYear),
      periodCode: dto.periodCode.trim(),
      assignedAuditorId: dto.assignedAuditorId,
      createdByUserId: user.userId,
      dueDate: dto.dueDate ?? null,
      uploadLockFrom,
      uploadLockUntil,
      notes: dto.notes?.trim() || null,
      status: 'PLANNED',
    });

    const saved = await this.repo.save(entity);

    // Item #11: carry forward contractor docs from the most recent prior
    // audit for this client/branch (best-effort; never fails creation).
    this.carryForwardContractorDocuments(saved).catch((e) =>
      this.logger.warn(
        `carry-forward failed for audit ${saved.id}: ${e?.message || e}`,
      ),
    );

    return { id: saved.id, auditCode: saved.auditCode };
  }

  /**
   * Item #9: compute the (uploadLockFrom, uploadLockUntil) window based on
   * the audit's scheduled / due date.
   *
   * Convention:
   *   - `dueDate` is the day on which the audit is to be conducted.
   *   - Contractors may upload freely up to dueDate - 1.
   *   - From dueDate to dueDate + 7 the upload window is locked so the
   *     auditor sees a stable document set.
   *   - Returns nulls (no lock) when no dueDate is provided. The auditor
   *     can still set a lock manually via setUploadLock.
   */
  private deriveUploadLockWindow(dueDate: string | null | undefined): {
    uploadLockFrom: string | null;
    uploadLockUntil: string | null;
  } {
    if (!dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
      return { uploadLockFrom: null, uploadLockUntil: null };
    }
    const start = new Date(`${dueDate}T00:00:00Z`);
    if (Number.isNaN(start.getTime())) {
      return { uploadLockFrom: null, uploadLockUntil: null };
    }
    const end = new Date(start.getTime());
    end.setUTCDate(end.getUTCDate() + 7);
    return {
      uploadLockFrom: start.toISOString().slice(0, 10),
      uploadLockUntil: end.toISOString().slice(0, 10),
    };
  }

  /**
   * Item #11 — copy contractor_documents from the previous audit of the
   * same client + branch (+ contractor, if scoped) into the newly created
   * audit, applying the carry-forward rules:
   *
   *   APPROVED         → cloned as APPROVED          (still valid)
   *   REJECTED         → cloned as PENDING_REVIEW    (must be re-addressed)
   *   PENDING_REVIEW   → cloned as PENDING_REVIEW    (corrected re-upload)
   *   anything else    → skipped
   *
   * Non-blocking: callers MUST wrap in .catch() so audit creation never
   * fails because of a carry-forward problem.
   */
  private async carryForwardContractorDocuments(
    audit: AuditEntity,
  ): Promise<void> {
    if (!audit?.id || !audit.clientId) return;

    // Find previous audit for same client + branch (+ contractor, if any),
    // excluding this one. Prefer most recent createdAt.
    const prevRows = await this.dataSource.query(
      `SELECT id
         FROM audits
        WHERE client_id = $1::uuid
          AND id <> $2::uuid
          AND ($3::uuid IS NULL OR branch_id IS NOT DISTINCT FROM $3::uuid)
          AND ($4::uuid IS NULL OR contractor_user_id IS NOT DISTINCT FROM $4::uuid)
        ORDER BY created_at DESC
        LIMIT 1`,
      [
        audit.clientId,
        audit.id,
        audit.branchId || null,
        audit.contractorUserId || null,
      ],
    );
    const prevAuditId = prevRows?.[0]?.id as string | undefined;
    if (!prevAuditId) return;

    // Clone matching rows. Status is rewritten per the rules above.
    // review_notes is overwritten with a carry-forward marker so the
    // contractor knows why the doc is showing up under a new audit.
    await this.dataSource.query(
      `INSERT INTO contractor_documents (
          contractor_user_id, client_id, branch_id, doc_type, title,
          audit_id, observation_id, file_name, file_path, file_type, file_size,
          uploaded_by_user_id, status, doc_month, expiry_date,
          reviewed_by_user_id, reviewed_at, review_notes,
          uploaded_by_role, acting_on_behalf, original_owner_role
       )
       SELECT
          contractor_user_id, client_id, branch_id, doc_type, title,
          $1::uuid AS audit_id,
          NULL::uuid AS observation_id,
          file_name, file_path, file_type, file_size,
          uploaded_by_user_id,
          CASE
            WHEN status = 'APPROVED' THEN 'APPROVED'
            WHEN status IN ('REJECTED', 'PENDING_REVIEW') THEN 'PENDING_REVIEW'
            ELSE status
          END AS status,
          doc_month, expiry_date,
          CASE WHEN status = 'APPROVED' THEN reviewed_by_user_id ELSE NULL END,
          CASE WHEN status = 'APPROVED' THEN reviewed_at ELSE NULL END,
          CASE
            WHEN status = 'APPROVED'      THEN 'Carried forward (previously approved)'
            WHEN status = 'REJECTED'      THEN 'Carried forward as pending — was REJECTED in prior audit'
            WHEN status = 'PENDING_REVIEW' THEN 'Carried forward — corrected re-upload pending review'
            ELSE review_notes
          END AS review_notes,
          uploaded_by_role, acting_on_behalf, original_owner_role
       FROM contractor_documents
       WHERE audit_id = $2::uuid
         AND status IN ('APPROVED', 'REJECTED', 'PENDING_REVIEW')`,
      [audit.id, prevAuditId],
    );
  }

  // ─── Listing / KPI — delegated to AuditListingService ───

  async listForCrm(
    user: ReqUser,
    q: {
      page?: number | string;
      pageSize?: number | string;
      status?: string;
      year?: number | string;
      clientId?: string;
      auditType?: string;
    },
  ) {
    return this.listingService.listForCrm(user, q);
  }

  async getForCrm(user: ReqUser, id: string) {
    return this.listingService.getForCrm(user, id);
  }

  async assignAuditorForCrm(
    user: ReqUser,
    auditId: string,
    dto: {
      assignedAuditorId?: string;
      dueDate?: string | null;
      notes?: string | null;
    },
  ) {
    return this.listingService.assignAuditorForCrm(user, auditId, dto);
  }

  async getReadinessForCrm(user: ReqUser, id: string) {
    return this.listingService.getReadinessForCrm(user, id);
  }

  async listForAuditor(
    user: ReqUser,
    q: {
      page?: number | string;
      pageSize?: number | string;
      frequency?: string;
      status?: string;
      year?: number | string;
      clientId?: string;
      contractorUserId?: string;
      branchId?: string;
    },
  ) {
    return this.listingService.listForAuditor(user, q);
  }

  async listForContractor(
    user: ReqUser,
    q: {
      page?: number | string;
      pageSize?: number | string;
      status?: string;
      year?: number | string;
    },
  ) {
    return this.listingService.listForContractor(user, q);
  }

  async getForAuditor(user: ReqUser, id: string) {
    return this.listingService.getForAuditor(user, id);
  }

  async listForClient(
    user: ReqUser,
    q: { frequency?: string; status?: string; year?: number | string },
  ) {
    return this.listingService.listForClient(user, q);
  }

  async getSummaryForClient(user: ReqUser) {
    return this.listingService.getSummaryForClient(user);
  }

  async getBranchAuditKpi(branchId: string, from: string, to: string) {
    return this.listingService.getBranchAuditKpi(branchId, from, to);
  }

  async getBranchAuditKpiSingle(branchId: string, periodCode: string) {
    return this.listingService.getBranchAuditKpiSingle(branchId, periodCode);
  }

  async listContractorsForAuditor(user: ReqUser, clientId: string) {
    return this.listingService.listContractorsForAuditor(user, clientId);
  }

  async getUploadLockForContractor(user: ReqUser, auditId: string) {
    return this.listingService.getUploadLockForContractor(user, auditId);
  }

  async getDashboardAudits(
    user: ReqUser,
    tab: string,
    filters: {
      clientId?: string;
      auditType?: string;
      fromDate?: string;
      toDate?: string;
    },
  ) {
    return this.listingService.getDashboardAudits(user, tab, filters);
  }
  async getReadinessForAuditor(user: ReqUser, id: string) {
    const audit = await this.getForAuditor(user, id);
    return this.buildReadinessSnapshot(audit);
  }

  async getReportStatusForAuditor(user: ReqUser, id: string) {
    return this.reportService.getReportStatusForAuditor(user, id);
  }
  private async buildReadinessSnapshot(audit: AuditEntity) {
    const id = audit.id;
    const [totalObservations, openObservations] = await Promise.all([
      this.observationRepo
        .createQueryBuilder('obs')
        .where('obs.auditId = :auditId', { auditId: id })
        .getCount(),
      this.observationRepo
        .createQueryBuilder('obs')
        .where('obs.auditId = :auditId', { auditId: id })
        .andWhere(
          `UPPER(COALESCE(obs.status, 'OPEN')) NOT IN ('RESOLVED','CLOSED')`,
        )
        .getCount(),
    ]);
    const executionStarted = ['IN_PROGRESS', 'COMPLETED'].includes(
      String(audit.status || '').toUpperCase(),
    );
    const checklist = [
      {
        key: 'client_scope_linked',
        label: 'Client scope linked',
        ok: !!audit.clientId,
        hint: audit.clientId
          ? 'Client mapping available'
          : 'Client scope missing',
      },
      {
        key: 'period_configured',
        label: 'Period configured',
        ok: !!audit.periodYear && !!audit.periodCode,
        hint:
          audit.periodYear && audit.periodCode
            ? String(audit.periodCode)
            : 'Period year/code missing',
      },
      {
        key: 'auditor_assigned',
        label: 'Auditor assigned',
        ok: !!audit.assignedAuditorId,
        hint: audit.assignedAuditorId || 'Assignment required',
      },
      {
        key: 'schedule_locked',
        label: 'Schedule locked',
        ok: !!audit.dueDate,
        hint: audit.dueDate ? String(audit.dueDate) : 'Due date not set',
      },
      {
        key: 'execution_started',
        label: 'Execution started',
        ok: executionStarted,
        hint: executionStarted
          ? `Current status: ${String(audit.status || '').replace('_', ' ')}`
          : 'Audit not started',
      },
      {
        key: 'capa_tracking_present',
        label: 'CAPA tracking present',
        ok: totalObservations > 0,
        hint:
          totalObservations > 0
            ? `${totalObservations} observations`
            : 'No observations linked yet',
      },
    ];
    return {
      auditId: audit.id,
      checklist,
      metrics: { totalObservations, openObservations },
    };
  }

  async getReportStatusForCrm(user: ReqUser, id: string) {
    return this.reportService.getReportStatusForCrm(user, id);
  }

  async approveReportForCrm(user: ReqUser, auditId: string, remarks?: string) {
    return this.reportService.approveReportForCrm(user, auditId, remarks);
  }

  async publishReportForCrm(user: ReqUser, auditId: string, remarks?: string) {
    return this.reportService.publishReportForCrm(user, auditId, remarks);
  }

  async sendBackReportForCrm(user: ReqUser, auditId: string, remarks?: string) {
    return this.reportService.sendBackReportForCrm(user, auditId, remarks);
  }

  async holdReportForCrm(user: ReqUser, auditId: string, remarks?: string) {
    return this.reportService.holdReportForCrm(user, auditId, remarks);
  }
  // ─── Audit Status Transitions ──────────────────────────────────
  private static readonly ALLOWED_TRANSITIONS: Record<string, string[]> = {
    PLANNED: ['IN_PROGRESS', 'CANCELLED'],
    IN_PROGRESS: ['SUBMITTED', 'COMPLETED', 'CANCELLED'],
    SUBMITTED: ['CORRECTION_PENDING', 'CLOSED'],
    CORRECTION_PENDING: ['REVERIFICATION_PENDING', 'IN_PROGRESS'],
    REVERIFICATION_PENDING: ['SUBMITTED', 'CLOSED', 'IN_PROGRESS'],
    COMPLETED: ['IN_PROGRESS'], // legacy re-audit
    CLOSED: [],
    CANCELLED: [],
  };

  async updateStatus(
    user: ReqUser,
    auditId: string,
    newStatus: string,
    notes?: string,
  ) {
    const targetStatus = String(newStatus || '').toUpperCase();
    if (!targetStatus) {
      throw new BadRequestException('status is required');
    }

    const audit = await this.repo.findOne({ where: { id: auditId } });
    if (!audit) throw new NotFoundException('Audit not found');

    // Role-based access: CRM must be assigned; Auditor must own it
    if (user.roleCode === 'CRM') {
      const ok = await this.assignmentsService.isClientAssignedToCrm(
        audit.clientId,
        user.userId,
      );
      if (!ok) throw new ForbiddenException('Client not assigned to this CRM');
      // CRM is the scheduler, not the executor.
      // CRM may only cancel an audit; starting/completing is auditor-only.
      if (targetStatus !== 'CANCELLED') {
        throw new ForbiddenException(
          'CRM can only cancel audits. Only the assigned auditor can start or complete an audit.',
        );
      }
    } else if (user.roleCode === 'AUDITOR') {
      if (audit.assignedAuditorId !== user.userId) {
        throw new ForbiddenException('Not your audit');
      }
    } else if (!['ADMIN', 'CEO', 'CCO'].includes(user.roleCode)) {
      throw new ForbiddenException('Insufficient permissions');
    }

    const currentStatus = String(audit.status || '').toUpperCase();
    const allowed = AuditsService.ALLOWED_TRANSITIONS[currentStatus] ?? [];
    if (!allowed.includes(targetStatus)) {
      throw new BadRequestException(
        `Cannot transition from ${audit.status} to ${targetStatus}. Allowed: ${allowed.join(', ') || 'none (terminal state)'}`,
      );
    }

    if (targetStatus === 'COMPLETED') {
      const latestReport = await this.reportService.getLatestReportRow(auditId);
      const reportStatus = String(latestReport?.status || '').toUpperCase();
      const reportFinalized = ['SUBMITTED', 'APPROVED', 'PUBLISHED'].includes(
        reportStatus,
      );
      if (!reportFinalized) {
        throw new BadRequestException(
          'Finalize report before completing the audit',
        );
      }

      const openObservationCount = await this.observationRepo
        .createQueryBuilder('obs')
        .where('obs.auditId = :auditId', { auditId })
        .andWhere(
          `UPPER(COALESCE(obs.status, 'OPEN')) NOT IN ('RESOLVED','CLOSED')`,
        )
        .getCount();

      if (openObservationCount > 0) {
        throw new BadRequestException(
          `Cannot complete audit with ${openObservationCount} open observations`,
        );
      }
    }

    audit.status = targetStatus as AuditStatus;
    if (notes !== undefined) {
      audit.notes = notes;
    }

    // Auto-calculate score on completion
    if (targetStatus === 'COMPLETED') {
      const scoreResult = await this.calculateScore(auditId);
      audit.score = scoreResult.score;
      audit.scoreCalculatedAt = new Date();
      // Item #10: release the contractor upload lock so the contractor can
      // upload supplementary documents post-audit and roll-forward into the
      // next audit cycle.
      audit.uploadLockFrom = null;
      audit.uploadLockUntil = null;
    }

    const saved = await this.repo.save(audit);

    // Mirror the COMPLETED status onto the originating audit_schedule (if any)
    // so the auditor's calendar reflects the closed slot.
    if (targetStatus === 'COMPLETED') {
      try {
        await this.dataSource.query(
          `UPDATE audit_schedules
              SET status = 'COMPLETED', updated_at = NOW()
            WHERE id = (SELECT schedule_id FROM audits WHERE id = $1 AND schedule_id IS NOT NULL)
              AND status NOT IN ('COMPLETED', 'CANCELLED')`,
          [auditId],
        );
      } catch (e: any) {
        this.logger.warn(
          `audit_schedules COMPLETED sync failed for ${auditId}: ${e?.message || e}`,
        );
      }
    }

    return {
      id: saved.id,
      status: saved.status,
      score: saved.score,
      updatedAt: saved.updatedAt,
    };
  }

  async getReportForAuditor(user: ReqUser, auditId: string) {
    return this.reportService.getReportForAuditor(user, auditId);
  }

  async saveReportDraftForAuditor(
    user: ReqUser,
    auditId: string,
    dto: {
      version?: 'INTERNAL' | 'CLIENT';
      executiveSummary?: string;
      scope?: string;
      methodology?: string;
      findings?: string;
      recommendations?: string;
      selectedObservationIds?: string[];
    },
  ) {
    return this.reportService.saveReportDraftForAuditor(user, auditId, dto);
  }

  async finalizeReportForAuditor(user: ReqUser, auditId: string) {
    return this.reportService.finalizeReportForAuditor(user, auditId);
  }

  async reopenReportForAuditor(user: ReqUser, auditId: string) {
    return this.reportService.reopenReportForAuditor(user, auditId);
  }

  async exportReportPdfForAuditor(user: ReqUser, auditId: string): Promise<Buffer> {
    return this.reportService.exportReportPdfForAuditor(user, auditId);
  }
  // ─── Branch Audit KPI ─────────────────────────────

  // ─── Audit Scoring ──────────────────────────────────────────────
  // Risk weights: CRITICAL=10, HIGH=6, MEDIUM=3, LOW=1
  // Score = max(0, 100 − totalWeightedDemerits) for open observations.
  // Resolved/Closed observations don't count.
  private static readonly RISK_WEIGHT: Record<string, number> = {
    CRITICAL: 10,
    HIGH: 6,
    MEDIUM: 3,
    LOW: 1,
  };

  async calculateScore(auditId: string): Promise<{
    score: number;
    breakdown: {
      critical: number;
      high: number;
      medium: number;
      low: number;
      total: number;
    };
  }> {
    const audit = await this.repo.findOne({ where: { id: auditId } });
    if (!audit) throw new NotFoundException('Audit not found');

    const observations = await this.observationRepo.find({
      where: { auditId },
    });

    let critical = 0,
      high = 0,
      medium = 0,
      low = 0;
    let totalDemerits = 0;

    for (const obs of observations) {
      // Only count open observations (not RESOLVED/CLOSED)
      if (obs.status === 'RESOLVED' || obs.status === 'CLOSED') continue;

      const risk = (obs.risk || 'LOW').toUpperCase();
      const weight = AuditsService.RISK_WEIGHT[risk] ?? 1;
      totalDemerits += weight;

      if (risk === 'CRITICAL') critical++;
      else if (risk === 'HIGH') high++;
      else if (risk === 'MEDIUM') medium++;
      else low++;
    }

    const score = Math.max(0, 100 - totalDemerits);

    // Persist
    audit.score = score;
    audit.scoreCalculatedAt = new Date();
    await this.repo.save(audit);

    return {
      score,
      breakdown: { critical, high, medium, low, total: observations.length },
    };
  }

  // ─── Auditor: List Contractors for Client ──────────────────────
  // ─── Document review — delegated to AuditDocumentReviewService ───

  async listDocumentsForAudit(user: ReqUser, auditId: string) {
    return this.documentReviewService.listDocumentsForAudit(user, auditId);
  }

  async reviewDocumentForAudit(
    user: ReqUser,
    auditId: string,
    docId: string,
    decision: 'COMPLIED' | 'NON_COMPLIED',
    remarks?: string,
    sourceTable?: string,
  ) {
    return this.documentReviewService.reviewDocumentForAudit(
      user,
      auditId,
      docId,
      decision,
      remarks,
      sourceTable,
    );
  }
  // ─── Auditor: Submit Audit ─────────────────────────────────────
  // ─── Auditor: Set / Clear Upload Lock Window ──────────────────
  async setUploadLock(
    user: ReqUser,
    auditId: string,
    lockFrom: string | null,
    lockUntil: string | null,
  ) {
    this.assertAuditor(user);
    const audit = await this.repo.findOne({ where: { id: auditId } });
    if (!audit) throw new NotFoundException('Audit not found');
    if (audit.assignedAuditorId !== user.userId) {
      throw new ForbiddenException('Not your audit');
    }

    // Validate dates: must be YYYY-MM-DD or null
    const dateRe = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
    if (lockFrom && !dateRe.test(lockFrom))
      throw new BadRequestException('lockFrom must be YYYY-MM-DD');
    if (lockUntil && !dateRe.test(lockUntil))
      throw new BadRequestException('lockUntil must be YYYY-MM-DD');
    if (lockFrom && lockUntil && lockFrom > lockUntil)
      throw new BadRequestException('lockFrom must be on or before lockUntil');

    audit.uploadLockFrom = lockFrom ?? null;
    audit.uploadLockUntil = lockUntil ?? null;
    await this.repo.save(audit);

    return {
      auditId: audit.id,
      uploadLockFrom: audit.uploadLockFrom,
      uploadLockUntil: audit.uploadLockUntil,
    };
  }

  async getUploadLock(user: ReqUser, auditId: string) {
    this.assertAuditor(user);
    const audit = await this.repo.findOne({ where: { id: auditId } });
    if (!audit) throw new NotFoundException('Audit not found');
    if (audit.assignedAuditorId !== user.userId) {
      throw new ForbiddenException('Not your audit');
    }
    return {
      auditId: audit.id,
      uploadLockFrom: audit.uploadLockFrom ?? null,
      uploadLockUntil: audit.uploadLockUntil ?? null,
    };
  }

  // ─── Auditor: Force-Complete Audit (bypasses pending docs/NCs) ─
  async forceCompleteAudit(
    user: ReqUser,
    auditId: string,
    finalRemark?: string,
  ) {
    this.assertAuditor(user);
    const audit = await this.repo.findOne({ where: { id: auditId } });
    if (!audit) throw new NotFoundException('Audit not found');
    if (audit.assignedAuditorId !== user.userId) {
      throw new ForbiddenException('Not your audit');
    }
    if (audit.status === 'COMPLETED' || audit.status === 'CLOSED') {
      throw new BadRequestException('Audit already completed/closed');
    }

    const obsScore = await this.calculateScore(auditId);
    audit.score = obsScore.score;
    audit.scoreCalculatedAt = new Date();
    audit.submittedAt = new Date();
    audit.status = 'SUBMITTED';
    if (finalRemark) audit.finalRemark = finalRemark;
    await this.repo.save(audit);
    await this.updateScheduleStatusOnSubmit(auditId);

    return {
      id: audit.id,
      status: audit.status,
      score: obsScore.score,
      message:
        'Audit finalized by auditor. Pending documents/NCs were overridden.',
    };
  }

  // ──────────────────────────────────────────────────────────────────
  // Phase 3 — Preliminary Publish + Vendor 6-Day Window + Recurring NC
  // ──────────────────────────────────────────────────────────────────

  /**
   * Auditor publishes preliminary findings to vendor/contractor and starts
   * the configured vendor closure window (default 6 calendar days).
   * - Sets audits.preliminary_published_at + actor + finding count
   * - For every open NC: sets published_at, vendor_window_until, status=AWAITING_REUPLOAD
   * - Best-effort: marks recurring findings against historical NCs for the same client/branch
   */
  async preliminaryPublish(
    user: ReqUser,
    auditId: string,
    opts: { windowDays?: number; remark?: string } = {},
  ) {
    this.assertAuditor(user);
    const audit = await this.repo.findOne({ where: { id: auditId } });
    if (!audit) throw new NotFoundException('Audit not found');
    if (audit.assignedAuditorId !== user.userId) {
      throw new ForbiddenException(
        'Only the assigned auditor can publish preliminary findings',
      );
    }
    if (audit.status === 'CLOSED' || audit.status === 'CANCELLED') {
      throw new BadRequestException(`Audit is ${audit.status}; cannot publish`);
    }

    const windowDays = Math.max(
      1,
      Math.min(30, opts.windowDays ?? audit.vendorWindowDays ?? 6),
    );
    const today = new Date();
    const deadline = new Date(today);
    deadline.setDate(deadline.getDate() + windowDays);
    const deadlineStr = deadline.toISOString().slice(0, 10);
    const now = new Date();

    const openNcs = await this.ncRepo.find({
      where: { auditId, status: In(['NC_RAISED', 'AWAITING_REUPLOAD']) },
    });

    let recurringCount = 0;
    for (const nc of openNcs) {
      // Recurring detection (best-effort)
      try {
        const sig = this.computeFindingSignature(nc.documentName, nc.remark);
        nc.findingSignature = sig;
        if (sig) {
          const prev = await this.ncRepo
            .createQueryBuilder('n')
            .innerJoin('audits', 'a', 'a.id = n.audit_id')
            .where('a.client_id = :cid', { cid: audit.clientId })
            .andWhere('n.audit_id <> :aid', { aid: auditId })
            .andWhere('n.finding_signature = :sig', { sig })
            .orderBy('n.created_at', 'DESC')
            .limit(1)
            .getOne();
          if (prev) {
            nc.isRecurring = true;
            nc.originalNcId = prev.originalNcId || prev.id;
            nc.recurrenceCount = (prev.recurrenceCount || 0) + 1;
            recurringCount++;
          }
        }
      } catch (e: any) {
        this.logger.warn(
          `Recurring NC detection failed for ${nc.id}: ${e?.message}`,
        );
      }

      nc.publishedAt = now;
      nc.vendorWindowUntil = deadlineStr;
      nc.dueDate = deadline;
      if (nc.status === 'NC_RAISED') nc.status = 'AWAITING_REUPLOAD';
    }
    if (openNcs.length > 0) {
      await this.ncRepo.save(openNcs);
    }

    audit.preliminaryPublishedAt = now;
    audit.preliminaryPublishedByUserId = user.userId;
    audit.preliminaryFindingsCount = openNcs.length;
    audit.vendorWindowDays = windowDays;
    if (audit.status === 'IN_PROGRESS' || audit.status === 'PLANNED') {
      audit.status = 'CORRECTION_PENDING';
    }
    if (opts.remark) {
      audit.notes = (
        (audit.notes || '') +
        `\n[Preliminary publish ${now.toISOString()}] ${opts.remark}`
      ).trim();
    }
    await this.repo.save(audit);

    return {
      id: audit.id,
      status: audit.status,
      preliminaryPublishedAt: audit.preliminaryPublishedAt,
      vendorWindowUntil: deadlineStr,
      vendorWindowDays: windowDays,
      ncsPublished: openNcs.length,
      recurringFindings: recurringCount,
      message:
        openNcs.length > 0
          ? `Preliminary findings published. Vendor has ${windowDays} day(s) to upload corrections (until ${deadlineStr}).`
          : 'No open non-compliances to publish.',
    };
  }

  /** Stable signature for an NC finding — used to detect recurrence. */
  private computeFindingSignature(
    documentName?: string | null,
    remark?: string | null,
  ): string | null {
    const parts = [documentName || '', remark || '']
      .map((s) =>
        s
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim(),
      )
      .filter(Boolean);
    if (parts.length === 0) return null;
    const joined = parts.join('|');
    if (joined.length < 4) return null;
    // Inline djb2 hash — avoid pulling crypto for this hot path
    let h = 5381;
    for (let i = 0; i < joined.length; i++) {
      h = ((h << 5) + h + joined.charCodeAt(i)) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
  }

  /** List NCs for an audit (auditor view). */
  async listNcsForAudit(user: ReqUser, auditId: string) {
    return this.ncService.listNcsForAudit(user, auditId);
  }
  /** Phase 4: Export preliminary findings PDF (auditor + post-publish only). */
  async exportPreliminaryReportPdf(user: ReqUser, auditId: string): Promise<Buffer> {
    return this.auditorDashboardService.exportPreliminaryReportPdf(user, auditId);
  }
  /** List NCs assigned to the calling vendor/contractor. */
  async listNcsForVendor(user: ReqUser, auditId: string) {
    return this.ncService.listNcsForVendor(user, auditId);
  }
  async submitAudit(user: ReqUser, auditId: string, finalRemark?: string) {
    this.assertAuditor(user);
    const audit = await this.repo.findOne({ where: { id: auditId } });
    if (!audit) throw new NotFoundException('Audit not found');
    if (audit.assignedAuditorId !== user.userId) {
      throw new ForbiddenException('Not your audit');
    }
    if (audit.status === 'COMPLETED' || audit.status === 'CLOSED') {
      throw new BadRequestException('Audit already completed/closed');
    }

    // Calculate score from document compliance (both branch + contractor docs)
    // Branch documents that were reviewed for this audit
    const branchDocStats = await this.dataSource.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status = 'APPROVED')::int AS complied,
         COUNT(*) FILTER (WHERE status = 'REJECTED')::int AS "nonComplied"
       FROM branch_documents
       WHERE branch_id = $1 AND client_id = $2
         AND reviewed_by IS NOT NULL
         AND status IN ('APPROVED','REJECTED')`,
      [
        audit.branchId || '00000000-0000-0000-0000-000000000000',
        audit.clientId,
      ],
    );
    const bStats = branchDocStats[0] || {
      total: 0,
      complied: 0,
      nonComplied: 0,
    };

    // Contractor documents linked to this audit
    const ctrDocStats = await this.dataSource.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status = 'APPROVED')::int AS complied,
         COUNT(*) FILTER (WHERE status = 'REJECTED')::int AS "nonComplied"
       FROM contractor_documents
       WHERE audit_id = $1`,
      [auditId],
    );
    const cStats = ctrDocStats[0] || { total: 0, complied: 0, nonComplied: 0 };

    // Combined stats
    const stats = {
      total: bStats.total + cStats.total,
      complied: bStats.complied + cStats.complied,
      nonComplied: bStats.nonComplied + cStats.nonComplied,
      branchDocs: bStats,
      contractorDocs: cStats,
    };

    // Also factor in observation-based score
    const obsScore = await this.calculateScore(auditId);

    // Document compliance score: % of total documents that are complied
    const docScore =
      stats.total > 0 ? Math.round((stats.complied / stats.total) * 100) : 100;

    // Blended score: 50% observation-based, 50% document-based
    const blendedScore = Math.round((obsScore.score + docScore) / 2);

    audit.score = blendedScore;
    audit.scoreCalculatedAt = new Date();
    audit.submittedAt = new Date();
    if (finalRemark) audit.finalRemark = finalRemark;

    // Check if there are open NCs — if so, set CORRECTION_PENDING instead of SUBMITTED
    const openNcCount = await this.ncRepo.count({
      where: { auditId, status: 'NC_RAISED' },
    });
    if (openNcCount > 0) {
      audit.status = 'CORRECTION_PENDING';
    } else {
      audit.status = 'SUBMITTED';
    }
    await this.repo.save(audit);

    // Update linked audit schedule status
    await this.updateScheduleStatusOnSubmit(auditId);

    // ── Notify CRM and Client about audit submission ──
    try {
      const auditCode = audit.auditCode || auditId.slice(0, 8);
      const status = audit.status;
      const scoreText = `${blendedScore}%`;

      // Notify CRM (routed via COMPLIANCE queryType → assigned CRM)
      await this.notificationsService.createTicket(user.userId, 'AUDITOR', {
        queryType: 'COMPLIANCE',
        subject: `Audit ${auditCode} ${status === 'CORRECTION_PENDING' ? 'Submitted with NCs' : 'Submitted'} — Score ${scoreText}`,
        message: `Auditor has submitted audit ${auditCode}. Score: ${scoreText}. Status: ${status}.${openNcCount > 0 ? ` ${openNcCount} non-compliance(s) pending correction.` : ' All items complied.'}`,
        clientId: audit.clientId,
        branchId: audit.branchId || undefined,
      });

      // Notify Client master user (routed via GENERAL → admin, but we also
      // create a direct ticket visible in their notifications feed)
      await this.notificationsService.createTicket(user.userId, 'AUDITOR', {
        queryType: 'AUDIT',
        subject: `Audit Report: ${auditCode} — Score ${scoreText}`,
        message: `Audit ${auditCode} has been submitted. Score: ${scoreText}. Status: ${status}. View and download the report from your Audits page.`,
        clientId: audit.clientId,
        branchId: audit.branchId || undefined,
      });
    } catch {
      // Non-critical: don't fail the audit submission if notifications fail
    }

    return {
      id: audit.id,
      status: audit.status,
      score: blendedScore,
      documentScore: docScore,
      observationScore: obsScore.score,
      documentStats: stats,
      observationBreakdown: obsScore.breakdown,
      openNonCompliances: openNcCount,
    };
  }

  // ─── Auditor: Re-open Audit for Re-audit ──────────────────────
  async reopenAuditForReaudit(user: ReqUser, auditId: string) {
    this.assertAuditor(user);
    const audit = await this.repo.findOne({ where: { id: auditId } });
    if (!audit) throw new NotFoundException('Audit not found');
    if (audit.assignedAuditorId !== user.userId) {
      throw new ForbiddenException('Not your audit');
    }
    if (audit.status !== 'COMPLETED') {
      throw new BadRequestException(
        'Only completed audits can be reopened for re-audit',
      );
    }

    audit.status = 'IN_PROGRESS';
    audit.notes = `Re-audit opened on ${new Date().toISOString().split('T')[0]}. Previous score: ${audit.score}`;
    await this.repo.save(audit);

    return { id: audit.id, status: audit.status, previousScore: audit.score };
  }

  // ═══════════════════════════════════════════════════════════════
  //  AUDIT CHECKLIST
  // ═══════════════════════════════════════════════════════════════

  async getChecklist(user: ReqUser, auditId: string) {
    this.assertAuditor(user);
    const audit = await this.repo.findOne({ where: { id: auditId } });
    if (!audit) throw new NotFoundException('Audit not found');
    if (audit.assignedAuditorId !== user.userId) {
      throw new ForbiddenException('Not your audit');
    }

    const items = await this.checklistRepo.find({
      where: { auditId },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });

    const summary = {
      total: items.length,
      complied: items.filter((i) => i.status === 'COMPLIED').length,
      nonComplied: items.filter((i) => i.status === 'NON_COMPLIED').length,
      pending: items.filter((i) => i.status === 'PENDING').length,
      notApplicable: items.filter((i) => i.status === 'NOT_APPLICABLE').length,
    };

    return { items, summary };
  }

  async addChecklistItem(
    user: ReqUser,
    auditId: string,
    body: {
      itemLabel: string;
      docType?: string;
      isRequired?: boolean;
      sortOrder?: number;
    },
  ) {
    this.assertAuditor(user);
    const audit = await this.repo.findOne({ where: { id: auditId } });
    if (!audit) throw new NotFoundException('Audit not found');
    if (audit.assignedAuditorId !== user.userId) {
      throw new ForbiddenException('Not your audit');
    }

    const item = this.checklistRepo.create({
      auditId,
      itemLabel: body.itemLabel,
      docType: body.docType || null,
      isRequired: body.isRequired !== false,
      sortOrder: body.sortOrder || 0,
      status: 'PENDING',
    });
    await this.checklistRepo.save(item);
    return item;
  }

  async updateChecklistItem(
    user: ReqUser,
    auditId: string,
    itemId: string,
    body: {
      status?: string;
      remarks?: string;
      linkedDocId?: string;
      linkedDocTable?: string;
    },
  ) {
    this.assertAuditor(user);
    const audit = await this.repo.findOne({ where: { id: auditId } });
    if (!audit) throw new NotFoundException('Audit not found');
    if (audit.assignedAuditorId !== user.userId) {
      throw new ForbiddenException('Not your audit');
    }

    const item = await this.checklistRepo.findOne({
      where: { id: itemId, auditId },
    });
    if (!item) throw new NotFoundException('Checklist item not found');

    if (body.status) {
      const validStatuses = [
        'PENDING',
        'UPLOADED',
        'COMPLIED',
        'NON_COMPLIED',
        'NOT_APPLICABLE',
      ];
      if (!validStatuses.includes(body.status)) {
        throw new BadRequestException(
          `Invalid status. Allowed: ${validStatuses.join(', ')}`,
        );
      }
      item.status = body.status;
      if (
        ['COMPLIED', 'NON_COMPLIED', 'NOT_APPLICABLE'].includes(body.status)
      ) {
        item.reviewedBy = user.userId;
        item.reviewedAt = new Date();
      }
    }
    if (body.remarks !== undefined) item.remarks = body.remarks;
    if (body.linkedDocId) {
      item.linkedDocId = body.linkedDocId;
      item.linkedDocTable = body.linkedDocTable || 'contractor_documents';
    }

    await this.checklistRepo.save(item);
    return item;
  }

  async deleteChecklistItem(user: ReqUser, auditId: string, itemId: string) {
    this.assertAuditor(user);
    const audit = await this.repo.findOne({ where: { id: auditId } });
    if (!audit) throw new NotFoundException('Audit not found');
    if (audit.assignedAuditorId !== user.userId) {
      throw new ForbiddenException('Not your audit');
    }

    const result = await this.checklistRepo.delete({ id: itemId, auditId });
    if (result.affected === 0)
      throw new NotFoundException('Checklist item not found');
    return { deleted: true };
  }

  async generateChecklistFromCompliance(user: ReqUser, auditId: string) {
    return this.checklistService.generateChecklistFromCompliance(user, auditId);
  }
  //  NON-COMPLIANCE TRACKING — delegated to AuditNcService
  // ═══════════════════════════════════════════════════════════════

  async getNonCompliancesForAudit(user: ReqUser, auditId: string) {
    return this.ncService.getNonCompliancesForAudit(user, auditId);
  }

  async getReverificationList(user: ReqUser) {
    return this.ncService.getReverificationList(user);
  }

  async reviewCorrectedDocument(
    user: ReqUser,
    ncId: string,
    decision: 'COMPLIED' | 'NON_COMPLIED',
    remark?: string,
  ) {
    return this.ncService.reviewCorrectedDocument(user, ncId, decision, remark);
  }

  async getRepeatNcAnalytics(user: ReqUser, clientId: string) {
    return this.ncService.getRepeatNcAnalytics(user, clientId);
  }

  async listOverdueNcsForAuditor(user: ReqUser) {
    return this.ncService.listOverdueNcsForAuditor(user);
  }
  async getSubmissionHistory(user: ReqUser, auditId: string) {
    return this.auditorDashboardService.getSubmissionHistory(user, auditId);
  }

  async getDocumentReviews(user: ReqUser, auditId: string) {
    return this.auditorDashboardService.getDocumentReviews(user, auditId);
  }

  async getAuditorDashboardSummary(user: ReqUser) {
    return this.auditorDashboardService.getAuditorDashboardSummary(user);
  }

  async getAuditorUpcomingAudits(user: ReqUser) {
    return this.auditorDashboardService.getAuditorUpcomingAudits(user);
  }

  async getAuditorRecentSubmitted(user: ReqUser) {
    return this.auditorDashboardService.getAuditorRecentSubmitted(user);
  }
  /** Dashboard "Today / Upcoming Scheduled Audits" table — paginated */
  //  CONTRACTOR / BRANCH NC VISIBILITY — delegated to AuditNcService
  // ═══════════════════════════════════════════════════════════════

  async getNonCompliancesForContractor(user: ReqUser) {
    return this.ncService.getNonCompliancesForContractor(user);
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
    return this.ncService.uploadCorrectedFile(user, ncId, file);
  }
  async getAuditInfo(user: ReqUser, auditId: string) {
    return this.auditorDashboardService.getAuditInfo(user, auditId);
  }
  //  OPEN WORKSPACE FROM SCHEDULE
  // ═══════════════════════════════════════════════════════════════

  /**
   * Given an audit_schedules.id, either find or create the audit workspace,
   * mark the schedule IN_PROGRESS, and return the audit id.
   */
  async openWorkspaceFromSchedule(
    scheduleId: string,
    userId: string,
  ): Promise<{ auditId: string; created: boolean }> {
    // AX-H1: ensure the caller is the auditor assigned to the schedule (or
    // an audit derived from it). Without this, any AUDITOR-role user could
    // open another auditor's workspace via a guessed schedule UUID.
    const sched = await this.dataSource.query(
      `SELECT auditor_user_id FROM audit_schedules WHERE id = $1`,
      [scheduleId],
    );
    if (!sched.length) throw new NotFoundException('Schedule not found');
    const assignedAuditorId = sched[0].auditor_user_id as string | null;
    if (assignedAuditorId && assignedAuditorId !== userId) {
      throw new ForbiddenException('Schedule is not assigned to you');
    }

    // Check if an audit already points to this schedule
    const existing = await this.dataSource.query(
      `SELECT id FROM audits WHERE schedule_id = $1 LIMIT 1`,
      [scheduleId],
    );
    if (existing.length) {
      // Ensure schedule is in progress
      await this.dataSource.query(
        `UPDATE audit_schedules SET status = 'IN_PROGRESS', updated_at = NOW()
         WHERE id = $1 AND status = 'SCHEDULED'`,
        [scheduleId],
      );
      return { auditId: existing[0].id, created: false };
    }

    // No audit yet — pull schedule details and auto-create
    const schedRows = await this.dataSource.query(
      `SELECT s.*, c.client_name
       FROM audit_schedules s
       JOIN clients c ON c.id = s.client_id
       WHERE s.id = $1`,
      [scheduleId],
    );
    if (!schedRows.length) throw new NotFoundException('Schedule not found');
    const sch = schedRows[0];

    const now = new Date();
    const auditCode = await this.generateAuditCode(now.getFullYear());

    const periodCode = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const { uploadLockFrom, uploadLockUntil } = this.deriveUploadLockWindow(
      sch.due_date || null,
    );
    const inserted = await this.dataSource.query(
      `INSERT INTO audits
       (audit_code, client_id, branch_id, contractor_user_id,
        frequency, audit_type, period_year, period_code,
        assigned_auditor_id, created_by_user_id,
        due_date, status, schedule_id,
        upload_lock_from, upload_lock_until,
        created_at, updated_at)
       VALUES
       ($1, $2, $3, $4,
        'MONTHLY', $5, $6, $7,
        $8, $8,
        $9, 'IN_PROGRESS', $10,
        $11, $12,
        NOW(), NOW())
       RETURNING id`,
      [
        auditCode,
        sch.client_id,
        sch.branch_id || null,
        sch.contractor_id || null,
        sch.audit_type,
        now.getFullYear(),
        periodCode,
        sch.auditor_user_id || userId,
        sch.due_date || null,
        scheduleId,
        uploadLockFrom,
        uploadLockUntil,
      ],
    );

    // Mark schedule IN_PROGRESS
    await this.dataSource.query(
      `UPDATE audit_schedules SET status = 'IN_PROGRESS', updated_at = NOW() WHERE id = $1`,
      [scheduleId],
    );

    // Item #11: carry forward contractor docs into the freshly-created audit.
    const newAuditId = inserted[0].id as string;
    try {
      const newAudit = await this.repo.findOne({ where: { id: newAuditId } });
      if (newAudit) {
        await this.carryForwardContractorDocuments(newAudit);
      }
    } catch (e: any) {
      this.logger.warn(
        `carry-forward (from schedule) failed for audit ${newAuditId}: ${e?.message || e}`,
      );
    }

    return { auditId: newAuditId, created: true };
  }

  /**
   * After submit/resubmit, update linked audit schedule to SUBMITTED.
   */
  async updateScheduleStatusOnSubmit(auditId: string): Promise<void> {
    try {
      await this.dataSource.query(
        `UPDATE audit_schedules SET status = 'SUBMITTED', updated_at = NOW()
         WHERE id = (SELECT schedule_id FROM audits WHERE id = $1 AND schedule_id IS NOT NULL)
           AND status NOT IN ('COMPLETED', 'CANCELLED')`,
        [auditId],
      );
    } catch {
      // Non-critical
    }
  }
}
