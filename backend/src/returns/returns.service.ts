import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
type UploadedFile = { originalname: string; buffer: Buffer; mimetype: string };
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, SelectQueryBuilder } from 'typeorm';
import {
  ComplianceReturnEntity,
  ReturnStatus,
} from './entities/compliance-return.entity';
import { ComplianceReturnMasterEntity } from '../branch-compliance/entities/compliance-return-master.entity';
import { CreateReturnDto } from './dto/create-return.dto';
import { UpdateReturnStatusDto } from './dto/update-return-status.dto';
import { BranchAccessService } from '../auth/branch-access.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import type { AuditAction } from '../audit-logs/entities/audit-log.entity';
import { ComplianceNotificationCenterService } from './services/compliance-notification-center.service';
import { ClientAssignmentCurrentEntity } from '../assignments/entities/client-assignment-current.entity';
import { BranchEntity } from '../branches/entities/branch.entity';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { ReqUser } from '../access/access-scope.service';

export type ReturnKind = 'ack' | 'challan';

@Injectable()
export class ReturnsService {
  private readonly logger = new Logger(ReturnsService.name);
  private readonly allowedMimeTypes = new Set([
    'application/pdf',
    'image/png',
    'image/jpeg',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
  ]);

  // Status transition map — defines allowed next states from each state
  private readonly allowedTransitions: Record<ReturnStatus, ReturnStatus[]> = {
    PENDING: ['IN_PROGRESS', 'NOT_APPLICABLE'],
    IN_PROGRESS: ['PENDING', 'SUBMITTED', 'REJECTED', 'NOT_APPLICABLE'],
    SUBMITTED: ['IN_PROGRESS', 'APPROVED', 'REJECTED'],
    APPROVED: [],
    REJECTED: ['IN_PROGRESS'],
    NOT_APPLICABLE: ['PENDING'],
  };

  private validateTransition(current: ReturnStatus, next: ReturnStatus): void {
    if (current === next) {
      throw new BadRequestException(`Filing is already ${current}`);
    }
    if (!this.allowedTransitions[current]?.includes(next)) {
      throw new BadRequestException(
        `Cannot transition from ${current} to ${next}`,
      );
    }
  }

  constructor(
    @InjectRepository(ComplianceReturnEntity)
    private readonly returnsRepo: Repository<ComplianceReturnEntity>,
    @InjectRepository(ComplianceReturnMasterEntity)
    private readonly masterRepo: Repository<ComplianceReturnMasterEntity>,
    @InjectRepository(ClientAssignmentCurrentEntity)
    private readonly assignmentsRepo: Repository<ClientAssignmentCurrentEntity>,
    @InjectRepository(BranchEntity)
    private readonly branchRepo: Repository<BranchEntity>,
    private readonly branchAccess: BranchAccessService,
    private readonly dataSource: DataSource,
    private readonly auditLogs: AuditLogsService,
    private readonly notifCenter: ComplianceNotificationCenterService,
  ) {}

  // --------- Lookups ----------
  async getReturnTypes() {
    const rows = await this.masterRepo.find({
      where: { isActive: true },
      order: { lawArea: 'ASC', returnCode: 'ASC' },
    });
    return rows.map((r) => ({
      code: r.returnCode,
      label: r.returnName,
      lawType: r.lawArea,
      frequency: r.frequency,
      dueDay: r.dueDay,
    }));
  }

  // --------- Client-facing ---------
  async listForClient(user: ReqUser, q: Record<string, string>) {
    if (!user?.clientId) {
      this.logger.warn(
        `listForClient: clientId missing for userId=${user?.id} roleCode=${user?.roleCode}`,
      );
      return [];
    }
    const qb = this.returnsRepo
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.client', 'client')
      .leftJoinAndSelect('r.branch', 'branch')
      .where('r.clientId = :clientId', { clientId: user.clientId });

    await this.applyBranchScope(qb, user);
    this.applyFilters(qb, q);

    qb.orderBy('r.dueDate', 'DESC', 'NULLS LAST').addOrderBy(
      'r.createdAt',
      'DESC',
    );

    const rows = await qb.getMany();
    return rows.map((r) => this.mapReturnRow(r));
  }

  async createForClient(user: ReqUser, dto: CreateReturnDto) {
    this.ensureClientContext(user);
    if (dto.clientId !== user.clientId) {
      throw new ForbiddenException('Cross-tenant create blocked');
    }

    if (!dto.branchId) {
      throw new BadRequestException('branchId is required for client users');
    }

    // Master users can create filings for any branch of their client;
    // Branch users can only create for their assigned branches.
    await this.branchAccess.assertBranchAccess(user.userId, dto.branchId);

    // Verify branch belongs to this client
    await this.assertBranchBelongsToClient(dto.branchId, dto.clientId);

    // Prevent duplicate filings for the same client/branch/return/period
    await this.assertNoDuplicate(dto);

    const entity = this.returnsRepo.create({
      clientId: user.clientId,
      branchId: dto.branchId,
      lawType: dto.lawType,
      returnType: dto.returnType,
      periodYear: dto.periodYear,
      periodMonth: dto.periodMonth ?? null,
      periodLabel: dto.periodLabel ?? null,
      dueDate: await this.resolveDueDate(dto),
      status: 'PENDING',
      createdByRole: 'CLIENT',
      filedByUserId: null,
      filedDate: null,
      ackNumber: null,
      ackFilePath: null,
      challanFilePath: null,
    });

    return this.returnsRepo.save(entity);
  }

  async uploadProof(
    user: ReqUser,
    id: string,
    kind: ReturnKind,
    file: UploadedFile,
    ackNumber?: string | null,
  ) {
    const rec = await this.findOwned(user, id);

    // Upload permissions:
    // - CRM users: allowed if they are assigned to the client
    // - Branch CLIENT users: only branch users for that branch (requires branchId)
    if (user?.roleCode === 'CRM') {
      const assignment = await this.assignmentsRepo.findOne({
        where: {
          clientId: rec.clientId,
          assignmentType: 'CRM',
          assignedToUserId: user.userId,
        },
      });
      if (!assignment)
        throw new ForbiddenException('You are not assigned to this client');
    } else if (user?.roleCode === 'CLIENT') {
      if (!rec.branchId)
        throw new ForbiddenException('Branch ID missing for filing');
      await this.branchAccess.assertBranchUserOnly(user.userId, rec.branchId);
    } else {
      throw new ForbiddenException(
        'Only CRM and CLIENT roles can upload proofs',
      );
    }

    if (!file) throw new BadRequestException('File is required');
    if (!this.allowedMimeTypes.has(file.mimetype)) {
      throw new BadRequestException('File type not allowed');
    }

    const storedPath = this.saveFile(file, kind);

    if (kind === 'ack') {
      rec.ackFilePath = storedPath;
      rec.ackNumber = ackNumber ?? rec.ackNumber;
    } else {
      rec.challanFilePath = storedPath;
    }

    rec.filedByUserId = user.userId;
    rec.status = rec.status === 'PENDING' ? 'IN_PROGRESS' : rec.status;

    // Tag on-behalf metadata when CRM uploads
    if (user?.roleCode === 'CRM') {
      rec.uploadedByRole = 'CRM';
      rec.actingOnBehalf = true;
      rec.originalOwnerRole = 'BRANCH';
    }

    const saved = await this.returnsRepo.save(rec);

    this.auditLogs
      .log({
        entityType: 'RETURN_TASK',
        entityId: saved.id,
        action: 'DOCUMENT_UPLOADED',
        performedBy: user.userId ?? user.id,
        performedRole: user.roleCode ?? 'CRM',
        afterJson: { kind, fileName: file.originalname },
        meta: user?.roleCode === 'CRM'
          ? { actingOnBehalf: true, originalOwnerRole: 'BRANCH' }
          : undefined,
      })
      .catch((e) =>
        this.logger.warn('Audit-log (doc upload) failed', e?.message),
      );

    return saved;
  }

  async submit(user: ReqUser, id: string) {
    const rec = await this.findOwned(user, id);
    if (rec.branchId) {
      await this.branchAccess.assertBranchUserOnly(user.userId, rec.branchId);
    }

    this.validateTransition(rec.status, 'SUBMITTED');

    rec.status = 'SUBMITTED';
    rec.filedByUserId = user.userId;
    rec.filedDate = rec.filedDate ?? this.today();

    return this.returnsRepo.save(rec);
  }

  // --------- CRM ---------
  async createForCrm(user: ReqUser, dto: CreateReturnDto) {
    // CRM can only create filings for their assigned clients
    const assignment = await this.assignmentsRepo.findOne({
      where: {
        clientId: dto.clientId,
        assignmentType: 'CRM',
        assignedToUserId: user.userId,
      },
    });
    if (!assignment) {
      throw new ForbiddenException('Client not assigned to you');
    }

    // Verify branch belongs to the specified client
    if (dto.branchId) {
      await this.assertBranchBelongsToClient(dto.branchId, dto.clientId);
    }

    // Prevent duplicate filings for the same client/branch/return/period
    await this.assertNoDuplicate(dto);

    const entity = this.returnsRepo.create({
      clientId: dto.clientId,
      branchId: dto.branchId ?? null,
      lawType: dto.lawType,
      returnType: dto.returnType,
      periodYear: dto.periodYear,
      periodMonth: dto.periodMonth ?? null,
      periodLabel: dto.periodLabel ?? null,
      dueDate: await this.resolveDueDate(dto),
      status: 'PENDING',
      createdByRole: 'CRM',
    });

    const saved = await this.returnsRepo.save(entity);

    this.auditLogs
      .log({
        entityType: 'RETURN_TASK',
        entityId: saved.id,
        action: 'CREATED',
        performedBy: user.userId ?? user.id,
        performedRole: 'CRM',
        afterJson: {
          clientId: saved.clientId,
          branchId: saved.branchId,
          returnType: saved.returnType,
          lawType: saved.lawType,
          periodYear: saved.periodYear,
          periodMonth: saved.periodMonth,
        },
      })
      .catch((e) =>
        this.logger.warn('Audit-log (return created) failed', e?.message),
      );

    return saved;
  }

  async listForCrm(user: ReqUser, q: Record<string, string>) {
    const qb = this.returnsRepo
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.client', 'client')
      .leftJoinAndSelect('r.branch', 'branch')
      .innerJoin(
        ClientAssignmentCurrentEntity,
        'ac',
        'ac.clientId = r.clientId AND ac.assignmentType = :type AND ac.assignedToUserId = :crmId',
        { type: 'CRM', crmId: user.userId },
      );

    this.applyFilters(qb, q);
    qb.orderBy('r.dueDate', 'DESC', 'NULLS LAST').addOrderBy(
      'r.createdAt',
      'DESC',
    );
    const rows = await qb.getMany();
    return rows.map((r) => this.mapReturnRow(r));
  }

  async getForCrm(user: ReqUser, id: string) {
    return this.assertCrmAssigned(user, id);
  }

  async updateStatusAsCrm(
    user: ReqUser,
    id: string,
    dto: UpdateReturnStatusDto,
  ) {
    const rec = await this.assertCrmAssigned(user, id);

    this.validateTransition(rec.status, dto.status);

    // Server-side evidence guardrails (mirror the UI rules)
    if (dto.status === 'SUBMITTED' && !rec.challanFilePath) {
      throw new BadRequestException(
        'Challan proof must be uploaded before marking as SUBMITTED',
      );
    }
    if (dto.status === 'APPROVED') {
      if (!rec.ackFilePath) {
        throw new BadRequestException(
          'ACK proof must be uploaded before marking as APPROVED',
        );
      }
      if (!rec.ackNumber) {
        throw new BadRequestException(
          'ACK number is required before marking as APPROVED',
        );
      }
    }

    rec.status = dto.status;
    if (dto.status === 'SUBMITTED' || dto.status === 'APPROVED') {
      rec.filedDate = rec.filedDate ?? this.today();
    }
    if (dto.status === 'NOT_APPLICABLE') {
      rec.filedDate = null;
    }
    const oldStatus = rec.status;
    const saved = await this.returnsRepo.save(rec);

    // Auto-close related system tasks when filing reaches terminal state
    if (dto.status === 'APPROVED' || dto.status === 'NOT_APPLICABLE') {
      this.autoCloseFilingTask(saved.id).catch((e) =>
        this.logger.warn('Auto-close filing task failed', e?.message),
      );
    }

    this.auditLogs
      .log({
        entityType: 'RETURN_TASK',
        entityId: saved.id,
        action: 'UPDATE',
        performedBy: user.userId ?? user.id,
        performedRole: 'CRM',
        beforeJson: { status: oldStatus },
        afterJson: { status: saved.status, filedDate: saved.filedDate },
      })
      .catch((e) =>
        this.logger.warn('Audit-log (status update) failed', e?.message),
      );

    if (['APPROVED', 'REJECTED', 'SUBMITTED'].includes(dto.status)) {
      this.auditLogs
        .logApproval({
          taskType: 'RETURN',
          taskId: saved.id,
          stage: dto.status,
          decision: dto.status,
          actorUserId: user.userId ?? user.id,
          actorRole: 'CRM',
        })
        .catch((e) =>
          this.logger.warn('Audit-log (approval) failed', e?.message),
        );
    }

    return saved;
  }

  async requestUpdateAsCrm(
    user: ReqUser,
    id: string,
    action: 'RETURN' | 'REMINDER' | 'OWNER' | 'NOTE' = 'RETURN',
    message?: string | null,
    owner?: string | null,
  ) {
    const rec = await this.assertCrmAssigned(user, id);
    const note = (message || '').trim();

    // Only a true "return to branch" should change workflow state.
    if (action === 'RETURN' && rec.status !== 'APPROVED') {
      rec.status = 'IN_PROGRESS';
    }

    if (action === 'REMINDER') {
      rec.crmLastReminderAt = new Date();
    }

    if (action === 'OWNER') {
      const ownerValue = (owner || '').trim().substring(0, 150);
      if (ownerValue) {
        rec.crmOwner = ownerValue;
      }
    }

    if (note) {
      rec.crmLastNote = note.substring(0, 5000);
      rec.crmLastNoteAt = new Date();
    }

    const saved = await this.returnsRepo.save(rec);

    const actionMap: Record<string, string> = {
      RETURN: 'RETURNED_FOR_CORRECTION',
      REMINDER: 'REMINDER_SENT',
      OWNER: 'OWNER_CHANGED',
      NOTE: 'UPDATE',
    };
    this.auditLogs
      .log({
        entityType: 'RETURN_TASK',
        entityId: saved.id,
        action: (actionMap[action] || 'UPDATE') as AuditAction,
        performedBy: user.userId ?? user.id,
        performedRole: 'CRM',
        afterJson: { action, message: note || null, owner: owner || null },
      })
      .catch((e) =>
        this.logger.warn('Audit-log (CRM action) failed', e?.message),
      );

    return saved;
  }

  async softDeleteAsCrm(user: ReqUser, id: string, reason?: string | null) {
    const rec = await this.assertCrmAssigned(user, id);

    rec.isDeleted = true;
    rec.deletedAt = new Date();
    rec.deletedBy = user.userId;
    rec.deleteReason = reason ?? null;

    const saved = await this.returnsRepo.save(rec);

    this.auditLogs
      .log({
        entityType: 'RETURN_TASK',
        entityId: saved.id,
        action: 'SOFT_DELETE',
        performedBy: user.userId ?? user.id,
        performedRole: 'CRM',
        reason: reason ?? null,
      })
      .catch((e) =>
        this.logger.warn('Audit-log (soft-delete) failed', e?.message),
      );

    return saved;
  }

  // --------- Admin ---------
  async listForAdmin(q: Record<string, string>) {
    const qb = this.returnsRepo
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.client', 'client')
      .leftJoinAndSelect('r.branch', 'branch');
    this.applyFilters(qb, q);
    qb.orderBy('r.dueDate', 'DESC', 'NULLS LAST').addOrderBy(
      'r.createdAt',
      'DESC',
    );
    const rows = await qb.getMany();
    return rows.map((r) => this.mapReturnRow(r));
  }

  async updateStatusAsAdmin(id: string, dto: UpdateReturnStatusDto) {
    const rec = await this.returnsRepo.findOne({
      where: { id, isDeleted: false },
    });
    if (!rec) throw new NotFoundException('Return not found');
    this.validateTransition(rec.status, dto.status);
    rec.status = dto.status;
    if (dto.status === 'APPROVED') {
      rec.filedDate = rec.filedDate ?? this.today();
    }
    const saved = await this.returnsRepo.save(rec);

    if (dto.status === 'APPROVED' || dto.status === 'NOT_APPLICABLE') {
      this.autoCloseFilingTask(saved.id).catch((e) =>
        this.logger.warn('Auto-close filing task failed', e?.message),
      );
    }

    return saved;
  }

  async softDeleteAsAdmin(
    id: string,
    deletedBy: string | null,
    reason?: string | null,
  ) {
    const rec = await this.returnsRepo.findOne({
      where: { id, isDeleted: false },
    });
    if (!rec) throw new NotFoundException('Return not found');

    rec.isDeleted = true;
    rec.deletedAt = new Date();
    rec.deletedBy = deletedBy ?? null;
    rec.deleteReason = reason ?? rec.deleteReason ?? null;

    return this.returnsRepo.save(rec);
  }

  async restoreAsAdmin(id: string) {
    const rec = await this.returnsRepo.findOne({
      where: { id, isDeleted: true },
    });
    if (!rec) throw new NotFoundException('Return not found or not deleted');

    rec.isDeleted = false;
    rec.deletedAt = null;
    rec.deletedBy = null;
    rec.deleteReason = null;

    return this.returnsRepo.save(rec);
  }

  // --------- Helpers ---------
  private async autoCloseFilingTask(filingId: string): Promise<void> {
    await this.dataSource.query(
      `UPDATE system_tasks
       SET status = 'CLOSED', updated_at = NOW()
       WHERE reference_id = $1
         AND reference_type IN ('COMPLIANCE_RETURN', 'RENEWAL_FILING')
         AND status NOT IN ('CLOSED', 'CANCELLED')`,
      [filingId],
    );
  }

  private async assertBranchBelongsToClient(
    branchId: string,
    clientId: string,
  ): Promise<void> {
    const branch = await this.branchRepo.findOne({
      where: { id: branchId },
      select: ['id', 'clientId'],
    });
    if (!branch) {
      throw new BadRequestException('Branch not found');
    }
    if (branch.clientId !== clientId) {
      throw new ForbiddenException(
        'Branch does not belong to the specified client',
      );
    }
  }

  private async assertNoDuplicate(dto: CreateReturnDto): Promise<void> {
    const where: Record<string, unknown> = {
      clientId: dto.clientId,
      returnType: dto.returnType,
      periodYear: dto.periodYear,
      isDeleted: false,
    };
    if (dto.branchId) where.branchId = dto.branchId;
    if (dto.periodMonth) where.periodMonth = dto.periodMonth;

    const existing = await this.returnsRepo.findOne({ where });
    if (existing) {
      throw new BadRequestException(
        'A filing for this client/branch/return type/period already exists',
      );
    }
  }

  private ensureClientContext(user: ReqUser) {
    if (!user?.clientId) {
      this.logger.warn(
        `ensureClientContext: clientId missing for userId=${user?.id} roleCode=${user?.roleCode}`,
      );
      throw new ForbiddenException('Client context missing');
    }
  }

  private async findOwned(user: ReqUser, id: string) {
    const rec = await this.returnsRepo.findOne({
      where: { id, isDeleted: false },
    });
    if (!rec) throw new NotFoundException('Return not found');
    // CRM users are verified via assignment check in the caller
    if (user?.roleCode !== 'CRM' && rec.clientId !== user.clientId) {
      throw new ForbiddenException('Cross-tenant access blocked');
    }
    return rec;
  }

  private applyFilters(qb: SelectQueryBuilder<ComplianceReturnEntity>, q: Record<string, string>) {
    qb.andWhere('r.isDeleted = false').andWhere('r.deletedAt IS NULL');
    if (!q) return;
    if (q.clientId)
      qb.andWhere('r.clientId = :clientId', { clientId: q.clientId });
    if (q.branchId)
      qb.andWhere('r.branchId = :branchId', { branchId: q.branchId });
    if (q.lawType) {
      const lawType = String(q.lawType).trim();
      if (lawType) {
        qb.andWhere('UPPER(r.lawType) = :lawType', {
          lawType: lawType.toUpperCase(),
        });
      }
    }
    if (q.returnType) {
      const returnType = String(q.returnType).trim();
      if (returnType) {
        qb.andWhere('UPPER(r.returnType) LIKE :returnType', {
          returnType: `%${returnType.toUpperCase()}%`,
        });
      }
    }
    if (q.status)
      qb.andWhere('r.status = :status', { status: q.status as ReturnStatus });
    if (q.periodYear)
      qb.andWhere('r.periodYear = :py', { py: Number(q.periodYear) });
    if (q.periodMonth)
      qb.andWhere('r.periodMonth = :pm', { pm: Number(q.periodMonth) });
  }

  private async applyBranchScope(qb: SelectQueryBuilder<ComplianceReturnEntity>, user: ReqUser) {
    const allowed = await this.branchAccess.getAllowedBranchIds(
      user.userId,
      user.clientId!,
    );
    if (allowed !== 'ALL') {
      if (!allowed.length) {
        qb.andWhere('1=0');
      } else {
        qb.andWhere('r.branchId IN (:...branchIds)', { branchIds: allowed });
      }
    }
  }

  private async resolveDueDate(dto: CreateReturnDto): Promise<string | null> {
    if (dto.dueDate) return dto.dueDate;

    const master = await this.masterRepo.findOne({
      where: { returnCode: dto.returnType, isActive: true },
    });
    if (!master) {
      throw new BadRequestException(
        `Return type "${dto.returnType}" not found in masters or is inactive`,
      );
    }

    if (!dto.periodYear || !dto.periodMonth) {
      // Non-monthly returns: use end of fiscal year as a fallback due date
      // so these filings still appear in overdue tracking.
      if (dto.periodYear) {
        const dueDay = master.dueDay ?? 20;
        // Default: due on the dueDay of March next year (fiscal year end convention)
        const d = new Date(Date.UTC(dto.periodYear + 1, 2, dueDay));
        return d.toISOString().substring(0, 10);
      }
      return null;
    }

    const dueDay = master.dueDay ?? 20;
    const nextMonth = dto.periodMonth === 12 ? 1 : dto.periodMonth + 1;
    const nextYear =
      dto.periodMonth === 12 ? dto.periodYear + 1 : dto.periodYear;
    const d = new Date(Date.UTC(nextYear, nextMonth - 1, dueDay));
    return d.toISOString().substring(0, 10);
  }

  private today(): string {
    return new Date().toISOString().substring(0, 10);
  }

  private saveFile(file: UploadedFile, kind: ReturnKind): string {
    const dir = path.join(process.cwd(), 'uploads', 'returns');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const safe = (file.originalname || 'file')
      .replace(/[^a-zA-Z0-9.\-_]/g, '_')
      .substring(0, 80);
    const filename = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}_${kind}_${safe}`;
    const dest = path.join(dir, filename);
    fs.writeFileSync(dest, file.buffer);
    return `/uploads/returns/${filename}`;
  }

  private async assertCrmAssigned(user: ReqUser, id: string) {
    const rec = await this.returnsRepo.findOne({
      where: { id, isDeleted: false },
    });
    if (!rec) throw new NotFoundException('Return not found');

    const assignment = await this.assignmentsRepo.findOne({
      where: {
        clientId: rec.clientId,
        assignmentType: 'CRM',
        assignedToUserId: user.userId,
      },
    });

    if (!assignment) {
      throw new ForbiddenException('You are not assigned to this client');
    }

    return rec;
  }

  // ── Bulk CRM operations ──

  /** Build CSV string for export from mapped rows */
  buildCsvExport(rows: Record<string, string | number | null>[]): string {
    const columns = [
      { key: 'clientName', label: 'Client' },
      { key: 'branchName', label: 'Branch' },
      { key: 'lawType', label: 'Law Type' },
      { key: 'returnType', label: 'Return Type' },
      { key: 'periodYear', label: 'Year' },
      { key: 'periodMonth', label: 'Month' },
      { key: 'dueDate', label: 'Due Date' },
      { key: 'filedDate', label: 'Filed Date' },
      { key: 'status', label: 'Status' },
      { key: 'ackNumber', label: 'ACK Number' },
      { key: 'createdByRole', label: 'Created By' },
    ];
    const header = columns.map((c) => `"${c.label}"`).join(',');
    const body = rows
      .map((r) =>
        columns
          .map((c) => {
            const v = r[c.key] ?? '';
            return `"${String(v).replace(/"/g, '""')}"`;
          })
          .join(','),
      )
      .join('\n');
    return `${header}\n${body}`;
  }

  async bulkUpdateStatus(
    user: ReqUser,
    taskIds: string[],
    status: ReturnStatus,
    _remarks?: string,
  ) {
    const results: { taskId: string; ok: boolean; error?: string }[] = [];

    for (const taskId of taskIds) {
      try {
        await this.updateStatusAsCrm(user, taskId, {
          status,
        } as UpdateReturnStatusDto);
        results.push({ taskId, ok: true });
      } catch (error: unknown) {
        results.push({
          taskId,
          ok: false,
          error: (error as Error)?.message || 'Failed',
        });
      }
    }

    return results;
  }

  async bulkMarkFiled(user: ReqUser, taskIds: string[], filedOn: string) {
    const results: { taskId: string; ok: boolean; error?: string }[] = [];

    for (const taskId of taskIds) {
      try {
        const rec = await this.assertCrmAssigned(user, taskId);
        this.validateTransition(rec.status, 'SUBMITTED' as ReturnStatus);
        rec.status = 'SUBMITTED' as ReturnStatus;
        rec.filedDate = filedOn || this.today();
        await this.returnsRepo.save(rec);
        this.auditLogs
          .log({
            entityType: 'RETURN_TASK',
            entityId: taskId,
            action: 'BULK_ACTION',
            performedBy: user.userId ?? user.id,
            performedRole: 'CRM',
            afterJson: { bulkOp: 'MARK_FILED', filedOn },
          })
          .catch((e) =>
            this.logger.warn('Audit-log (bulk mark-filed) failed', e?.message),
          );
        results.push({ taskId, ok: true });
      } catch (error: unknown) {
        results.push({
          taskId,
          ok: false,
          error: (error as Error)?.message || 'Failed',
        });
      }
    }

    return results;
  }

  async bulkVerifyAndClose(user: ReqUser, taskIds: string[]) {
    const results: { taskId: string; ok: boolean; error?: string }[] = [];

    for (const taskId of taskIds) {
      try {
        await this.updateStatusAsCrm(user, taskId, {
          status: 'APPROVED',
        } as UpdateReturnStatusDto);
        results.push({ taskId, ok: true });
      } catch (error: unknown) {
        results.push({
          taskId,
          ok: false,
          error: (error as Error)?.message || 'Failed',
        });
      }
    }

    return results;
  }

  async sendBulkReminders(user: ReqUser, taskIds: string[], message?: string) {
    const results: { taskId: string; ok: boolean; error?: string }[] = [];
    const note = (
      message || 'Please complete this filing at the earliest.'
    ).trim();

    for (const taskId of taskIds) {
      try {
        const rec = await this.assertCrmAssigned(user, taskId);

        await this.notifCenter.createNotification({
          clientId: rec.clientId,
          branchId: rec.branchId ?? undefined,
          role: 'CLIENT',
          module: 'RETURNS',
          title: `Reminder: ${rec.returnType} filing`,
          message: note,
          priority: 'HIGH',
          entityId: rec.id,
          entityType: 'COMPLIANCE_RETURN',
        });

        rec.crmLastReminderAt = new Date();
        await this.returnsRepo.save(rec);

        this.auditLogs
          .log({
            entityType: 'RETURN_TASK',
            entityId: taskId,
            action: 'REMINDER_SENT',
            performedBy: user.userId ?? user.id,
            performedRole: 'CRM',
            afterJson: { message: note },
          })
          .catch((e) =>
            this.logger.warn('Audit-log (reminder sent) failed', e?.message),
          );

        results.push({ taskId, ok: true });
      } catch (error: unknown) {
        results.push({
          taskId,
          ok: false,
          error: (error as Error)?.message || 'Failed',
        });
      }
    }

    return results;
  }

  private mapReturnRow(r: ComplianceReturnEntity) {
    const clientName = r.client?.clientName ?? null;
    const branchName = r.branch?.branchName ?? null;
    const { client, branch, ...rest } = r as unknown as Record<string, unknown>;
    return { ...rest, clientName, branchName };
  }
}
