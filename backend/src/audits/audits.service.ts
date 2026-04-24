import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
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
import { generateAuditReportPdfBuffer } from './utils/report-pdf';
import { NotificationsService } from '../notifications/notifications.service';
import { NonComplianceEngineService } from '../automation/services/non-compliance-engine.service';
import { AuditOutputEngineService } from '../automation/services/audit-output-engine.service';
import { ReqUser } from '../access/access-scope.service';

export interface BranchAuditKpiItem {
  periodCode: string;
  critical: number;
  high: number;
  medium: number;
  low: number;
  open: number;
  closed: number;
}

@Injectable()
export class AuditsService {
  private readonly logger = new Logger(AuditsService.name);
  private auditReportColumnsCache:
    | {
        scope: boolean;
        methodology: boolean;
        selectedObservationIds: boolean;
        finalizedAt: boolean;
      }
    | null = null;

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
  ) {}

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
      notes: dto.notes?.trim() || null,
      status: 'PLANNED',
    });

    const saved = await this.repo.save(entity);
    return { id: saved.id, auditCode: saved.auditCode };
  }

  // ─── CRM: list audits for assigned clients ──────────────────────
  async listForCrm(user: ReqUser, q: { page?: number | string; pageSize?: number | string; status?: string; year?: number | string; clientId?: string; auditType?: string }) {
    this.assertCrm(user);

    // Get all clients assigned to this CRM
    const assignedClientIds =
      await this.assignmentsService.getAssignedClientsForCrm(user.userId);

    if (!assignedClientIds || assignedClientIds.length === 0) {
      return { data: [], total: 0 };
    }

    const clientIds = assignedClientIds.map(
      (c) => c.id,
    );

    const page = Math.max(1, Number(q?.page) || 1);
    const pageSize = Math.min(250, Math.max(1, Number(q?.pageSize) || 25));

    const qb = this.repo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.client', 'client')
      .leftJoinAndSelect('a.contractorUser', 'contractor')
      .leftJoinAndSelect('a.assignedAuditor', 'auditor')
      .where('a.clientId IN (:...clientIds)', { clientIds });

    if (q.status) {
      qb.andWhere('a.status = :st', { st: q.status });
    }
    if (q.year) {
      qb.andWhere('a.periodYear = :yy', { yy: Number(q.year) });
    }
    if (q.clientId) {
      qb.andWhere('a.clientId = :cid', { cid: q.clientId });
    }
    if (q.auditType) {
      qb.andWhere('a.auditType = :at', { at: q.auditType });
    }

    qb.addSelect(
      "CASE WHEN a.status IN ('PLANNED','IN_PROGRESS') THEN 0 ELSE 1 END",
      'status_rank',
    )
      .orderBy('status_rank', 'ASC')
      .addOrderBy('a.createdAt', 'DESC');

    const [rows, total] = await qb
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();

    return { data: rows, page, pageSize, total };
  }

  async getForCrm(user: ReqUser, id: string) {
    this.assertCrm(user);
    const audit = await this.repo.findOne({
      where: { id },
      relations: ['client', 'contractorUser', 'assignedAuditor'],
    });
    if (!audit) throw new NotFoundException('Audit not found');

    // Verify CRM is assigned to this client
    const ok = await this.assignmentsService.isClientAssignedToCrm(
      audit.clientId,
      user.userId,
    );
    if (!ok) throw new ForbiddenException('Client not assigned to this CRM');
    return audit;
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
    this.assertCrm(user);
    const audit = await this.repo.findOne({ where: { id: auditId } });
    if (!audit) throw new NotFoundException('Audit not found');

    const ok = await this.assignmentsService.isClientAssignedToCrm(
      audit.clientId,
      user.userId,
    );
    if (!ok) {
      throw new ForbiddenException('Client not assigned to this CRM');
    }

    if (dto.assignedAuditorId) {
      const auditorRole = await this.usersService.getUserRoleCode(
        dto.assignedAuditorId,
      );
      if (auditorRole !== 'AUDITOR') {
        throw new BadRequestException(
          'assignedAuditorId must be an AUDITOR user',
        );
      }
      audit.assignedAuditorId = dto.assignedAuditorId;
    }

    if (dto.dueDate !== undefined) {
      audit.dueDate = dto.dueDate || null;
    }
    if (dto.notes !== undefined) {
      audit.notes = dto.notes?.trim() || null;
    }

    const saved = await this.repo.save(audit);
    return {
      id: saved.id,
      assignedAuditorId: saved.assignedAuditorId,
      dueDate: saved.dueDate,
      notes: saved.notes,
      updatedAt: saved.updatedAt,
    };
  }

  async getReadinessForCrm(user: ReqUser, id: string) {
    const audit = await this.getForCrm(user, id);
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
      metrics: {
        totalObservations,
        openObservations,
      },
    };
  }

  async getReportStatusForCrm(user: ReqUser, id: string) {
    const audit = await this.getForCrm(user, id);
    const latestReport = await this.getLatestReportRow(id);
    if (!latestReport) {
      return {
        auditId: audit.id,
        stage: 'NOT_STARTED',
        status: null,
        updatedAt: null,
        finalizedAt: null,
      };
    }

    const status = String(latestReport.status || '').toUpperCase();
    const stage =
      status === 'DRAFT'
        ? 'DRAFT'
        : ['SUBMITTED', 'APPROVED', 'PUBLISHED'].includes(status)
          ? 'FINAL'
          : 'NOT_STARTED';

    return {
      auditId: audit.id,
      stage,
      status,
      updatedAt: latestReport.updated_at || null,
      finalizedAt: latestReport.finalized_at || null,
    };
  }

  async approveReportForCrm(user: ReqUser, auditId: string, remarks?: string) {
    const audit = await this.getForCrm(user, auditId);
    const rows = await this.dataSource.query(
      `SELECT id, status
       FROM audit_reports
       WHERE audit_id = $1
       ORDER BY updated_at DESC, created_at DESC
       LIMIT 1`,
      [auditId],
    );
    const current = rows[0];
    if (!current) {
      throw new BadRequestException('No report draft found for this audit');
    }

    const status = String(current.status || '').toUpperCase();
    if (status !== 'SUBMITTED') {
      throw new BadRequestException(
        `Only SUBMITTED reports can be approved. Current status: ${status}`,
      );
    }

    await this.dataSource.query(
      `UPDATE audit_reports
       SET status = 'APPROVED',
           approved_by_user_id = $2,
           approved_date = CURRENT_DATE,
           updated_at = NOW()
       WHERE id = $1`,
      [current.id, user.userId],
    );

    return {
      auditId: audit.id,
      reportId: current.id,
      status: 'APPROVED',
      remarks: remarks || null,
    };
  }

  async publishReportForCrm(user: ReqUser, auditId: string, remarks?: string) {
    const audit = await this.getForCrm(user, auditId);
    const rows = await this.dataSource.query(
      `SELECT id, status
       FROM audit_reports
       WHERE audit_id = $1
       ORDER BY updated_at DESC, created_at DESC
       LIMIT 1`,
      [auditId],
    );
    const current = rows[0];
    if (!current) {
      throw new BadRequestException('No report draft found for this audit');
    }

    const status = String(current.status || '').toUpperCase();
    if (!['SUBMITTED', 'APPROVED'].includes(status)) {
      throw new BadRequestException(
        `Only SUBMITTED/APPROVED reports can be published. Current status: ${status}`,
      );
    }

    await this.dataSource.query(
      `UPDATE audit_reports
       SET status = 'PUBLISHED',
           approved_by_user_id = COALESCE(approved_by_user_id, $2),
           approved_date = COALESCE(approved_date, CURRENT_DATE),
           published_date = CURRENT_DATE,
           updated_at = NOW()
       WHERE id = $1`,
      [current.id, user.userId],
    );

    return {
      auditId: audit.id,
      reportId: current.id,
      status: 'PUBLISHED',
      remarks: remarks || null,
    };
  }

  async sendBackReportForCrm(user: ReqUser, auditId: string, remarks?: string) {
    const audit = await this.getForCrm(user, auditId);
    if (!remarks?.trim()) {
      throw new BadRequestException('remarks are required to send back report');
    }

    const rows = await this.dataSource.query(
      `SELECT id, status
       FROM audit_reports
       WHERE audit_id = $1
       ORDER BY updated_at DESC, created_at DESC
       LIMIT 1`,
      [auditId],
    );
    const current = rows[0];
    if (!current) {
      throw new BadRequestException('No report draft found for this audit');
    }

    const status = String(current.status || '').toUpperCase();
    if (!['SUBMITTED', 'APPROVED'].includes(status)) {
      throw new BadRequestException(
        `Only SUBMITTED/APPROVED reports can be sent back. Current status: ${status}`,
      );
    }

    const availableCols = await this.getAuditReportColumnsAvailability();
    const draftSet = availableCols.finalizedAt
      ? "status = 'DRAFT', finalized_at = NULL, updated_at = NOW()"
      : "status = 'DRAFT', updated_at = NOW()";

    await this.dataSource.query(
      `UPDATE audit_reports
       SET ${draftSet}
       WHERE id = $1`,
      [current.id],
    );

    return {
      auditId: audit.id,
      reportId: current.id,
      status: 'DRAFT',
      remarks: remarks.trim(),
      action: 'SENT_BACK',
    };
  }

  async holdReportForCrm(user: ReqUser, auditId: string, remarks?: string) {
    const audit = await this.getForCrm(user, auditId);
    const rows = await this.dataSource.query(
      `SELECT id, status
       FROM audit_reports
       WHERE audit_id = $1
       ORDER BY updated_at DESC, created_at DESC
       LIMIT 1`,
      [auditId],
    );
    const current = rows[0];
    if (!current) {
      throw new BadRequestException('No report draft found for this audit');
    }

    const status = String(current.status || '').toUpperCase();
    if (!['SUBMITTED', 'APPROVED'].includes(status)) {
      throw new BadRequestException(
        `Only SUBMITTED/APPROVED reports can be held. Current status: ${status}`,
      );
    }

    await this.dataSource.query(
      `UPDATE audit_reports SET updated_at = NOW() WHERE id = $1`,
      [current.id],
    );

    return {
      auditId: audit.id,
      reportId: current.id,
      status,
      held: true,
      remarks: remarks || null,
    };
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
      const latestReport = await this.getLatestReportRow(auditId);
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
    }

    const saved = await this.repo.save(audit);
    return {
      id: saved.id,
      status: saved.status,
      score: saved.score,
      updatedAt: saved.updatedAt,
    };
  }

  async listForAuditor(user: ReqUser, q: { page?: number | string; pageSize?: number | string; frequency?: string; status?: string; year?: number | string; clientId?: string; contractorUserId?: string; branchId?: string }) {
    this.assertAuditor(user);

    const page = Math.max(1, Number(q?.page) || 1);
    const pageSize = Math.min(250, Math.max(1, Number(q?.pageSize) || 25));

    const qb = this.repo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.client', 'client')
      .leftJoinAndSelect('a.branch', 'branch')
      .leftJoinAndSelect('a.contractorUser', 'contractor')
      .where('a.assignedAuditorId = :uid', { uid: user.userId });

    if (q.frequency) {
      qb.andWhere('a.frequency = :freq', { freq: q.frequency });
    }
    if (q.status) {
      qb.andWhere('a.status = :st', { st: q.status });
    }
    if (q.year) {
      qb.andWhere('a.periodYear = :yy', { yy: Number(q.year) });
    }
    if (q.clientId) {
      qb.andWhere('a.clientId = :cid', { cid: q.clientId });
    }
    if (q.contractorUserId) {
      qb.andWhere('a.contractorUserId = :kid', { kid: q.contractorUserId });
    }
    if (q.branchId) {
      qb.andWhere('a.branchId = :bid', { bid: q.branchId });
    }

    qb.addSelect(
      "CASE WHEN a.status IN ('PLANNED','IN_PROGRESS') THEN 0 ELSE 1 END",
      'status_rank',
    )
      .orderBy('status_rank', 'ASC')
      .addOrderBy('a.createdAt', 'DESC');

    const [rows, total] = await qb
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();

    return { data: rows, page, pageSize, total };
  }

  async listForContractor(
    user: ReqUser,
    q: {
      page?: number | string;
      pageSize?: number | string;
      status?: string;
      year?: number | string;
      clientId?: string;
      branchId?: string;
    },
  ) {
    this.assertContractor(user);

    const page = Math.max(1, Number(q?.page) || 1);
    const pageSize = Math.min(250, Math.max(1, Number(q?.pageSize) || 25));

    const qb = this.repo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.client', 'client')
      .leftJoinAndSelect('a.branch', 'branch')
      .leftJoinAndSelect('a.assignedAuditor', 'assignedAuditor')
      .where(
        `(a.contractorUserId = :uid OR (
          a.contractorUserId IS NULL
          AND a.clientId = :clientId
          AND a.auditType = :contractorAuditType
        ))`,
        {
          uid: user.userId,
          clientId: user.clientId,
          contractorAuditType: 'CONTRACTOR',
        },
      );

    if (q.status) {
      qb.andWhere('a.status = :st', { st: q.status });
    } else {
      qb.andWhere("a.status IN ('PLANNED','IN_PROGRESS','CORRECTION_PENDING','REVERIFICATION_PENDING')");
    }

    if (q.year) {
      qb.andWhere('a.periodYear = :yy', { yy: Number(q.year) });
    }
    if (q.clientId) {
      qb.andWhere('a.clientId = :cid', { cid: q.clientId });
    }
    if (q.branchId) {
      qb.andWhere('a.branchId = :bid', { bid: q.branchId });
    }

    qb.addSelect(
      "CASE WHEN a.status IN ('PLANNED','IN_PROGRESS','CORRECTION_PENDING','REVERIFICATION_PENDING') THEN 0 ELSE 1 END",
      'status_rank',
    )
      .orderBy('status_rank', 'ASC')
      .addOrderBy('a.scheduledDate', 'ASC', 'NULLS LAST')
      .addOrderBy('a.createdAt', 'DESC');

    const [rows, total] = await qb
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();

    return { data: rows, page, pageSize, total };
  }

  async getForAuditor(user: ReqUser, id: string) {
    this.assertAuditor(user);
    const audit = await this.repo.findOne({
      where: { id },
      relations: ['client', 'branch', 'contractorUser', 'assignedAuditor'],
    });
    if (!audit) throw new NotFoundException('Audit not found');
    if (audit.assignedAuditorId !== user.userId) {
      throw new ForbiddenException('Not your audit');
    }
    return audit;
  }

  async getReportForAuditor(user: ReqUser, auditId: string) {
    const audit = await this.ensureAuditorAuditAccess(user, auditId);
    const availableCols = await this.getAuditReportColumnsAvailability();

    const scopeSelect = availableCols.scope
      ? 'ar.scope AS "scope",'
      : 'NULL::text AS "scope",';
    const methodologySelect = availableCols.methodology
      ? 'ar.methodology AS "methodology",'
      : 'NULL::text AS "methodology",';
    const selectedObsSelect = availableCols.selectedObservationIds
      ? 'ar.selected_observation_ids AS "selectedObservationIds",'
      : 'NULL::jsonb AS "selectedObservationIds",';
    const finalizedAtSelect = availableCols.finalizedAt
      ? 'ar.finalized_at AS "finalizedAt",'
      : 'NULL::timestamp AS "finalizedAt",';

    const rows = await this.dataSource.query(
      `SELECT
         ar.id AS "reportId",
         ar.audit_id AS "auditId",
         ar.report_type AS "reportType",
         ar.status AS "status",
         ar.executive_summary AS "executiveSummary",
         ${scopeSelect}
         ${methodologySelect}
         ar.findings AS "findings",
         ar.recommendations AS "recommendations",
         ${selectedObsSelect}
         ${finalizedAtSelect}
         ar.updated_at AS "updatedAt"
       FROM audit_reports ar
       WHERE ar.audit_id = $1
       ORDER BY ar.updated_at DESC, ar.created_at DESC
       LIMIT 1`,
      [auditId],
    );

    return this.mapReportRow(
      audit.id,
      rows[0] ?? null,
      audit.updatedAt || null,
    );
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
    const audit = await this.ensureAuditorAuditAccess(user, auditId);
    if (String(audit.status || '').toUpperCase() === 'COMPLETED') {
      throw new BadRequestException(
        'Cannot edit report after audit completion',
      );
    }

    const selectedObservationIds = Array.isArray(dto.selectedObservationIds)
      ? [
          ...new Set(
            dto.selectedObservationIds
              .map((x) => String(x).trim())
              .filter(Boolean),
          ),
        ]
      : [];
    const version = dto.version === 'CLIENT' ? 'CLIENT' : 'INTERNAL';
    const availableCols = await this.getAuditReportColumnsAvailability();

    const existingRows = await this.dataSource.query(
      `SELECT id, status
       FROM audit_reports
       WHERE audit_id = $1
       ORDER BY updated_at DESC, created_at DESC
       LIMIT 1`,
      [auditId],
    );
    const existing = existingRows[0] || null;
    const userId = user.userId || user.id;

    if (!existing) {
      const insertColumns = [
        'audit_id',
        'report_type',
        'executive_summary',
        'findings',
        'recommendations',
      ];
      const insertValues: unknown[] = [
        auditId,
        version,
        dto.executiveSummary || null,
        dto.findings || null,
        dto.recommendations || null,
      ];

      if (availableCols.scope) {
        insertColumns.splice(3, 0, 'scope');
        insertValues.splice(3, 0, dto.scope || null);
      }

      if (availableCols.methodology) {
        const idx = 4 + Number(availableCols.scope);
        insertColumns.splice(idx, 0, 'methodology');
        insertValues.splice(idx, 0, dto.methodology || null);
      }

      if (availableCols.selectedObservationIds) {
        const idx = 5 + Number(availableCols.scope) + Number(availableCols.methodology);
        insertColumns.splice(idx, 0, 'selected_observation_ids');
        insertValues.splice(idx, 0, JSON.stringify(selectedObservationIds));
      }

      insertColumns.push('status', 'prepared_by_user_id', 'prepared_date', 'updated_at');
      insertValues.push('DRAFT', userId || null);

      const placeholders = insertColumns.map((col, i) => {
        if (col === 'prepared_date') return 'CURRENT_DATE';
        if (col === 'updated_at') return 'NOW()';
        if (col === 'selected_observation_ids') return `$${i + 1}::jsonb`;
        return `$${i + 1}`;
      });

      await this.dataSource.query(
        `INSERT INTO audit_reports
          (${insertColumns.join(', ')})
         VALUES
          (${placeholders.join(', ')})`,
        insertValues,
      );
    } else {
      const status = String(existing.status || '').toUpperCase();
      if (['APPROVED', 'PUBLISHED'].includes(status)) {
        throw new BadRequestException(
          'Cannot edit approved or published report',
        );
      }
      if (status !== 'DRAFT') {
        throw new BadRequestException('Reopen the report before editing');
      }

      const updates: string[] = ['report_type = $1', 'executive_summary = $2'];
      const params: unknown[] = [version, dto.executiveSummary || null];

      if (availableCols.scope) {
        params.push(dto.scope || null);
        updates.push(`scope = $${params.length}`);
      }

      if (availableCols.methodology) {
        params.push(dto.methodology || null);
        updates.push(`methodology = $${params.length}`);
      }

      params.push(dto.findings || null);
      updates.push(`findings = $${params.length}`);

      params.push(dto.recommendations || null);
      updates.push(`recommendations = $${params.length}`);

      if (availableCols.selectedObservationIds) {
        params.push(JSON.stringify(selectedObservationIds));
        updates.push(`selected_observation_ids = $${params.length}::jsonb`);
      }

      params.push(existing.id);

      await this.dataSource.query(
        `UPDATE audit_reports
         SET
           ${updates.join(',\n           ')},
           updated_at = NOW()
         WHERE id = $${params.length}`,
        params,
      );
    }

    return this.getReportForAuditor(user, auditId);
  }

  async finalizeReportForAuditor(user: ReqUser, auditId: string) {
    const audit = await this.ensureAuditorAuditAccess(user, auditId);
    const availableCols = await this.getAuditReportColumnsAvailability();
    if (String(audit.status || '').toUpperCase() === 'COMPLETED') {
      throw new BadRequestException('Audit is already completed');
    }

    const existingRows = await this.dataSource.query(
      `SELECT id, status
       FROM audit_reports
       WHERE audit_id = $1
       ORDER BY updated_at DESC, created_at DESC
       LIMIT 1`,
      [auditId],
    );
    let existing = existingRows[0] || null;
    const userId = user.userId || user.id;

    if (!existing) {
      await this.dataSource.query(
        `INSERT INTO audit_reports
          (audit_id, report_type, status, prepared_by_user_id, prepared_date, updated_at)
         VALUES
          ($1, 'INTERNAL', 'DRAFT', $2, CURRENT_DATE, NOW())`,
        [auditId, userId || null],
      );
      const postInsert = await this.dataSource.query(
        `SELECT id, status
         FROM audit_reports
         WHERE audit_id = $1
         ORDER BY updated_at DESC, created_at DESC
         LIMIT 1`,
        [auditId],
      );
      existing = postInsert[0] || null;
    }

    const status = String(existing?.status || '').toUpperCase();
    if (['APPROVED', 'PUBLISHED'].includes(status)) {
      throw new BadRequestException(
        'Cannot finalize approved or published report',
      );
    }
    if (status !== 'DRAFT') {
      return this.getReportForAuditor(user, auditId);
    }

    const finalizeSet = availableCols.finalizedAt
      ? "status = 'SUBMITTED', finalized_at = NOW(), updated_at = NOW()"
      : "status = 'SUBMITTED', updated_at = NOW()";

    await this.dataSource.query(
      `UPDATE audit_reports
       SET ${finalizeSet}
       WHERE id = $1`,
      [existing.id],
    );

    return this.getReportForAuditor(user, auditId);
  }

  async reopenReportForAuditor(user: ReqUser, auditId: string) {
    const audit = await this.ensureAuditorAuditAccess(user, auditId);
    const availableCols = await this.getAuditReportColumnsAvailability();
    if (String(audit.status || '').toUpperCase() === 'COMPLETED') {
      throw new BadRequestException(
        'Cannot reopen report after audit completion',
      );
    }

    const existingRows = await this.dataSource.query(
      `SELECT id, status
       FROM audit_reports
       WHERE audit_id = $1
       ORDER BY updated_at DESC, created_at DESC
       LIMIT 1`,
      [auditId],
    );
    const existing = existingRows[0] || null;
    if (!existing) {
      throw new NotFoundException('Audit report draft not found');
    }

    const status = String(existing.status || '').toUpperCase();
    if (status === 'DRAFT') {
      return this.getReportForAuditor(user, auditId);
    }
    if (['APPROVED', 'PUBLISHED'].includes(status)) {
      throw new BadRequestException(
        'Cannot reopen approved or published report',
      );
    }
    if (status !== 'SUBMITTED') {
      throw new BadRequestException(`Cannot reopen report in ${status} status`);
    }

    const reopenSet = availableCols.finalizedAt
      ? "status = 'DRAFT', finalized_at = NULL, updated_at = NOW()"
      : "status = 'DRAFT', updated_at = NOW()";

    await this.dataSource.query(
      `UPDATE audit_reports
       SET ${reopenSet}
       WHERE id = $1`,
      [existing.id],
    );

    return this.getReportForAuditor(user, auditId);
  }

  async exportReportPdfForAuditor(
    user: ReqUser,
    auditId: string,
  ): Promise<Buffer> {
    const audit = await this.ensureAuditorAuditAccess(user, auditId);
    const report = await this.getReportForAuditor(user, auditId);
    if (report.stage !== 'FINAL') {
      throw new BadRequestException('Only finalized reports can be exported');
    }

    const selectedIds = Array.isArray(report.selectedObservationIds)
      ? report.selectedObservationIds
      : [];

    const obsQb = this.observationRepo
      .createQueryBuilder('obs')
      .leftJoinAndSelect('obs.category', 'category')
      .where('obs.auditId = :auditId', { auditId })
      .orderBy('obs.sequenceNumber', 'ASC')
      .addOrderBy('obs.createdAt', 'ASC');

    if (selectedIds.length) {
      obsQb.andWhere('obs.id IN (:...selectedIds)', { selectedIds });
    }

    const observations = await obsQb.getMany();
    const version = report.version === 'CLIENT' ? 'CLIENT' : 'INTERNAL';

    return generateAuditReportPdfBuffer({
      auditId: report.auditId,
      auditCode: audit.auditCode || audit.id,
      clientName: audit.client?.clientName || null,
      branchName: audit.branch?.branchName || null,
      periodCode: audit.periodCode || null,
      version,
      stage: 'FINAL',
      updatedAt: report.updatedAt,
      finalizedAt: report.finalizedAt,
      executiveSummary: report.executiveSummary || '',
      scope: report.scope || '',
      methodology: report.methodology || '',
      findings: report.findings || '',
      recommendations: report.recommendations || '',
      observations: observations.map((o) => ({
        sequenceNumber: o.sequenceNumber ?? null,
        observation: o.observation || '',
        clause: o.clause || null,
        risk: o.risk || null,
        status: o.status || 'OPEN',
        recommendation: o.recommendation || null,
      })),
    });
  }

  async listForClient(user: ReqUser, q: { frequency?: string; status?: string; year?: number | string }) {
    if (!user || user.roleCode !== 'CLIENT') {
      throw new ForbiddenException('CLIENT access only');
    }
    if (!user.clientId) {
      throw new ForbiddenException('Client missing clientId');
    }

    const qb = this.repo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.contractorUser', 'contractor')
      .leftJoinAndSelect('a.assignedAuditor', 'auditor')
      .where('a.clientId = :clientId', { clientId: user.clientId });

    if (q.frequency) {
      qb.andWhere('a.frequency = :freq', { freq: q.frequency });
    }
    if (q.status) {
      qb.andWhere('a.status = :st', { st: q.status });
    }
    if (q.year) {
      qb.andWhere('a.periodYear = :yy', { yy: Number(q.year) });
    }

    qb.orderBy('a.periodYear', 'DESC').addOrderBy('a.createdAt', 'DESC');

    const rows = await qb.getMany();
    return rows;
  }

  async getSummaryForClient(user: ReqUser) {
    if (!user || user.roleCode !== 'CLIENT') {
      throw new ForbiddenException('CLIENT access only');
    }
    if (!user.clientId) {
      throw new ForbiddenException('Client missing clientId');
    }

    const rows = await this.repo
      .createQueryBuilder('a')
      .select('a.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('a.clientId = :clientId', { clientId: user.clientId })
      .groupBy('a.status')
      .getRawMany();

    let total = 0;
    let completed = 0;
    let inProgress = 0;
    let planned = 0;

    for (const r of rows) {
      const status = String(r.status);
      const count = Number(r.count);
      total += count;
      if (status === 'COMPLETED') completed += count;
      if (status === 'IN_PROGRESS') inProgress += count;
      if (status === 'PLANNED') planned += count;
    }

    return { total, completed, inProgress, planned };
  }

  private async ensureAuditorAuditAccess(
    user: ReqUser,
    auditId: string,
  ): Promise<AuditEntity> {
    this.assertAuditor(user);
    const audit = await this.repo.findOne({
      where: { id: auditId },
      relations: ['client', 'branch'],
    });
    if (!audit) throw new NotFoundException('Audit not found');
    const callerId = user?.userId || user?.id;
    if (audit.assignedAuditorId !== callerId) {
      throw new ForbiddenException('Not your audit');
    }
    return audit;
  }

  private mapReportRow(
    auditId: string,
    row: {
      reportId?: string;
      auditId?: string;
      reportType?: string;
      status?: string;
      executiveSummary?: string;
      scope?: string;
      methodology?: string;
      findings?: string;
      recommendations?: string;
      selectedObservationIds?: unknown;
      updatedAt?: Date | string | null;
      finalizedAt?: Date | string | null;
    } | null,
    fallbackUpdatedAt: Date | null,
  ) {
    if (!row) {
      return {
        reportId: null,
        auditId,
        stage: 'DRAFT',
        version: 'INTERNAL',
        executiveSummary: '',
        scope: '',
        methodology: '',
        findings: '',
        recommendations: '',
        selectedObservationIds: [] as string[],
        updatedAt: fallbackUpdatedAt,
        finalizedAt: null,
      };
    }

    const status = String(row.status || '').toUpperCase();
    const stage = ['SUBMITTED', 'APPROVED', 'PUBLISHED'].includes(status)
      ? 'FINAL'
      : 'DRAFT';
    const version =
      String(row.reportType || '').toUpperCase() === 'CLIENT'
        ? 'CLIENT'
        : 'INTERNAL';

    let selectedObservationIds: string[] = [];
    const rawSelected = row.selectedObservationIds;
    if (Array.isArray(rawSelected)) {
      selectedObservationIds = rawSelected.map((x: unknown) => String(x));
    } else if (typeof rawSelected === 'string') {
      try {
        const parsed = JSON.parse(rawSelected);
        if (Array.isArray(parsed)) {
          selectedObservationIds = parsed.map((x: unknown) => String(x));
        }
      } catch {
        selectedObservationIds = [];
      }
    }

    return {
      reportId: row.reportId || null,
      auditId: row.auditId || auditId,
      stage,
      version,
      executiveSummary: row.executiveSummary || '',
      scope: row.scope || '',
      methodology: row.methodology || '',
      findings: row.findings || '',
      recommendations: row.recommendations || '',
      selectedObservationIds,
      updatedAt: row.updatedAt || fallbackUpdatedAt,
      finalizedAt: row.finalizedAt || null,
    };
  }

  private async getLatestReportRow(auditId: string): Promise<{ status?: string; updated_at?: string | null; finalized_at?: string | null } | null> {
    const rows = await this.dataSource.query(
      `SELECT *
       FROM audit_reports
       WHERE audit_id = $1
       ORDER BY updated_at DESC, created_at DESC
       LIMIT 1`,
      [auditId],
    );
    return rows[0] || null;
  }

  private async getAuditReportColumnsAvailability(): Promise<{
    scope: boolean;
    methodology: boolean;
    selectedObservationIds: boolean;
    finalizedAt: boolean;
  }> {
    if (this.auditReportColumnsCache) {
      return this.auditReportColumnsCache;
    }

    const rows: Array<{ column_name?: string }> = await this.dataSource.query(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'audit_reports'
         AND column_name IN ('scope', 'methodology', 'selected_observation_ids', 'finalized_at')`,
    );

    const names = new Set(rows.map((r) => String(r.column_name || '')));
    this.auditReportColumnsCache = {
      scope: names.has('scope'),
      methodology: names.has('methodology'),
      selectedObservationIds: names.has('selected_observation_ids'),
      finalizedAt: names.has('finalized_at'),
    };

    return this.auditReportColumnsCache;
  }

  // ─── Branch Audit KPI ─────────────────────────────

  private ensurePeriod(p?: string): string {
    if (!p || !/^\d{4}-(0[1-9]|1[0-2])$/.test(p)) {
      throw new BadRequestException(
        'Invalid period format. Use YYYY-MM (month 01-12)',
      );
    }
    return p;
  }

  async getBranchAuditKpi(branchId: string, from: string, to: string) {
    const fromP = this.ensurePeriod(from);
    const toP = this.ensurePeriod(to);

    const rows: BranchAuditKpiItem[] = await this.dataSource.query(
      `SELECT
        a.period_code                                                          AS "periodCode",
        COALESCE(SUM(CASE WHEN ao.risk = 'CRITICAL' THEN 1 ELSE 0 END), 0)::int AS critical,
        COALESCE(SUM(CASE WHEN ao.risk = 'HIGH'     THEN 1 ELSE 0 END), 0)::int AS high,
        COALESCE(SUM(CASE WHEN ao.risk = 'MEDIUM'   THEN 1 ELSE 0 END), 0)::int AS medium,
        COALESCE(SUM(CASE WHEN ao.risk = 'LOW'      THEN 1 ELSE 0 END), 0)::int AS low,
        COALESCE(SUM(CASE WHEN ao.status NOT IN ('CLOSED','RESOLVED') THEN 1 ELSE 0 END), 0)::int AS open,
        COALESCE(SUM(CASE WHEN ao.status IN ('CLOSED','RESOLVED')     THEN 1 ELSE 0 END), 0)::int AS closed
      FROM audit_observations ao
      JOIN audits a ON a.id = ao.audit_id
      WHERE a.branch_id = $1
        AND a.period_code >= $2
        AND a.period_code <= $3
      GROUP BY a.period_code
      ORDER BY a.period_code`,
      [branchId, fromP, toP],
    );

    return { branchId, from: fromP, to: toP, items: rows || [] };
  }

  async getBranchAuditKpiSingle(branchId: string, periodCode: string) {
    const p = this.ensurePeriod(periodCode);

    const rows: BranchAuditKpiItem[] = await this.dataSource.query(
      `SELECT
        a.period_code                                                          AS "periodCode",
        COALESCE(SUM(CASE WHEN ao.risk = 'CRITICAL' THEN 1 ELSE 0 END), 0)::int AS critical,
        COALESCE(SUM(CASE WHEN ao.risk = 'HIGH'     THEN 1 ELSE 0 END), 0)::int AS high,
        COALESCE(SUM(CASE WHEN ao.risk = 'MEDIUM'   THEN 1 ELSE 0 END), 0)::int AS medium,
        COALESCE(SUM(CASE WHEN ao.risk = 'LOW'      THEN 1 ELSE 0 END), 0)::int AS low,
        COALESCE(SUM(CASE WHEN ao.status NOT IN ('CLOSED','RESOLVED') THEN 1 ELSE 0 END), 0)::int AS open,
        COALESCE(SUM(CASE WHEN ao.status IN ('CLOSED','RESOLVED')     THEN 1 ELSE 0 END), 0)::int AS closed
      FROM audit_observations ao
      JOIN audits a ON a.id = ao.audit_id
      WHERE a.branch_id = $1
        AND a.period_code = $2
      GROUP BY a.period_code
      ORDER BY a.period_code`,
      [branchId, p],
    );

    return { branchId, period: p, items: rows || [] };
  }

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
  async listContractorsForAuditor(user: ReqUser, clientId: string) {
    this.assertAuditor(user);
    if (!clientId) throw new BadRequestException('clientId required');

    const isAssigned = await this.assignmentsService.isClientAssignedToAuditor(
      clientId,
      user.userId,
    );
    if (!isAssigned) {
      throw new ForbiddenException('Client not assigned to this auditor');
    }

    const rows = await this.dataSource.query(
      `SELECT u.id, u.name, u.email
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE u.client_id = $1
         AND r.code = 'CONTRACTOR'
         AND u.is_active = TRUE
         AND u.deleted_at IS NULL
       ORDER BY u.name`,
      [clientId],
    );
    return rows;
  }

  // ─── Auditor: List Documents for Audit ─────────────────────────
  async listDocumentsForAudit(user: ReqUser, auditId: string) {
    const audit = await this.getForAuditor(user, auditId);

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
                cd.doc_type AS "docType", cd.title,
                cd.file_name AS "fileName",
                cd.file_path AS "filePath", cd.file_type AS "fileType",
                cd.file_size AS "fileSize", cd.status,
                cd.review_notes AS "reviewNotes",
                cd.reviewed_by_user_id AS "reviewedByUserId",
                cd.reviewed_at AS "reviewedAt",
                cd.doc_month AS "docMonth", cd.expiry_date AS "expiryDate",
                cd.created_at AS "createdAt",
                u.name AS "contractorName", u.email AS "contractorEmail"
         FROM contractor_documents cd
         LEFT JOIN users u ON u.id = cd.contractor_user_id
         ${cWhere}
         ORDER BY cd.created_at DESC`,
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

    return {
      docId,
      status: newStatus,
      decision,
      sourceTable: tbl,
      reviewId: reviewRecord.id,
    };
  }

  // ─── Auditor: Submit Audit ─────────────────────────────────────
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
    this.assertAuditor(user);
    const audit = await this.repo.findOne({ where: { id: auditId } });
    if (!audit) throw new NotFoundException('Audit not found');
    if (audit.assignedAuditorId !== user.userId) {
      throw new ForbiddenException('Not your audit');
    }

    // Auto-generate checklist items based on audit type
    const typeChecklistMap: Record<string, string[]> = {
      FACTORY: [
        'Factory License',
        'Building Stability Certificate',
        'Fire Safety Certificate',
        'Pollution Control Board Consent',
        'Hazardous Waste Authorization',
        'Boiler Certificate',
        'Factory Plan Approval',
        'Annual Return (Form 21)',
        'Half-Yearly Return (Form 22)',
        'Register of Workers',
        'Leave Register',
        'Overtime Register',
        'Health & Safety Policy',
        'First Aid Box',
        'Canteen License',
        'Creche Facility (if applicable)',
      ],
      SHOPS_ESTABLISHMENT: [
        'Shops & Establishment Registration',
        'Trade License',
        'Professional Tax Registration',
        'Employment Exchange Returns',
        'Register of Employees',
        'Attendance Register',
        'Wage Register',
        'Leave Register',
        'Annual Return',
      ],
      CONTRACTOR: [
        'CLRA License',
        'PF Registration',
        'ESI Registration',
        'PF Monthly Challan',
        'ESI Monthly Challan',
        'Professional Tax Challan',
        'Wage Register',
        'Attendance Register',
        'Muster Roll',
        'Form V – Register of Workmen',
        'Form XII – Wage Slip',
        'Form XIII – Register of Wages',
        'Bonus Register (Form C)',
        'CLRA Annual Return (Form XXV)',
      ],
      LABOUR_EMPLOYMENT: [
        'Labour License',
        'Standing Orders',
        'Employment Exchange Quarterly Returns',
        'Minimum Wages Register',
        'Equal Remuneration Register',
        'Maternity Benefit Records',
        'Gratuity Records',
        'Industrial Disputes Records',
      ],
      FSSAI: [
        'FSSAI License',
        'Food Handler Medical Certificate',
        'Water Testing Report',
        'Pest Control Records',
        'Temperature Log (Cold Storage)',
        'Hygiene & Sanitation Records',
        'Raw Material Inspection Records',
        'FSSAI Annual Return',
      ],
      PAYROLL: [
        'PF Challan',
        'ESI Challan',
        'Professional Tax Challan',
        'TDS Challan',
        'Payroll Register',
        'Salary Slips',
        'Bank Statement (Salary A/c)',
        'Bonus Computation Sheet',
        'Leave Encashment Records',
        'Full & Final Settlement Records',
      ],
      HR: [
        'Appointment Letters',
        'ID Cards Issued',
        'Employee Handbook Acknowledgement',
        'Background Verification Records',
        'Training Records',
        'Performance Appraisal Records',
        'Employee Grievance Register',
        'Sexual Harassment Committee (ICC) Records',
        'Exit Interview Records',
        'Succession Planning Documents',
      ],
      GAP: [
        'Process Documentation',
        'SOP Compliance Check',
        'Internal Audit Reports',
        'Gap Analysis Report',
        'Corrective Action Plan',
        'Risk Assessment Records',
        'Management Review Minutes',
      ],
    };

    const labels = typeChecklistMap[audit.auditType] || [];
    if (labels.length === 0) {
      throw new BadRequestException(
        `No default checklist defined for audit type: ${audit.auditType}`,
      );
    }

    // Check if checklist already has items
    const existing = await this.checklistRepo.count({ where: { auditId } });
    if (existing > 0) {
      throw new BadRequestException(
        'Checklist already has items. Delete existing items first or add manually.',
      );
    }

    const items = labels.map((label, idx) =>
      this.checklistRepo.create({
        auditId,
        itemLabel: label,
        isRequired: true,
        sortOrder: idx + 1,
        status: 'PENDING',
      }),
    );
    await this.checklistRepo.save(items);
    return { created: items.length, items };
  }

  // ═══════════════════════════════════════════════════════════════
  //  NON-COMPLIANCE TRACKING
  // ═══════════════════════════════════════════════════════════════

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

    return { ncId, status: nc.status, decision };
  }

  // ─── Submission History ────────────────────────────────────────
  async getSubmissionHistory(user: ReqUser, auditId: string) {
    this.assertAuditor(user);
    const audit = await this.repo.findOne({ where: { id: auditId } });
    if (!audit) throw new NotFoundException('Audit not found');
    if (audit.assignedAuditorId !== user.userId)
      throw new ForbiddenException('Not your audit');

    const reviews = await this.docReviewRepo.find({
      where: { auditId },
      order: { reviewedAt: 'DESC' },
    });

    // Group by version rounds
    const versions = new Map<number, any[]>();
    for (const r of reviews) {
      if (!versions.has(r.version)) versions.set(r.version, []);
      versions.get(r.version)!.push(r);
    }

    const history = Array.from(versions.entries()).map(([ver, items]) => ({
      version: ver,
      reviewCount: items.length,
      complied: items.filter((i) => i.complianceMark === 'COMPLIED').length,
      nonComplied: items.filter((i) => i.complianceMark === 'NON_COMPLIED')
        .length,
      latestReviewAt: items.reduce(
        (max, i) => (i.reviewedAt > max ? i.reviewedAt : max),
        items[0].reviewedAt,
      ),
    }));

    return {
      auditId,
      submissions: history.sort((a, b) => a.version - b.version),
    };
  }

  // ─── Document Reviews History ──────────────────────────────────
  async getDocumentReviews(user: ReqUser, auditId: string) {
    this.assertAuditor(user);
    const audit = await this.repo.findOne({ where: { id: auditId } });
    if (!audit) throw new NotFoundException('Audit not found');
    if (audit.assignedAuditorId !== user.userId)
      throw new ForbiddenException('Not your audit');

    return this.docReviewRepo.find({
      where: { auditId },
      order: { reviewedAt: 'DESC' },
    });
  }

  // ═══════════════════════════════════════════════════════════════
  //  AUDITOR DASHBOARD SUMMARY
  // ═══════════════════════════════════════════════════════════════

  async getAuditorDashboardSummary(user: ReqUser) {
    this.assertAuditor(user);
    const rows = await this.dataSource.query(
      `SELECT
         COUNT(*)::int AS "totalAssigned",
         COUNT(*) FILTER (WHERE status = 'PLANNED')::int AS "pending",
         COUNT(*) FILTER (WHERE status = 'IN_PROGRESS')::int AS "inProgress",
         COUNT(*) FILTER (WHERE status IN ('SUBMITTED','COMPLETED'))::int AS "submitted",
         COUNT(*) FILTER (WHERE status IN ('CORRECTION_PENDING','REVERIFICATION_PENDING'))::int AS "reverificationPending",
         COUNT(*) FILTER (WHERE status = 'CLOSED')::int AS "closed"
       FROM audits
       WHERE assigned_auditor_id = $1 AND status != 'CANCELLED'`,
      [user.userId],
    );
    return (
      rows[0] || {
        totalAssigned: 0,
        pending: 0,
        inProgress: 0,
        submitted: 0,
        reverificationPending: 0,
        closed: 0,
      }
    );
  }

  async getAuditorUpcomingAudits(user: ReqUser) {
    this.assertAuditor(user);
    return this.dataSource.query(
      `SELECT a.id, a.audit_code AS "auditCode", a.audit_type AS "auditType",
              a.period_code AS "periodCode", a.due_date AS "dueDate",
              a.scheduled_date AS "scheduledDate", a.status,
              c.client_name AS "clientName",
              cb.branchname AS "branchName",
              cu.name AS "contractorName"
       FROM audits a
       JOIN clients c ON c.id = a.client_id
       LEFT JOIN client_branches cb ON cb.id = a.branch_id
       LEFT JOIN users cu ON cu.id = a.contractor_user_id
       WHERE a.assigned_auditor_id = $1
         AND a.status IN ('PLANNED','IN_PROGRESS','CORRECTION_PENDING','REVERIFICATION_PENDING')
       ORDER BY a.due_date ASC NULLS LAST, a.created_at DESC`,
      [user.userId],
    );
  }

  async getAuditorRecentSubmitted(user: ReqUser) {
    this.assertAuditor(user);
    return this.dataSource.query(
      `SELECT a.id, a.audit_code AS "auditCode", a.audit_type AS "auditType",
              a.score, a.submitted_at AS "submittedAt", a.status,
              c.client_name AS "clientName",
              COALESCE(cb.branchname, cu.name) AS "entityName"
       FROM audits a
       JOIN clients c ON c.id = a.client_id
       LEFT JOIN client_branches cb ON cb.id = a.branch_id
       LEFT JOIN users cu ON cu.id = a.contractor_user_id
       WHERE a.assigned_auditor_id = $1
         AND a.status IN ('SUBMITTED','COMPLETED','CLOSED')
       ORDER BY a.submitted_at DESC NULLS LAST
       LIMIT 20`,
      [user.userId],
    );
  }

  // ═══════════════════════════════════════════════════════════════
  //  CONTRACTOR / BRANCH NC VISIBILITY
  // ═══════════════════════════════════════════════════════════════

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

  // ─── Audit Info ────────────────────────────────────────────────
  async getAuditInfo(user: ReqUser, auditId: string) {
    this.assertAuditor(user);
    const rows = await this.dataSource.query(
      `SELECT a.id, a.audit_code AS "auditCode", a.audit_type AS "auditType",
              a.frequency, a.period_year AS "periodYear", a.period_code AS "periodCode",
              a.status, a.score, a.due_date AS "dueDate",
              a.scheduled_date AS "scheduledDate", a.submitted_at AS "submittedAt",
              a.final_remark AS "finalRemark", a.notes,
              a.created_at AS "createdAt",
              c.client_name AS "clientName", c.id AS "clientId",
              cb.branchname AS "branchName", cb.id AS "branchId",
              cu.name AS "contractorName", cu.id AS "contractorUserId",
              au.name AS "auditorName",
              sby.name AS "scheduledByName"
       FROM audits a
       JOIN clients c ON c.id = a.client_id
       LEFT JOIN client_branches cb ON cb.id = a.branch_id
       LEFT JOIN users cu ON cu.id = a.contractor_user_id
       LEFT JOIN users au ON au.id = a.assigned_auditor_id
       LEFT JOIN users sby ON sby.id = a.scheduled_by_user_id
       WHERE a.id = $1 AND a.assigned_auditor_id = $2`,
      [auditId, user.userId],
    );
    if (!rows.length) throw new NotFoundException('Audit not found');
    return rows[0];
  }

  // ═══════════════════════════════════════════════════════════════
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
    const inserted = await this.dataSource.query(
      `INSERT INTO audits
       (audit_code, client_id, branch_id, contractor_user_id,
        frequency, audit_type, period_year, period_code,
        assigned_auditor_id, created_by_user_id,
        due_date, status, schedule_id, created_at, updated_at)
       VALUES
       ($1, $2, $3, $4,
        'MONTHLY', $5, $6, $7,
        $8, $8,
        $9, 'IN_PROGRESS', $10, NOW(), NOW())
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
      ],
    );

    // Mark schedule IN_PROGRESS
    await this.dataSource.query(
      `UPDATE audit_schedules SET status = 'IN_PROGRESS', updated_at = NOW() WHERE id = $1`,
      [scheduleId],
    );

    return { auditId: inserted[0].id, created: true };
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
