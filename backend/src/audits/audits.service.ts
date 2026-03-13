import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { AuditEntity } from './entities/audit.entity';
import { AuditObservationEntity } from './entities/audit-observation.entity';
import { CreateAuditDto } from './dto/create-audit.dto';
import { ClientsService } from '../clients/clients.service';
import { UsersService } from '../users/users.service';
import { AssignmentsService } from '../assignments/assignments.service';
import { AuditType, Frequency } from '../common/enums';
import { generateAuditReportPdfBuffer } from './utils/report-pdf';

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
  constructor(
    @InjectRepository(AuditEntity)
    private readonly repo: Repository<AuditEntity>,
    @InjectRepository(AuditObservationEntity)
    private readonly observationRepo: Repository<AuditObservationEntity>,
    private readonly clientsService: ClientsService,
    private readonly usersService: UsersService,
    private readonly assignmentsService: AssignmentsService,
    private readonly dataSource: DataSource,
  ) {}

  private assertCrm(user: any) {
    if (!user || user.roleCode !== 'CRM') {
      throw new ForbiddenException('CRM access only');
    }
  }

  private assertAuditor(user: any) {
    if (!user || user.roleCode !== 'AUDITOR') {
      throw new ForbiddenException('Auditor access only');
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

  async createForCrm(user: any, dto: CreateAuditDto) {
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
        `SELECT id FROM client_branches WHERE id = $1 AND clientid = $2 AND isactive = TRUE`,
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
  async listForCrm(user: any, q: any) {
    this.assertCrm(user);

    // Get all clients assigned to this CRM
    const assignedClientIds =
      await this.assignmentsService.getAssignedClientsForCrm(user.userId);

    if (!assignedClientIds || assignedClientIds.length === 0) {
      return { data: [], total: 0 };
    }

    const clientIds = assignedClientIds.map(
      (c: any) => c.id ?? c.clientId ?? c,
    );

    const page = Math.max(1, Number(q?.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(q?.pageSize) || 25));

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

  async getForCrm(user: any, id: string) {
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
    user: any,
    auditId: string,
    dto: { assignedAuditorId?: string; dueDate?: string | null; notes?: string | null },
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

  async getReadinessForCrm(user: any, id: string) {
    const audit = await this.getForCrm(user, id);
    const [totalObservations, openObservations] = await Promise.all([
      this.observationRepo
        .createQueryBuilder('obs')
        .where('obs.auditId = :auditId', { auditId: id })
        .getCount(),
      this.observationRepo
        .createQueryBuilder('obs')
        .where('obs.auditId = :auditId', { auditId: id })
        .andWhere(`UPPER(COALESCE(obs.status, 'OPEN')) NOT IN ('RESOLVED','CLOSED')`)
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
        hint: audit.clientId ? 'Client mapping available' : 'Client scope missing',
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

  async getReportStatusForCrm(user: any, id: string) {
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

  // ─── Audit Status Transitions ──────────────────────────────────
  // Allowed transitions:
  //   PLANNED     → IN_PROGRESS | CANCELLED
  //   IN_PROGRESS → COMPLETED   | CANCELLED
  //   COMPLETED   → (none - terminal)
  //   CANCELLED   → (none - terminal)
  private static readonly ALLOWED_TRANSITIONS: Record<string, string[]> = {
    PLANNED: ['IN_PROGRESS', 'CANCELLED'],
    IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
    COMPLETED: [],
    CANCELLED: [],
  };

  async updateStatus(
    user: any,
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
        .andWhere(`UPPER(COALESCE(obs.status, 'OPEN')) NOT IN ('RESOLVED','CLOSED')`)
        .getCount();

      if (openObservationCount > 0) {
        throw new BadRequestException(
          `Cannot complete audit with ${openObservationCount} open observations`,
        );
      }
    }

    audit.status = targetStatus as any;
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

  async listForAuditor(user: any, q: any) {
    this.assertAuditor(user);

    const page = Math.max(1, Number(q?.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(q?.pageSize) || 25));

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

  async getForAuditor(user: any, id: string) {
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

  async getReportForAuditor(user: any, auditId: string) {
    const audit = await this.ensureAuditorAuditAccess(user, auditId);
    const rows = await this.dataSource.query(
      `SELECT
         ar.id AS "reportId",
         ar.audit_id AS "auditId",
         ar.report_type AS "reportType",
         ar.status AS "status",
         ar.executive_summary AS "executiveSummary",
         ar.scope AS "scope",
         ar.methodology AS "methodology",
         ar.findings AS "findings",
         ar.recommendations AS "recommendations",
         ar.selected_observation_ids AS "selectedObservationIds",
         ar.finalized_at AS "finalizedAt",
         ar.updated_at AS "updatedAt"
       FROM audit_reports ar
       WHERE ar.audit_id = $1
       ORDER BY ar.updated_at DESC, ar.created_at DESC
       LIMIT 1`,
      [auditId],
    );

    return this.mapReportRow(audit.id, rows[0] ?? null, audit.updatedAt || null);
  }

  async saveReportDraftForAuditor(
    user: any,
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
      throw new BadRequestException('Cannot edit report after audit completion');
    }

    const selectedObservationIds = Array.isArray(dto.selectedObservationIds)
      ? [...new Set(dto.selectedObservationIds.map((x) => String(x).trim()).filter(Boolean))]
      : [];
    const version = dto.version === 'CLIENT' ? 'CLIENT' : 'INTERNAL';

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
      await this.dataSource.query(
        `INSERT INTO audit_reports
          (audit_id, report_type, executive_summary, scope, methodology, findings, recommendations, selected_observation_ids, status, prepared_by_user_id, prepared_date, updated_at)
         VALUES
          ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, 'DRAFT', $9, CURRENT_DATE, NOW())`,
        [
          auditId,
          version,
          dto.executiveSummary || null,
          dto.scope || null,
          dto.methodology || null,
          dto.findings || null,
          dto.recommendations || null,
          JSON.stringify(selectedObservationIds),
          userId || null,
        ],
      );
    } else {
      const status = String(existing.status || '').toUpperCase();
      if (['APPROVED', 'PUBLISHED'].includes(status)) {
        throw new BadRequestException('Cannot edit approved or published report');
      }
      if (status !== 'DRAFT') {
        throw new BadRequestException('Reopen the report before editing');
      }

      await this.dataSource.query(
        `UPDATE audit_reports
         SET
           report_type = $1,
           executive_summary = $2,
           scope = $3,
           methodology = $4,
           findings = $5,
           recommendations = $6,
           selected_observation_ids = $7::jsonb,
           updated_at = NOW()
         WHERE id = $8`,
        [
          version,
          dto.executiveSummary || null,
          dto.scope || null,
          dto.methodology || null,
          dto.findings || null,
          dto.recommendations || null,
          JSON.stringify(selectedObservationIds),
          existing.id,
        ],
      );
    }

    return this.getReportForAuditor(user, auditId);
  }

  async finalizeReportForAuditor(user: any, auditId: string) {
    const audit = await this.ensureAuditorAuditAccess(user, auditId);
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
      throw new BadRequestException('Cannot finalize approved or published report');
    }
    if (status !== 'DRAFT') {
      return this.getReportForAuditor(user, auditId);
    }

    await this.dataSource.query(
      `UPDATE audit_reports
       SET status = 'SUBMITTED',
           finalized_at = NOW(),
           updated_at = NOW()
       WHERE id = $1`,
      [existing.id],
    );

    return this.getReportForAuditor(user, auditId);
  }

  async reopenReportForAuditor(user: any, auditId: string) {
    const audit = await this.ensureAuditorAuditAccess(user, auditId);
    if (String(audit.status || '').toUpperCase() === 'COMPLETED') {
      throw new BadRequestException('Cannot reopen report after audit completion');
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
      throw new BadRequestException('Cannot reopen approved or published report');
    }
    if (status !== 'SUBMITTED') {
      throw new BadRequestException(`Cannot reopen report in ${status} status`);
    }

    await this.dataSource.query(
      `UPDATE audit_reports
       SET status = 'DRAFT',
           finalized_at = NULL,
           updated_at = NOW()
       WHERE id = $1`,
      [existing.id],
    );

    return this.getReportForAuditor(user, auditId);
  }

  async exportReportPdfForAuditor(user: any, auditId: string): Promise<Buffer> {
    const audit = await this.ensureAuditorAuditAccess(user, auditId);
    const report = await this.getReportForAuditor(user, auditId);
    if (report.stage !== 'FINAL') {
      throw new BadRequestException(
        'Only finalized reports can be exported',
      );
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
      clientName: (audit as any).client?.clientName || null,
      branchName: (audit as any).branch?.branchName || null,
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

  async listForClient(user: any, q: any) {
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

  async getSummaryForClient(user: any) {
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

  private async ensureAuditorAuditAccess(user: any, auditId: string): Promise<AuditEntity> {
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

  private mapReportRow(auditId: string, row: any, fallbackUpdatedAt: Date | null) {
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
    const version = String(row.reportType || '').toUpperCase() === 'CLIENT'
      ? 'CLIENT'
      : 'INTERNAL';

    let selectedObservationIds: string[] = [];
    const rawSelected = row.selectedObservationIds;
    if (Array.isArray(rawSelected)) {
      selectedObservationIds = rawSelected.map((x: any) => String(x));
    } else if (typeof rawSelected === 'string') {
      try {
        const parsed = JSON.parse(rawSelected);
        if (Array.isArray(parsed)) {
          selectedObservationIds = parsed.map((x: any) => String(x));
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

  private async getLatestReportRow(auditId: string): Promise<any | null> {
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

  // ─── Branch Audit KPI ─────────────────────────────

  private ensurePeriod(p?: string): string {
    if (!p || !/^\d{4}-\d{2}$/.test(p)) {
      throw new BadRequestException('Invalid period format. Use YYYY-MM');
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
}
