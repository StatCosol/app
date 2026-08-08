import * as fs from 'fs';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReqUser } from '../access/access-scope.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  PayrollInputStatus,
  PAYROLL_INPUT_STATUS_TRANSITIONS,
} from './constants/payroll-input-status';
import {
  ClientCreatePayrollInputDto,
  ClientUploadPayrollInputFileDto,
} from './dto/client-payroll-input.dto';
import { ClientUpdatePayrollInputStatusDto } from './dto/client-update-payroll-input-status.dto';
import { UpdatePayrollInputStatusDto } from './dto/update-payroll-input-status.dto';
import { PayrollClientAssignmentEntity } from './entities/payroll-client-assignment.entity';
import { PayrollClientSettings } from './entities/payroll-client-settings.entity';
import { PayrollClientTemplate } from './entities/payroll-client-template.entity';
import { PayrollInputEntity } from './entities/payroll-input.entity';
import { PayrollInputFileEntity } from './entities/payroll-input-file.entity';
import { PayrollInputStatusHistoryEntity } from './entities/payroll-input-status-history.entity';
import { PayrollTemplate } from './entities/payroll-template.entity';
import { ClientEntity } from '../clients/entities/client.entity';
import { PayrollClientScopeService } from './payroll-client-scope.service';

@Injectable()
export class PayrollInputService {
  constructor(
    @InjectRepository(PayrollInputEntity)
    private readonly inputRepo: Repository<PayrollInputEntity>,
    @InjectRepository(PayrollInputFileEntity)
    private readonly fileRepo: Repository<PayrollInputFileEntity>,
    @InjectRepository(PayrollInputStatusHistoryEntity)
    private readonly statusHistoryRepo: Repository<PayrollInputStatusHistoryEntity>,
    @InjectRepository(PayrollClientAssignmentEntity)
    private readonly assignRepo: Repository<PayrollClientAssignmentEntity>,
    @InjectRepository(ClientEntity)
    private readonly clientRepo: Repository<ClientEntity>,
    @InjectRepository(PayrollClientSettings)
    private readonly clientSettingsRepo: Repository<PayrollClientSettings>,
    @InjectRepository(PayrollTemplate)
    private readonly templateRepo: Repository<PayrollTemplate>,
    @InjectRepository(PayrollClientTemplate)
    private readonly clientTemplateRepo: Repository<PayrollClientTemplate>,
    private readonly notificationsSvc: NotificationsService,
    private readonly scope: PayrollClientScopeService,
  ) {}

  ymLabel(year: number, month: number) {
    if (!year || !month) return '';
    return `${year}-${String(month).padStart(2, '0')}`;
  }

  CLIENT_ALLOWED_TRANSITIONS = {
    [PayrollInputStatus.DRAFT]: [
      PayrollInputStatus.SUBMITTED,
      PayrollInputStatus.CANCELLED,
    ],
    [PayrollInputStatus.SUBMITTED]: [
      PayrollInputStatus.NEEDS_CLARIFICATION,
      PayrollInputStatus.COMPLETED,
      PayrollInputStatus.REJECTED,
    ],
    [PayrollInputStatus.NEEDS_CLARIFICATION]: [
      PayrollInputStatus.SUBMITTED,
      PayrollInputStatus.CANCELLED,
    ],
    [PayrollInputStatus.REJECTED]: [
      PayrollInputStatus.SUBMITTED,
      PayrollInputStatus.CANCELLED,
    ],
    [PayrollInputStatus.COMPLETED]: [],
    [PayrollInputStatus.CANCELLED]: [],
  };

  private assertClientTransition(
    from: PayrollInputStatus,
    to: PayrollInputStatus,
  ) {
    const allowed = this.CLIENT_ALLOWED_TRANSITIONS[from] ?? [];
    if (!allowed.includes(to)) {
      throw new BadRequestException(
        `Client cannot change status: ${from} -> ${to}`,
      );
    }
  }

  async clientUpdatePayrollInputStatus(
    user: ReqUser,
    payrollInputId: string,
    dto: ClientUpdatePayrollInputStatusDto,
  ) {
    await this.ensureClientPayrollAccess(user);
    const input = await this.inputRepo.findOne({
      where: { id: payrollInputId },
    });
    if (!input) throw new BadRequestException('Payroll input not found');
    if (input.clientId !== user.clientId)
      throw new ForbiddenException('Access denied');
    const fromStatus =
      (input.status as PayrollInputStatus) || PayrollInputStatus.DRAFT;
    const toStatus = dto.status as PayrollInputStatus; // SUBMITTED | CANCELLED
    this.assertClientTransition(fromStatus, toStatus);
    input.status = toStatus;
    input.statusUpdatedAt = new Date();
    input.statusUpdatedByUserId = user.id;
    const shouldNotifyPayroll =
      toStatus === PayrollInputStatus.SUBMITTED &&
      (fromStatus === PayrollInputStatus.NEEDS_CLARIFICATION ||
        fromStatus === PayrollInputStatus.REJECTED);
    const saved = await this.inputRepo.save(input);
    await this.statusHistoryRepo.save(
      this.statusHistoryRepo.create({
        payrollInputId: input.id,
        fromStatus,
        toStatus,
        changedByUserId: user.id,
        remarks: dto.remarks ?? null,
      }),
    );
    if (shouldNotifyPayroll) {
      const subject =
        `Client re-submitted payroll input: ${input.title} ${this.ymLabel(input.periodYear, input.periodMonth)}`.trim();
      const message = dto.remarks?.trim()
        ? `Client has re-submitted the payroll input.\n\nClient remarks: ${dto.remarks.trim()}`
        : `Client has re-submitted the payroll input after clarification/rejection. Please review.`;
      await this.notificationsSvc.createTicket(
        user.id,
        'ADMIN', // or another valid RoleCode, adjust as needed
        {
          queryType: 'GENERAL',
          subject,
          message,
          clientId: input.clientId,
          branchId: input.branchId ?? undefined,
        },
      );
    }
    return saved;
  }

  async clientGetPayrollInputStatusHistory(
    user: ReqUser,
    payrollInputId: string,
  ) {
    await this.ensureClientPayrollAccess(user);
    const input = await this.inputRepo.findOne({
      where: { id: payrollInputId },
    });
    if (!input) throw new BadRequestException('Payroll input not found');
    if (input.clientId !== user.clientId)
      throw new ForbiddenException('Access denied');
    return this.statusHistoryRepo.find({
      where: { payrollInputId: input.id },
      order: { changedAt: 'DESC' },
    });
  }

  private ensureClientUser(user: ReqUser) {
    const isClient =
      !!user?.id && user?.roleCode === 'CLIENT' && !!user?.clientId;
    const isBranchUser = user?.userType === 'BRANCH';

    if (!isClient || isBranchUser) {
      throw new BadRequestException(
        'Only client master users can access payroll',
      );
    }
  }

  /** Allows both MASTER and BRANCH client users */
  private ensureClientOrBranchUser(user: ReqUser) {
    const isClient =
      !!user?.id && user?.roleCode === 'CLIENT' && !!user?.clientId;
    if (!isClient) {
      throw new BadRequestException(
        'Only client users can access this resource',
      );
    }
  }

  /** Allows master users always; branch users only if toggle is on */
  private async ensureClientPayrollAccess(user: ReqUser) {
    this.ensureClientOrBranchUser(user);
    if (user.userType === 'BRANCH') {
      const toggles = await this.getClientAccessToggles(user.clientId!);
      if (!toggles.allowBranchPayrollAccess) {
        throw new ForbiddenException(
          'Payroll access has not been enabled for branch users',
        );
      }
    }
  }

  private async getClientAccessToggles(clientId: string): Promise<{
    allowBranchPayrollAccess: boolean;
    allowBranchWageRegisters: boolean;
    allowBranchSalaryRegisters: boolean;
    payrollBranchScope: 'ALL' | 'SELECTED';
    payrollAllowedBranchIds: string[];
  }> {
    const row = await this.clientSettingsRepo.findOne({ where: { clientId } });
    const s = row?.settings || {};
    return {
      allowBranchPayrollAccess: s.allowBranchPayrollAccess === true,
      allowBranchWageRegisters: s.allowBranchWageRegisters === true,
      allowBranchSalaryRegisters: s.allowBranchSalaryRegisters === true,
      payrollBranchScope:
        s.payrollBranchScope === 'SELECTED' ? 'SELECTED' : 'ALL',
      payrollAllowedBranchIds: Array.isArray(s.payrollAllowedBranchIds)
        ? s.payrollAllowedBranchIds
        : [],
    };
  }

  async clientCreatePayrollInput(
    user: ReqUser,
    dto: ClientCreatePayrollInputDto,
  ) {
    await this.ensureClientPayrollAccess(user);
    if (!dto?.title || !dto?.periodYear || !dto?.periodMonth) {
      throw new BadRequestException(
        'title, periodYear, periodMonth are required',
      );
    }
    if (dto.periodMonth < 1 || dto.periodMonth > 12) {
      throw new BadRequestException('periodMonth must be 1..12');
    }
    // Branch users can only create inputs for their own branch
    const branchId =
      user.userType === 'BRANCH' && user.branchIds?.length
        ? user.branchIds[0]
        : (dto.branchId ?? null);
    const row = this.inputRepo.create({
      clientId: user.clientId!,
      branchId,
      periodYear: Number(dto.periodYear),
      periodMonth: Number(dto.periodMonth),
      title: dto.title.trim(),
      notes: dto.notes ?? null,
      status: PayrollInputStatus.DRAFT,
      submittedByUserId: user.id,
    });
    return this.inputRepo.save(row);
  }

  async clientListPayrollInputs(user: ReqUser, q: Record<string, any>) {
    await this.ensureClientPayrollAccess(user);
    const qb = this.inputRepo
      .createQueryBuilder('p')
      .where('p.client_id = :cid', { cid: user.clientId })
      .orderBy('p.created_at', 'DESC');
    // Branch users only see inputs for their own branch(es)
    if (user.userType === 'BRANCH' && user.branchIds?.length) {
      qb.andWhere('p.branch_id IN (:...ubids)', { ubids: user.branchIds });
    } else if (q?.branchId) {
      qb.andWhere('p.branch_id = :bid', { bid: q.branchId });
    }
    if (q?.periodYear)
      qb.andWhere('p.period_year = :y', { y: Number(q.periodYear) });
    if (q?.periodMonth)
      qb.andWhere('p.period_month = :m', { m: Number(q.periodMonth) });
    if (q?.status) qb.andWhere('p.status = :s', { s: q.status });
    const rows = await qb.getMany();
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);
    const counts = await this.fileRepo
      .createQueryBuilder('f')
      .select('f.payroll_input_id', 'payrollInputId')
      .addSelect('COUNT(1)', 'cnt')
      .where('f.payroll_input_id IN (:...ids)', { ids })
      .groupBy('f.payroll_input_id')
      .getRawMany<{ payrollInputId: string; cnt: string }>();
    const mapCnt = new Map<string, number>();
    for (const c of counts) mapCnt.set(c.payrollInputId, Number(c.cnt || 0));
    return rows.map((p) => ({
      id: p.id,
      clientId: p.clientId,
      branchId: p.branchId ?? null,
      periodYear: p.periodYear,
      periodMonth: p.periodMonth,
      title: p.title,
      status: p.status,
      createdAt: p.createdAt,
      filesCount: mapCnt.get(p.id) ?? 0,
      filesUrl: `/api/client/payroll/inputs/${p.id}/files`,
    }));
  }

  async clientUploadPayrollInputFile(
    user: ReqUser,
    payrollInputId: string,
    dto: ClientUploadPayrollInputFileDto,
    file: Express.Multer.File,
  ) {
    await this.ensureClientPayrollAccess(user);
    if (!file) throw new BadRequestException('File is required');
    const input = await this.inputRepo.findOne({
      where: { id: payrollInputId },
    });
    if (!input) throw new BadRequestException('Payroll input not found');
    if (input.clientId !== user.clientId)
      throw new ForbiddenException('Access denied');
    const row = this.fileRepo.create({
      payrollInputId: input.id,
      docType: dto?.docType ?? null,
      fileName: file.originalname,
      filePath: file.path,
      fileType: file.mimetype,
      fileSize: String(file.size),
      uploadedByUserId: user.id,
    });
    return this.fileRepo.save(row);
  }

  async clientListPayrollInputFiles(user: ReqUser, payrollInputId: string) {
    await this.ensureClientPayrollAccess(user);
    const input = await this.inputRepo.findOne({
      where: { id: payrollInputId },
    });
    if (!input) throw new BadRequestException('Payroll input not found');
    if (input.clientId !== user.clientId)
      throw new ForbiddenException('Access denied');
    const files = await this.fileRepo.find({
      where: { payrollInputId: input.id },
      order: { createdAt: 'DESC' },
    });
    return files.map((f) => ({
      id: f.id,
      payrollInputId: f.payrollInputId,
      docType: f.docType ?? null,
      fileName: f.fileName,
      fileType: f.fileType ?? null,
      fileSize: f.fileSize ?? null,
      createdAt: f.createdAt,
      uploadedByUserId: f.uploadedByUserId ?? null,
      downloadUrl: `/api/client/payroll/inputs/files/${f.id}/download`,
    }));
  }

  async payrollListPayrollInputs(user: ReqUser, q: Record<string, any>) {
    if (!user?.id) throw new BadRequestException('Invalid user');
    if (
      user?.roleCode !== 'PAYROLL' &&
      user?.roleCode !== 'ADMIN' &&
      user?.roleCode !== 'CRM'
    ) {
      throw new ForbiddenException('Only payroll/admin/CRM allowed');
    }
    let clientIds: string[] = [];
    if (user.roleCode === 'ADMIN' || user.roleCode === 'CRM') {
      if (q?.clientId) {
        clientIds = [q.clientId];
      } else {
        const rows = await this.clientRepo
          .createQueryBuilder('c')
          .select('c.id', 'id')
          .where('c.is_deleted = false')
          .getRawMany<{ id: string }>();
        clientIds = rows.map((r) => r.id);
      }
    } else {
      const rows = await this.assignRepo
        .createQueryBuilder('a')
        .select('a.client_id', 'clientId')
        .where('a.payroll_user_id = :uid', { uid: user.id })
        .andWhere('a.status = :s', { s: 'ACTIVE' })
        .andWhere('a.end_date IS NULL')
        .getRawMany<{ clientId: string }>();
      clientIds = rows.map((r) => r.clientId);
      if (q?.clientId) {
        if (!clientIds.includes(q.clientId))
          throw new ForbiddenException('Not assigned to this client');
        clientIds = [q.clientId];
      }
    }
    if (!clientIds.length) return [];
    const qb = this.inputRepo
      .createQueryBuilder('p')
      .where('p.client_id IN (:...ids)', { ids: clientIds })
      .orderBy('p.created_at', 'DESC');
    if (q?.branchId) qb.andWhere('p.branch_id = :bid', { bid: q.branchId });
    if (q?.periodYear)
      qb.andWhere('p.period_year = :y', { y: Number(q.periodYear) });
    if (q?.periodMonth)
      qb.andWhere('p.period_month = :m', { m: Number(q.periodMonth) });
    if (q?.status) qb.andWhere('p.status = :s', { s: q.status });
    const rows = await qb.getMany();
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);
    const counts = await this.fileRepo
      .createQueryBuilder('f')
      .select('f.payroll_input_id', 'payrollInputId')
      .addSelect('COUNT(1)', 'cnt')
      .where('f.payroll_input_id IN (:...ids)', { ids })
      .groupBy('f.payroll_input_id')
      .getRawMany<{ payrollInputId: string; cnt: string }>();
    const mapCnt = new Map<string, number>();
    for (const c of counts) mapCnt.set(c.payrollInputId, Number(c.cnt || 0));
    return rows.map((p) => ({
      id: p.id,
      clientId: p.clientId,
      branchId: p.branchId ?? null,
      periodYear: p.periodYear,
      periodMonth: p.periodMonth,
      title: p.title,
      status: p.status,
      createdAt: p.createdAt,
      filesCount: mapCnt.get(p.id) ?? 0,
      filesUrl: `/api/payroll/inputs/${p.id}/files`,
    }));
  }

  private async getActiveTemplateForClient(clientId: string) {
    const today = new Date();
    const row = await this.clientTemplateRepo
      .createQueryBuilder('ct')
      .leftJoinAndSelect('ct.template', 'tpl')
      .where('ct.client_id = :cid', { cid: clientId })
      .andWhere('ct.effective_from <= :today', { today })
      .andWhere('(ct.effective_to IS NULL OR ct.effective_to >= :today)', {
        today,
      })
      .orderBy('ct.effective_from', 'DESC')
      .getOne();
    return row ?? null;
  }

  async payrollUploadClientTemplate(
    user: ReqUser,
    clientId: string,
    file: Express.Multer.File,
    dto: { effectiveFrom?: string; effectiveTo?: string },
  ) {
    await this.scope.assertPayrollAccessToClient(user, clientId);

    const template = this.templateRepo.create({
      name: file.originalname,
      version: 1,
      is_active: true,
      fileName: file.originalname,
      filePath: file.path.replace(/\\/g, '/'),
      fileType: file.mimetype || null,
    });
    const savedTpl = await this.templateRepo.save(template);

    const effectiveFrom = dto?.effectiveFrom
      ? new Date(dto.effectiveFrom)
      : new Date();
    const effectiveTo = dto?.effectiveTo ? new Date(dto.effectiveTo) : null;

    const link = this.clientTemplateRepo.create({
      client_id: clientId,
      template: savedTpl,
      effective_from: effectiveFrom,
      ...(effectiveTo ? { effective_to: effectiveTo } : {}),
    });
    const savedLink = await this.clientTemplateRepo.save(link);

    return {
      templateId: savedTpl.id,
      clientTemplateId: savedLink.id,
      effectiveFrom: savedLink.effective_from,
      effectiveTo: savedLink.effective_to,
      downloadUrl: `/api/v1/payroll/clients/${clientId}/template/download`,
    };
  }

  async payrollGetClientTemplateMeta(user: ReqUser, clientId: string) {
    await this.scope.assertPayrollAccessToClient(user, clientId);
    const active = await this.getActiveTemplateForClient(clientId);
    if (!active) return { hasTemplate: false };
    return {
      hasTemplate: true,
      templateId: active.template.id,
      clientTemplateId: active.id,
      fileName: active.template.fileName,
      fileType: active.template.fileType,
      effectiveFrom: active.effective_from,
      effectiveTo: active.effective_to ?? null,
      downloadUrl: `/api/v1/payroll/clients/${clientId}/template/download`,
    };
  }

  async payrollDownloadClientTemplate(user: ReqUser, clientId: string) {
    await this.scope.assertPayrollAccessToClient(user, clientId);
    const active = await this.getActiveTemplateForClient(clientId);
    if (!active)
      throw new BadRequestException('No template configured for client');
    if (!fs.existsSync(active.template.filePath)) {
      throw new BadRequestException('Template file missing on server');
    }
    const buffer = fs.readFileSync(active.template.filePath);
    return {
      fileName: active.template.fileName,
      fileType: active.template.fileType,
      buffer,
    };
  }

  async clientGetPayrollTemplateMeta(user: ReqUser) {
    this.ensureClientUser(user);
    const active = await this.getActiveTemplateForClient(user.clientId!);
    if (!active) return { hasTemplate: false };
    return {
      hasTemplate: true,
      templateId: active.template.id,
      fileName: active.template.fileName,
      fileType: active.template.fileType,
      effectiveFrom: active.effective_from,
      effectiveTo: active.effective_to ?? null,
      downloadUrl: `/api/v1/client/payroll/template/download`,
    };
  }

  async clientDownloadPayrollTemplate(user: ReqUser) {
    this.ensureClientUser(user);
    const active = await this.getActiveTemplateForClient(user.clientId!);
    if (!active)
      throw new BadRequestException('No template configured for your client');
    if (!fs.existsSync(active.template.filePath)) {
      throw new BadRequestException('Template file missing on server');
    }
    const buffer = fs.readFileSync(active.template.filePath);
    return {
      fileName: active.template.fileName,
      fileType: active.template.fileType,
      buffer,
    };
  }

  async updatePayrollInputStatus(
    user: ReqUser,
    payrollInputId: string,
    dto: UpdatePayrollInputStatusDto,
  ) {
    if (!dto?.status) throw new BadRequestException('status is required');
    const input = await this.inputRepo.findOne({
      where: { id: payrollInputId },
    });
    if (!input) throw new BadRequestException('Payroll input not found');
    await this.scope.assertPayrollAccessToClient(user, input.clientId, {
      allowReadOnly: true,
    });
    const fromStatus =
      (input.status as PayrollInputStatus) || PayrollInputStatus.SUBMITTED;
    const toStatus = dto.status;
    if (fromStatus === PayrollInputStatus.CANCELLED) {
      throw new BadRequestException('Cannot process a cancelled payroll input');
    }
    if (fromStatus === PayrollInputStatus.COMPLETED) {
      throw new BadRequestException('Cannot change status after completion');
    }
    // Validate transition
    const allowed = PAYROLL_INPUT_STATUS_TRANSITIONS[fromStatus] || [];
    if (!allowed.includes(toStatus)) {
      throw new BadRequestException(
        `Invalid status transition from ${fromStatus} to ${toStatus}`,
      );
    }
    input.status = toStatus;
    const saved = await this.inputRepo.save(input);
    // Record audit trail
    const audit = this.statusHistoryRepo.create({
      payrollInputId: input.id,
      fromStatus,
      toStatus,
      changedByUserId: user.id,
      remarks: dto.remarks ?? null,
    });
    await this.statusHistoryRepo.save(audit);
    // Notify client based on decision
    const subjectBase =
      `${input.title} ${this.ymLabel(input.periodYear, input.periodMonth)}`.trim();
    if (toStatus === PayrollInputStatus.NEEDS_CLARIFICATION) {
      const subject = `Payroll input needs clarification: ${subjectBase}`;
      const message = dto.remarks?.trim()
        ? `Payroll team requested clarification.\n\nRemarks: ${dto.remarks.trim()}`
        : `Payroll team requested clarification for this payroll input. Please review and re-submit.`;
      await this.notificationsSvc.createTicket(user.id, 'CLIENT', {
        queryType: 'GENERAL',
        subject,
        message,
        clientId: input.clientId,
        branchId: input.branchId ?? undefined,
      });
    }
    if (toStatus === PayrollInputStatus.REJECTED) {
      const subject = `Payroll input rejected: ${subjectBase}`;
      const message = dto.remarks?.trim()
        ? `Payroll team rejected this payroll input.\n\nRemarks: ${dto.remarks.trim()}`
        : `Payroll team rejected this payroll input. Please review and re-submit.`;
      await this.notificationsSvc.createTicket(user.id, 'CLIENT', {
        queryType: 'GENERAL',
        subject,
        message,
        clientId: input.clientId,
        branchId: input.branchId ?? undefined,
      });
    }
    if (toStatus === PayrollInputStatus.APPROVED) {
      const subject = `Payroll input approved: ${subjectBase}`;
      const message = dto.remarks?.trim()
        ? `Payroll team approved this payroll input.\n\nNotes: ${dto.remarks.trim()}`
        : `Payroll team approved this payroll input.`;
      await this.notificationsSvc.createTicket(user.id, 'CLIENT', {
        queryType: 'GENERAL',
        subject,
        message,
        clientId: input.clientId,
        branchId: input.branchId ?? undefined,
      });
    }
    return saved;
  }

  async listPayrollInputFilesForPayroll(user: ReqUser, payrollInputId: string) {
    const input = await this.inputRepo.findOne({
      where: { id: payrollInputId },
    });
    if (!input) throw new BadRequestException('Payroll input not found');
    await this.scope.assertPayrollAccessToClient(user, input.clientId);
    const files = await this.fileRepo.find({
      where: { payrollInputId: input.id },
      order: { createdAt: 'DESC' },
    });
    return files.map((f) => ({
      id: f.id,
      payrollInputId: f.payrollInputId,
      docType: f.docType ?? null,
      fileName: f.fileName,
      fileType: f.fileType ?? null,
      fileSize: f.fileSize ?? null,
      createdAt: f.createdAt,
      uploadedByUserId: f.uploadedByUserId ?? null,
      downloadUrl: `/api/payroll/inputs/files/${f.id}/download`,
    }));
  }

  async downloadPayrollInputFileForClient(user: ReqUser, fileId: string) {
    await this.ensureClientPayrollAccess(user);
    const file = await this.fileRepo.findOne({ where: { id: fileId } });
    if (!file) throw new BadRequestException('Payroll input file not found');
    const input = await this.inputRepo.findOne({
      where: { id: file.payrollInputId },
    });
    if (!input) throw new BadRequestException('Payroll input not found');
    if (input.clientId !== user.clientId)
      throw new ForbiddenException('Access denied');
    const buffer = fs.readFileSync(file.filePath);
    return { fileName: file.fileName, fileType: file.fileType, buffer };
  }

  async downloadPayrollInputFileForPayroll(user: ReqUser, fileId: string) {
    if (!user?.id) throw new BadRequestException('Invalid user');
    const file = await this.fileRepo.findOne({ where: { id: fileId } });
    if (!file) throw new BadRequestException('Payroll input file not found');
    const input = await this.inputRepo.findOne({
      where: { id: file.payrollInputId },
    });
    if (!input) throw new BadRequestException('Payroll input not found');
    await this.scope.assertPayrollAccessToClient(user, input.clientId, {
      allowReadOnly: true,
    });
    const buffer = fs.readFileSync(file.filePath);
    return { fileName: file.fileName, fileType: file.fileType, buffer };
  }

  async listTemplates() {
    const items = await this.templateRepo.find({
      order: { name: 'ASC' },
      relations: ['components'],
    });
    return { items, total: items.length };
  }
}
