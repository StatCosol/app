import * as fs from 'fs';
import * as path from 'path';
import archiver from 'archiver';
import {
  Injectable,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { Request } from 'express';
import { Multer } from 'multer';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as ExcelJS from 'exceljs';
import { PayrollClientAssignmentEntity } from './entities/payroll-client-assignment.entity';
import { PayrollInputEntity } from './entities/payroll-input.entity';
import { PayrollInputFileEntity } from './entities/payroll-input-file.entity';
import { RegistersRecordEntity } from './entities/registers-record.entity';
import { PayrollPayslipArchiveEntity } from './entities/payroll-payslip-archive.entity';
import { PayrollRunEmployeeEntity } from './entities/payroll-run-employee.entity';
import { PayrollRunEntity } from './entities/payroll-run.entity';
import { ClientEntity } from '../clients/entities/client.entity';
import { PayrollInputStatusHistoryEntity } from './entities/payroll-input-status-history.entity';
import { PayrollComponentMasterEntity } from './entities/payroll-component-master.entity';
import { PayrollClientComponentOverrideEntity } from './entities/payroll-client-component-override.entity';
import { NotificationsService } from '../notifications/notifications.service';
import {
  PayrollInputStatus,
  PAYROLL_INPUT_STATUS_TRANSITIONS,
} from './constants/payroll-input-status';
import { SaveClientPayslipLayoutDto } from './dto/save-client-payslip-layout.dto';
import { UpdatePayrollInputStatusDto } from './dto/update-payroll-input-status.dto';
import { ClientUpdatePayrollInputStatusDto } from './dto/client-update-payroll-input-status.dto';
import { generatePayslipPdfBuffer } from './utils/payslip-pdf';
import { IsNull } from 'typeorm';
import { PayrollClientPayslipLayoutEntity } from './entities/payroll-client-payslip-layout.entity';
import { PayrollTemplate } from './entities/payroll-template.entity';
import { PayrollTemplateComponent } from './entities/payroll-template-component.entity';
import { PayrollClientTemplate } from './entities/payroll-client-template.entity';

@Injectable()
export class PayrollService {
  constructor(
    @InjectRepository(PayrollInputEntity)
    private readonly inputRepo: Repository<PayrollInputEntity>,
    @InjectRepository(PayrollInputFileEntity)
    private readonly fileRepo: Repository<PayrollInputFileEntity>,
    @InjectRepository(PayrollClientAssignmentEntity)
    private readonly assignRepo: Repository<PayrollClientAssignmentEntity>,
    @InjectRepository(RegistersRecordEntity)
    private readonly rrRepo: Repository<RegistersRecordEntity>,
    @InjectRepository(PayrollRunEntity)
    private readonly runRepo: Repository<PayrollRunEntity>,
    @InjectRepository(PayrollRunEmployeeEntity)
    private readonly runEmployeeRepo: Repository<PayrollRunEmployeeEntity>,
    @InjectRepository(PayrollPayslipArchiveEntity)
    private readonly payslipArchiveRepo: Repository<PayrollPayslipArchiveEntity>,
    @InjectRepository(PayrollComponentMasterEntity)
    private readonly compRepo: Repository<PayrollComponentMasterEntity>,
    @InjectRepository(PayrollClientComponentOverrideEntity)
    private readonly overrideRepo: Repository<PayrollClientComponentOverrideEntity>,
    @InjectRepository(PayrollInputStatusHistoryEntity)
    private readonly statusHistoryRepo: Repository<PayrollInputStatusHistoryEntity>,
    @InjectRepository(ClientEntity)
    private readonly clientRepo: Repository<ClientEntity>,
    @InjectRepository(PayrollClientPayslipLayoutEntity)
    private readonly layoutRepo: Repository<PayrollClientPayslipLayoutEntity>,
    @InjectRepository(PayrollTemplate)
    private readonly templateRepo: Repository<PayrollTemplate>,
    @InjectRepository(PayrollTemplateComponent)
    private readonly templateCompRepo: Repository<PayrollTemplateComponent>,
    @InjectRepository(PayrollClientTemplate)
    private readonly clientTemplateRepo: Repository<PayrollClientTemplate>,
    private readonly notificationsSvc: NotificationsService,
  ) {}

  ymLabel(year: number, month: number) {
    if (!year || !month) return '';
    return `${year}-${String(month).padStart(2, '0')}`;
  }

  private normalizeHeader(value: any): string {
    if (value === null || value === undefined) return '';
    const raw = String(value).replace(/\s+/g, ' ').trim().toLowerCase();
    return raw.replace(/[^a-z0-9 ]/g, '').trim();
  }

  private cellValue(value: any): any {
    if (value && typeof value === 'object') {
      if ('result' in value) return value.result;
      if ('text' in value) return value.text;
    }
    return value;
  }

  private numberFromCell(value: any): number | null {
    const v = this.cellValue(value);
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  // ...existing code...
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
    user: any,
    payrollInputId: string,
    dto: ClientUpdatePayrollInputStatusDto,
  ) {
    this.ensureClientUser(user);
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
    (input as any).statusUpdatedAt = new Date();
    (input as any).statusUpdatedByUserId = user.id;
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

  async clientGetPayrollInputStatusHistory(user: any, payrollInputId: string) {
    this.ensureClientUser(user);
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

  private ensureClientUser(user: any) {
    const isClient = !!user?.id && user?.roleCode === 'CLIENT' && !!user?.clientId;
    const isBranchUser = user?.userType === 'BRANCH';

    if (!isClient || isBranchUser) {
      throw new BadRequestException('Only client master users can access payroll');
    }
  }

  private async assertPayrollAccessToClient(
    payrollUser: any,
    clientId: string,
    opts?: { allowReadOnly?: boolean },
  ) {
    if (!payrollUser?.id) throw new BadRequestException('Invalid user');

    // Admins always allowed
    if (payrollUser?.roleCode === 'ADMIN') return;

    // CRM read-only allowance when explicitly permitted by caller
    if (opts?.allowReadOnly && payrollUser?.roleCode === 'CRM') {
      return;
    }

    // Payroll users must be assigned to the client
    if (payrollUser?.roleCode === 'PAYROLL') {
      const ok = await this.assignRepo.exist({
        where: {
          clientId,
          payrollUserId: payrollUser.id,
          status: 'ACTIVE',
          endDate: IsNull(),
        },
      });
      if (!ok) {
        throw new ForbiddenException('Payroll user not assigned to this client');
      }
      return;
    }

    throw new ForbiddenException('Only payroll/admin allowed');
  }

  async getAssignedClients(user: any) {
    if (!user?.id) throw new BadRequestException('Invalid user');
    if (
      user?.roleCode !== 'PAYROLL' &&
      user?.roleCode !== 'ADMIN' &&
      user?.roleCode !== 'CRM'
    ) {
      throw new ForbiddenException('Only payroll/admin/CRM allowed');
    }
    if (user.roleCode === 'ADMIN' || user.roleCode === 'CRM') {
      return this.clientRepo
        .createQueryBuilder('c')
        .select([
          'c.id AS id',
          'c.client_name AS "clientName"',
          'c.client_code AS "clientCode"',
        ])
        .where('c.is_deleted = false')
        .orderBy('c.client_name', 'ASC')
        .getRawMany();
    }
    return this.assignRepo
      .createQueryBuilder('a')
      .innerJoin(ClientEntity, 'c', 'c.id = a.client_id')
      .select('c.id', 'id')
      .addSelect('c.client_name', 'clientName')
      .addSelect('c.client_code', 'clientCode')
      .where('a.payroll_user_id = :uid', { uid: user.id })
      .andWhere('a.status = :s', { s: 'ACTIVE' })
      .andWhere('a.end_date IS NULL')
      .andWhere('c.is_deleted = false')
      .orderBy('c.client_name', 'ASC')
      .getRawMany();
  }

  async clientCreatePayrollInput(user: any, dto: any) {
    this.ensureClientUser(user);
    if (!dto?.title || !dto?.periodYear || !dto?.periodMonth) {
      throw new BadRequestException(
        'title, periodYear, periodMonth are required',
      );
    }
    if (dto.periodMonth < 1 || dto.periodMonth > 12) {
      throw new BadRequestException('periodMonth must be 1..12');
    }
    const row = this.inputRepo.create({
      clientId: user.clientId,
      branchId: dto.branchId ?? null,
      periodYear: Number(dto.periodYear),
      periodMonth: Number(dto.periodMonth),
      title: dto.title.trim(),
      notes: dto.notes ?? null,
      status: PayrollInputStatus.DRAFT,
      submittedByUserId: user.id,
    });
    return this.inputRepo.save(row);
  }

  async clientListPayrollInputs(user: any, q: any) {
    this.ensureClientUser(user);
    const qb = this.inputRepo
      .createQueryBuilder('p')
      .where('p.client_id = :cid', { cid: user.clientId })
      .orderBy('p.created_at', 'DESC');
    if (q?.branchId) qb.andWhere('p.branch_id = :bid', { bid: q.branchId });
    if (q?.periodYear)
      qb.andWhere('p.period_year = :y', { y: Number(q.periodYear) });
    if (q?.periodMonth)
      qb.andWhere('p.period_month = :m', { m: Number(q.periodMonth) });
    if (q?.status) qb.andWhere('p.status = :s', { s: q.status });
    const rows = await qb.getMany();
    if (!rows.length) return [];
    const ids = rows.map((r: any) => r.id);
    const counts = await this.fileRepo
      .createQueryBuilder('f')
      .select('f.payroll_input_id', 'payrollInputId')
      .addSelect('COUNT(1)', 'cnt')
      .where('f.payroll_input_id IN (:...ids)', { ids })
      .groupBy('f.payroll_input_id')
      .getRawMany<{ payrollInputId: string; cnt: string }>();
    const mapCnt = new Map<string, number>();
    for (const c of counts) mapCnt.set(c.payrollInputId, Number(c.cnt || 0));
    return rows.map((p: any) => ({
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
    user: any,
    payrollInputId: string,
    dto: any,
    file: any,
  ) {
    this.ensureClientUser(user);
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

  async clientListPayrollInputFiles(user: any, payrollInputId: string) {
    this.ensureClientUser(user);
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
    return files.map((f: any) => ({
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

  async payrollListPayrollInputs(user: any, q: any) {
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
    const ids = rows.map((r: any) => r.id);
    const counts = await this.fileRepo
      .createQueryBuilder('f')
      .select('f.payroll_input_id', 'payrollInputId')
      .addSelect('COUNT(1)', 'cnt')
      .where('f.payroll_input_id IN (:...ids)', { ids })
      .groupBy('f.payroll_input_id')
      .getRawMany<{ payrollInputId: string; cnt: string }>();
    const mapCnt = new Map<string, number>();
    for (const c of counts) mapCnt.set(c.payrollInputId, Number(c.cnt || 0));
    return rows.map((p: any) => ({
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

  // ---------- Payroll Templates (per client) ----------
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
    user: any,
    clientId: string,
    file: any,
    dto: { effectiveFrom?: string; effectiveTo?: string },
  ) {
    await this.assertPayrollAccessToClient(user, clientId);

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
      downloadUrl: `/api/payroll/clients/${clientId}/template/download`,
    };
  }

  async payrollGetClientTemplateMeta(user: any, clientId: string) {
    await this.assertPayrollAccessToClient(user, clientId);
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
      downloadUrl: `/api/payroll/clients/${clientId}/template/download`,
    };
  }

  async payrollDownloadClientTemplate(user: any, clientId: string) {
    await this.assertPayrollAccessToClient(user, clientId);
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

  async clientGetPayrollTemplateMeta(user: any) {
    this.ensureClientUser(user);
    const active = await this.getActiveTemplateForClient(user.clientId);
    if (!active) return { hasTemplate: false };
    return {
      hasTemplate: true,
      templateId: active.template.id,
      fileName: active.template.fileName,
      fileType: active.template.fileType,
      effectiveFrom: active.effective_from,
      effectiveTo: active.effective_to ?? null,
      downloadUrl: `/api/client/payroll/template/download`,
    };
  }

  async clientDownloadPayrollTemplate(user: any) {
    this.ensureClientUser(user);
    const active = await this.getActiveTemplateForClient(user.clientId);
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
    user: any,
    payrollInputId: string,
    dto: UpdatePayrollInputStatusDto,
  ) {
    if (!dto?.status) throw new BadRequestException('status is required');
    const input = await this.inputRepo.findOne({
      where: { id: payrollInputId },
    });
    if (!input) throw new BadRequestException('Payroll input not found');
    await this.assertPayrollAccessToClient(user, input.clientId, {
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

  async listPayrollInputFilesForPayroll(user: any, payrollInputId: string) {
    const input = await this.inputRepo.findOne({
      where: { id: payrollInputId },
    });
    if (!input) throw new BadRequestException('Payroll input not found');
    await this.assertPayrollAccessToClient(user, input.clientId);
    const files = await this.fileRepo.find({
      where: { payrollInputId: input.id },
      order: { createdAt: 'DESC' },
    });
    return files.map((f: any) => ({
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

  async downloadPayrollInputFileForClient(user: any, fileId: string) {
    this.ensureClientUser(user);
    const file = await this.fileRepo.findOne({ where: { id: fileId } as any });
    if (!file) throw new BadRequestException('Payroll input file not found');
    const input = await this.inputRepo.findOne({
      where: { id: file.payrollInputId } as any,
    });
    if (!input) throw new BadRequestException('Payroll input not found');
    if (input.clientId !== user.clientId)
      throw new ForbiddenException('Access denied');
    const buffer = fs.readFileSync(file.filePath);
    return { fileName: file.fileName, fileType: file.fileType, buffer };
  }

  async downloadPayrollInputFileForPayroll(user: any, fileId: string) {
    if (!user?.id) throw new BadRequestException('Invalid user');
    const file = await this.fileRepo.findOne({ where: { id: fileId } as any });
    if (!file) throw new BadRequestException('Payroll input file not found');
    const input = await this.inputRepo.findOne({
      where: { id: file.payrollInputId } as any,
    });
    if (!input) throw new BadRequestException('Payroll input not found');
    await this.assertPayrollAccessToClient(user, input.clientId, {
      allowReadOnly: true,
    });
    const buffer = fs.readFileSync(file.filePath);
    return { fileName: file.fileName, fileType: file.fileType, buffer };
  }

  async createPayrollRun(user: any, dto: any) {
    if (!user?.id) throw new BadRequestException('Invalid user');
    if (user?.roleCode !== 'PAYROLL' && user?.roleCode !== 'ADMIN') {
      throw new ForbiddenException('Only payroll/admin allowed');
    }
    if (!dto?.clientId || !dto?.periodYear || !dto?.periodMonth) {
      throw new BadRequestException(
        'clientId, periodYear, periodMonth are required',
      );
    }
    const periodMonth = Number(dto.periodMonth);
    if (periodMonth < 1 || periodMonth > 12) {
      throw new BadRequestException('periodMonth must be 1..12');
    }
    await this.assertPayrollAccessToClient(user, dto.clientId);

    const existing = await this.runRepo.findOne({
      where: {
        clientId: dto.clientId,
        periodYear: Number(dto.periodYear),
        periodMonth: periodMonth,
      } as any,
    });
    if (existing) {
      throw new BadRequestException(
        'Payroll run already exists for this client and period',
      );
    }

    let title = dto?.title?.trim() || null;
    if (dto?.sourcePayrollInputId) {
      const input = await this.inputRepo.findOne({
        where: { id: dto.sourcePayrollInputId } as any,
      });
      if (!input)
        throw new BadRequestException('Source payroll input not found');
      if (input.clientId !== dto.clientId)
        throw new BadRequestException('Source input client mismatch');
      if (!title) title = input.title;
    }

    const row = this.runRepo.create({
      clientId: dto.clientId,
      branchId: dto.branchId ?? null,
      periodYear: Number(dto.periodYear),
      periodMonth: periodMonth,
      status: 'DRAFT',
      sourcePayrollInputId: dto.sourcePayrollInputId ?? null,
      title,
    });
    return this.runRepo.save(row);
  }

  async uploadPayrollRunEmployees(user: any, runId: string, file: any) {
    if (!user?.id) throw new BadRequestException('Invalid user');
    if (user?.roleCode !== 'PAYROLL' && user?.roleCode !== 'ADMIN') {
      throw new ForbiddenException('Only payroll/admin allowed');
    }
    if (!file) throw new BadRequestException('File is required');

    const run = await this.runRepo.findOne({ where: { id: runId } as any });
    if (!run) throw new BadRequestException('Payroll run not found');
    await this.assertPayrollAccessToClient(user, run.clientId);

    const wb = new ExcelJS.Workbook();
    const nameLower = String(file?.originalname || '').toLowerCase();
    if (file?.mimetype === 'text/csv' || nameLower.endsWith('.csv')) {
      await wb.csv.readFile(file.path);
    } else {
      await wb.xlsx.readFile(file.path);
    }
    const ws = wb.worksheets[0];
    if (!ws) throw new BadRequestException('Worksheet not found');

    const headerRow = ws.getRow(1);
    const headerMap = new Map<string, number>();
    headerRow.eachCell((cell, col) => {
      const name = this.normalizeHeader(this.cellValue(cell.value));
      if (name) headerMap.set(name, col);
    });

    const findCol = (names: string[]) => {
      for (const n of names) {
        const idx = headerMap.get(this.normalizeHeader(n));
        if (idx) return idx;
      }
      return null;
    };

    const colEmployeeCode = findCol([
      'employee code',
      'employee id',
      'emp code',
      's no',
      'sno',
      'sno.',
    ]);
    const colEmployeeName = findCol(['name', 'employee name']);
    const colDesignation = findCol(['designation']);
    const colUan = findCol(['uan']);
    const colEsic = findCol(['esic', 'esi', 'esic no', 'esi no']);
    const colGross = findCol(['gross']);
    const colTotalDed = findCol(['total deduction', 'total deductions']);
    const colNetPay = findCol(['net salary', 'net pay', 'net']);
    const colEmployerCost = findCol(['monthly ctc', 'ctc', 'employer cost']);

    if (!colEmployeeName)
      throw new BadRequestException('Required column not found: Name');

    const rows: Partial<PayrollRunEmployeeEntity>[] = [];
    const lastRow = ws.actualRowCount || ws.rowCount || 1;

    for (let i = 2; i <= lastRow; i++) {
      const row = ws.getRow(i);
      const nameVal = colEmployeeName
        ? this.cellValue(row.getCell(colEmployeeName).value)
        : null;
      const employeeName = nameVal ? String(nameVal).trim() : '';
      if (!employeeName) continue;

      const codeVal = colEmployeeCode
        ? this.cellValue(row.getCell(colEmployeeCode).value)
        : null;
      const employeeCode = codeVal ? String(codeVal).trim() : String(i - 1);

      const designationVal = colDesignation
        ? this.cellValue(row.getCell(colDesignation).value)
        : null;
      const uanVal = colUan ? this.cellValue(row.getCell(colUan).value) : null;
      const esicVal = colEsic
        ? this.cellValue(row.getCell(colEsic).value)
        : null;

      const gross = colGross
        ? this.numberFromCell(row.getCell(colGross).value)
        : null;
      const totalDed = colTotalDed
        ? this.numberFromCell(row.getCell(colTotalDed).value)
        : null;
      const netPay = colNetPay
        ? this.numberFromCell(row.getCell(colNetPay).value)
        : null;
      const employerCost = colEmployerCost
        ? this.numberFromCell(row.getCell(colEmployerCost).value)
        : null;

      rows.push({
        runId: run.id,
        clientId: run.clientId,
        branchId: run.branchId ?? null,
        employeeCode,
        employeeName,
        designation: designationVal ? String(designationVal).trim() : null,
        uan: uanVal ? String(uanVal).trim() : null,
        esic: esicVal ? String(esicVal).trim() : null,
        grossEarnings: String(gross ?? 0),
        totalDeductions: String(totalDed ?? 0),
        netPay: String(netPay ?? 0),
        employerCost: String(employerCost ?? 0),
      });
    }

    if (!rows.length) throw new BadRequestException('No employee rows found');

    await this.runEmployeeRepo.upsert(rows as PayrollRunEmployeeEntity[], [
      'runId',
      'employeeCode',
    ]);
    if (run.status === 'DRAFT') {
      run.status = 'IN_PROGRESS';
      await this.runRepo.save(run);
    }

    return { ok: true, runId: run.id, employees: rows.length };
  }

  async clientListRegistersRecords(user: any, q: any) {
    this.ensureClientUser(user);
    const qb = this.rrRepo
      .createQueryBuilder('r')
      .where('r.client_id = :cid', { cid: user.clientId })
      .orderBy('r.created_at', 'DESC');
    if (q?.branchId) qb.andWhere('r.branch_id = :b', { b: q.branchId });
    if (q?.category) qb.andWhere('r.category = :cat', { cat: q.category });
    if (q?.periodYear)
      qb.andWhere('r.period_year = :y', { y: Number(q.periodYear) });
    if (q?.periodMonth)
      qb.andWhere('r.period_month = :m', { m: Number(q.periodMonth) });
    const rows = await qb.getMany();
    return rows.map((r: any) => ({
      id: r.id,
      clientId: r.clientId,
      branchId: r.branchId ?? null,
      payrollInputId: r.payrollInputId ?? null,
      category: r.category,
      title: r.title,
      periodYear: r.periodYear ?? null,
      periodMonth: r.periodMonth ?? null,
      fileName: r.fileName ?? null,
      fileType: r.fileType ?? null,
      fileSize: r.fileSize ?? null,
      createdAt: r.createdAt,
      preparedByUserId: r.preparedByUserId ?? null,
      downloadUrl: `/api/client/payroll/registers-records/${r.id}/download`,
    }));
  }

  async clientUploadRegisterRecord(user: any, dto: any, file: any) {
    this.ensureClientUser(user);
    if (!file) throw new BadRequestException('File is required');
    if (!dto?.category || !dto?.title) {
      throw new BadRequestException('category and title are required');
    }
    const row = this.rrRepo.create({
      clientId: user.clientId,
      branchId: dto.branchId ?? null,
      payrollInputId: dto.payrollInputId ?? null,
      category: dto.category,
      title: dto.title,
      periodYear: dto.periodYear ?? null,
      periodMonth: dto.periodMonth ?? null,
      preparedByUserId: user.id,
      fileName: file.originalname,
      filePath: file.path,
      fileType: file.mimetype,
      fileSize: String(file.size),
    });
    return this.rrRepo.save(row);
  }

  async payrollListRegistersRecords(user: any, q: any) {
    if (!user?.id) throw new BadRequestException('Invalid user');
    if (
      user.roleCode !== 'PAYROLL' &&
      user.roleCode !== 'ADMIN' &&
      user.roleCode !== 'CRM'
    ) {
      throw new ForbiddenException('Only payroll/admin/CRM allowed');
    }
    let ids: string[] = [];

    if (user.roleCode === 'ADMIN' || user.roleCode === 'CRM') {
      if (q?.clientId) {
        ids = [q.clientId];
      } else {
        const rows = await this.clientRepo
          .createQueryBuilder('c')
          .select('c.id', 'id')
          .where('c.is_deleted = false')
          .getRawMany<{ id: string }>();
        ids = rows.map((r) => r.id);
      }
    } else {
      const assignedClientIds = await this.assignRepo
        .createQueryBuilder('a')
        .select('a.client_id', 'clientId')
        .where('a.payroll_user_id = :uid', { uid: user.id })
        .andWhere('a.status = :s', { s: 'ACTIVE' })
        .andWhere('a.end_date IS NULL')
        .getRawMany<{ clientId: string }>();

      ids = assignedClientIds.map((r) => r.clientId);
      if (ids.length === 0) return [];

      if (q?.clientId) {
        if (!ids.includes(q.clientId)) {
          throw new ForbiddenException('Not assigned to this client');
        }
        ids = [q.clientId];
      }
    }

    const qb = this.rrRepo
      .createQueryBuilder('r')
      .where('r.client_id IN (:...ids)', { ids });

    if (q?.clientId) qb.andWhere('r.client_id = :c', { c: q.clientId });
    if (q?.branchId) qb.andWhere('r.branch_id = :b', { b: q.branchId });
    if (q?.category) qb.andWhere('r.category = :cat', { cat: q.category });
    if (q?.periodYear)
      qb.andWhere('r.period_year = :y', { y: Number(q.periodYear) });
    if (q?.periodMonth)
      qb.andWhere('r.period_month = :m', { m: Number(q.periodMonth) });

    qb.orderBy('r.created_at', 'DESC');
    const rows = await qb.getMany();
    return rows.map((r: any) => ({
      id: r.id,
      clientId: r.clientId,
      branchId: r.branchId ?? null,
      payrollInputId: r.payrollInputId ?? null,
      category: r.category,
      title: r.title,
      periodYear: r.periodYear ?? null,
      periodMonth: r.periodMonth ?? null,
      fileName: r.fileName ?? null,
      fileType: r.fileType ?? null,
      fileSize: r.fileSize ?? null,
      createdAt: r.createdAt,
      preparedByUserId: r.preparedByUserId ?? null,
      downloadUrl: `/api/payroll/registers-records/${r.id}/download`,
    }));
  }

  async getPayrollSummary(user: any, q: any) {
    if (!user?.id) throw new BadRequestException('Invalid user');
    if (
      user.roleCode !== 'PAYROLL' &&
      user.roleCode !== 'ADMIN' &&
      user.roleCode !== 'CRM'
    ) {
      throw new ForbiddenException('Only payroll/admin/CRM allowed');
    }

    let assignedClients = 0;
    if (user.roleCode === 'ADMIN' || user.roleCode === 'CRM') {
      assignedClients = await this.clientRepo.count({
        where: { is_deleted: false } as any,
      });
    } else {
      assignedClients = await this.assignRepo.count({
        where: { payrollUserId: user.id, status: 'ACTIVE', endDate: IsNull() },
      });
    }

    // Until you build real payroll-run workflow, keep these as 0
    return {
      assignedClients,
      pendingRuns: 0,
      completedThisMonth: 0,
    };
  }

  // Admin Payroll Assignment Methods
  async getPayrollAssignment(clientId: string) {
    const row = await this.assignRepo.findOne({
      where: { clientId, status: 'ACTIVE', endDate: IsNull() },
      order: { startDate: 'DESC' },
    });
    return row ?? null;
  }

  async assignPayrollToClient(args: {
    clientId: string;
    payrollUserId: string;
    actorUserId: string | null;
  }) {
    const { clientId, payrollUserId } = args;

    // Close existing active assignment for this client (optional rule: 1 active payroll per client)
    await this.assignRepo
      .createQueryBuilder()
      .update()
      .set({ endDate: () => 'CURRENT_DATE', status: 'INACTIVE' })
      .where('client_id = :clientId', { clientId })
      .andWhere('status = :s', { s: 'ACTIVE' })
      .andWhere('end_date IS NULL')
      .execute();

    const newRow = this.assignRepo.create({
      clientId,
      payrollUserId,
      status: 'ACTIVE',
      endDate: null,
    });

    return this.assignRepo.save(newRow);
  }

  async unassignPayrollFromClient(args: {
    clientId: string;
    actorUserId: string | null;
  }) {
    const { clientId } = args;

    await this.assignRepo
      .createQueryBuilder()
      .update()
      .set({ endDate: () => 'CURRENT_DATE', status: 'INACTIVE' })
      .where('client_id = :clientId', { clientId })
      .andWhere('status = :s', { s: 'ACTIVE' })
      .andWhere('end_date IS NULL')
      .execute();

    return { ok: true };
  }

  async getClientEffectiveComponents(user: any, clientId: string) {
    if (!user?.id) throw new BadRequestException('Invalid user');
    if (user.roleCode !== 'PAYROLL' && user.roleCode !== 'ADMIN') {
      throw new ForbiddenException('Only payroll/admin allowed');
    }
    if (!clientId) throw new BadRequestException('clientId required');

    await this.assertPayrollAccessToClient(user, clientId);

    const [master, overrides] = await Promise.all([
      this.compRepo.find({
        where: { isActive: true } as any,
        order: { code: 'ASC' } as any,
      }),
      this.overrideRepo.find({ where: { clientId } as any }),
    ]);

    const ovMap = new Map<string, PayrollClientComponentOverrideEntity>();
    for (const o of overrides as any[]) ovMap.set(o.componentId, o);

    const merged = master.map((c: any) => {
      const ov = ovMap.get(c.id);

      const enabled = ov?.enabled ?? true; // default enabled
      const showOnPayslip = ov?.showOnPayslip ?? true;
      const displayOrder = ov?.displayOrder ?? null;

      return {
        componentId: c.id,
        code: c.code,
        name: ov?.labelOverride ?? c.name,
        componentType: c.componentType,
        isTaxable: c.isTaxable,
        affectsPfWage: c.affectsPfWage,
        affectsEsiWage: c.affectsEsiWage,
        enabled,
        showOnPayslip,
        displayOrder,
        formula: ov?.formulaOverride ?? c.defaultFormula ?? null,
      };
    });

    // filter disabled
    const active = merged.filter((x) => x.enabled);

    // order: displayOrder first, then code
    active.sort((a, b) => {
      const ao = a.displayOrder ?? 999999;
      const bo = b.displayOrder ?? 999999;
      if (ao !== bo) return ao - bo;
      return String(a.code).localeCompare(String(b.code));
    });

    return active;
  }

  async saveClientComponentOverrides(user: any, clientId: string, dto: any) {
    if (!user?.id) throw new BadRequestException('Invalid user');
    if (user.roleCode !== 'PAYROLL' && user.roleCode !== 'ADMIN') {
      throw new ForbiddenException('Only payroll/admin allowed');
    }
    if (!clientId) throw new BadRequestException('clientId required');

    await this.assertPayrollAccessToClient(user, clientId);

    const items = dto?.items ?? [];
    if (!Array.isArray(items)) throw new BadRequestException('items required');

    for (const it of items) {
      const existing = await this.overrideRepo.findOne({
        where: { clientId, componentId: it.componentId } as any,
      });

      const patch: any = {
        enabled: it.enabled ?? null,
        displayOrder: it.displayOrder ?? null,
        showOnPayslip: it.showOnPayslip ?? null,
        labelOverride: it.labelOverride?.trim?.() ?? null,
        formulaOverride: it.formulaOverride ?? null,
      };

      if (existing) {
        Object.assign(existing, patch);
        await this.overrideRepo.save(existing);
      } else {
        await this.overrideRepo.save(
          this.overrideRepo.create({
            clientId,
            componentId: it.componentId,
            ...patch,
          }),
        );
      }
    }

    return this.getClientEffectiveComponents(user, clientId);
  }

  async getClientPayslipLayout(user: any, clientId: string) {
    if (!user?.id) throw new BadRequestException('Invalid user');
    if (user.roleCode !== 'PAYROLL' && user.roleCode !== 'ADMIN') {
      throw new ForbiddenException('Only payroll/admin allowed');
    }
    if (!clientId) throw new BadRequestException('clientId required');

    await this.assertPayrollAccessToClient(user, clientId);

    const row = await this.layoutRepo.findOne({
      where: { clientId, isActive: true } as any,
    });
    if (row?.layoutJson) return row.layoutJson;

    // default layout if none stored
    return {
      sections: [
        {
          key: 'EARNINGS',
          title: 'Earnings',
          rows: [],
          totals: [
            { type: 'TOTAL', key: 'GROSS_EARNINGS', label: 'Gross Earnings' },
          ],
        },
        {
          key: 'DEDUCTIONS',
          title: 'Deductions',
          rows: [],
          totals: [
            {
              type: 'TOTAL',
              key: 'TOTAL_DEDUCTIONS',
              label: 'Total Deductions',
            },
          ],
        },
        {
          key: 'SUMMARY',
          title: 'Summary',
          rows: [{ type: 'TOTAL', key: 'NET_PAY', label: 'Net Pay' }],
        },
      ],
      settings: { showRates: false, showUnits: false, currency: 'INR' },
    };
  }

  async saveClientPayslipLayout(
    user: any,
    clientId: string,
    dto: SaveClientPayslipLayoutDto,
  ) {
    if (!user?.id) throw new BadRequestException('Invalid user');
    if (user.roleCode !== 'PAYROLL' && user.roleCode !== 'ADMIN') {
      throw new ForbiddenException('Only payroll/admin allowed');
    }
    if (!clientId) throw new BadRequestException('clientId required');
    if (!dto?.layout) throw new BadRequestException('layout required');

    await this.assertPayrollAccessToClient(user, clientId);

    // Validate: ensure component codes exist for this client
    const effective = await this.getClientEffectiveComponents(user, clientId);
    const codeSet = new Set(effective.map((x: any) => x.code));

    const sections = dto.layout?.sections;
    if (!Array.isArray(sections))
      throw new BadRequestException('layout.sections must be array');

    for (const s of sections) {
      const rows = s?.rows ?? [];
      if (!Array.isArray(rows))
        throw new BadRequestException('section.rows must be array');

      for (const r of rows) {
        if (r?.type === 'COMPONENT') {
          const code = String(r.code || '').trim();
          if (!code)
            throw new BadRequestException('COMPONENT row must have code');
          if (!codeSet.has(code)) {
            throw new BadRequestException(
              `Component code not enabled for client: ${code}`,
            );
          }
        }
      }
    }

    const existing = await this.layoutRepo.findOne({
      where: { clientId } as any,
    });

    if (existing) {
      existing.layoutJson = dto.layout;
      existing.isActive = true;
      await this.layoutRepo.save(existing);
    } else {
      await this.layoutRepo.save(
        this.layoutRepo.create({
          clientId,
          layoutJson: dto.layout,
          isActive: true,
        }),
      );
    }

    return dto.layout;
  }

  /**
   * Download a register/record file for PAYROLL/ADMIN.
   */
  async downloadRegisterForPayroll(user: any, registerId: string) {
    if (!user?.id) throw new BadRequestException('Invalid user');
    const row = await this.rrRepo.findOne({ where: { id: registerId } as any });
    if (!row) throw new BadRequestException('Register not found');
    await this.assertPayrollAccessToClient(user, row.clientId, {
      allowReadOnly: true,
    });
    const buffer = fs.readFileSync(row.filePath);
    return { fileName: row.fileName, fileType: row.fileType, buffer };
  }

  /**
   * Download a register/record file for CLIENT.
   */
  async downloadRegisterForClient(user: any, registerId: string) {
    this.ensureClientUser(user);
    const row = await this.rrRepo.findOne({ where: { id: registerId } as any });
    if (!row) throw new BadRequestException('Register not found');
    if (row.clientId !== user.clientId)
      throw new ForbiddenException('Access denied');
    const buffer = fs.readFileSync(row.filePath);
    return { fileName: row.fileName, fileType: row.fileType, buffer };
  }

  /**
   * List payroll runs for PAYROLL/ADMIN.
   * Matches frontend: GET /api/payroll/runs?clientId&periodYear&periodMonth&status
   */
  async listPayrollRuns(user: any, q: any) {
    if (!user?.id) throw new BadRequestException('Invalid user');

    // Determine allowed clientIds
    let allowedClientIds: string[] = [];
    if (user.roleCode === 'ADMIN' || user.roleCode === 'CRM') {
      const all = await this.clientRepo
        .createQueryBuilder('c')
        .select('c.id', 'id')
        .where('c.is_deleted = false')
        .getRawMany<{ id: string }>();
      allowedClientIds = all.map((r) => r.id);
    } else {
      const assigned = await this.assignRepo
        .createQueryBuilder('a')
        .select('a.client_id', 'clientId')
        .where('a.payroll_user_id = :uid', { uid: user.id })
        .andWhere('a.status = :s', { s: 'ACTIVE' })
        .andWhere('a.end_date IS NULL')
        .getRawMany<{ clientId: string }>();
      allowedClientIds = assigned.map((r) => r.clientId);
    }
    if (!allowedClientIds.length) return [];

    const qb = this.runRepo
      .createQueryBuilder('r')
      .innerJoin(ClientEntity, 'c', 'c.id = r.client_id')
      .select('r.id', 'id')
      .addSelect('r.client_id', 'clientId')
      .addSelect('c.client_name', 'clientName')
      .addSelect('r.period_year', 'periodYear')
      .addSelect('r.period_month', 'periodMonth')
      .addSelect('r.status', 'status')
      .where('r.client_id IN (:...ids)', { ids: allowedClientIds })
      .andWhere('c.is_deleted = false')
      .orderBy('r.created_at', 'DESC');

    if (q?.clientId) qb.andWhere('r.client_id = :cid', { cid: q.clientId });
    if (q?.periodYear)
      qb.andWhere('r.period_year = :y', { y: Number(q.periodYear) });
    if (q?.periodMonth)
      qb.andWhere('r.period_month = :m', { m: Number(q.periodMonth) });
    if (q?.status) qb.andWhere('r.status = :st', { st: q.status });

    const rows = await qb.getRawMany<any>();

    // employeeCount (batched)
    const runIds = rows.map((r: any) => r.id).filter(Boolean);
    let counts: { runId: string; cnt: string }[] = [];
    if (runIds.length) {
      counts = await this.runEmployeeRepo
        .createQueryBuilder('e')
        .select('e.run_id', 'runId')
        .addSelect('COUNT(1)', 'cnt')
        .where('e.run_id IN (:...runIds)', { runIds })
        .groupBy('e.run_id')
        .getRawMany();
    }
    const mapCnt = new Map(counts.map((c) => [c.runId, Number(c.cnt || 0)]));
    return rows.map((r: any) => ({
      id: r.id,
      clientId: r.clientId,
      clientName: r.clientName ?? null,
      periodYear: Number(r.periodYear),
      periodMonth: Number(r.periodMonth),
      status: r.status ?? 'DRAFT',
      employeeCount: mapCnt.get(r.id) ?? 0,
    }));
  }

  /**
   * List employees for a payroll run.
   * NOTE: Frontend uses `employeeId` as a path param later; we return employeeCode there.
   */
  async listPayrollRunEmployees(user: any, runId: string) {
    if (!user?.id) throw new BadRequestException('Invalid user');
    const run = await this.runRepo.findOne({ where: { id: runId } as any });
    if (!run) throw new BadRequestException('Payroll run not found');
    await this.assertPayrollAccessToClient(user, run.clientId, {
      allowReadOnly: true,
    });

    const rows = await this.runEmployeeRepo.find({
      where: { runId } as any,
      order: { employeeName: 'ASC' } as any,
    });
    return rows.map((e) => ({
      employeeId: e.employeeCode, // IMPORTANT for downloads
      empCode: e.employeeCode,
      employeeName: e.employeeName ?? null,
      grossEarnings: Number(e.grossEarnings ?? 0),
      totalDeductions: Number(e.totalDeductions ?? 0),
      netPay: Number(e.netPay ?? 0),
    }));
  }

  /**
   * Generate a very basic payslip PDF (summary-only) from payroll_run_employees.
   * Used by GET /api/payroll/runs/:runId/employees/:employeeId/payslip.pdf
   */
  async generatePayslipPdfForPayroll(
    user: any,
    runId: string,
    employeeId: string,
  ) {
    if (!user?.id) throw new BadRequestException('Invalid user');
    const run = await this.runRepo.findOne({ where: { id: runId } as any });
    if (!run) throw new BadRequestException('Payroll run not found');
    await this.assertPayrollAccessToClient(user, run.clientId, {
      allowReadOnly: true,
    });

    const emp = await this.runEmployeeRepo.findOne({
      where: { runId, employeeCode: employeeId } as any,
    });
    if (!emp) throw new BadRequestException('Employee not found in run');

    const client = await this.clientRepo.findOne({
      where: { id: run.clientId } as any,
    });
    const buffer = await generatePayslipPdfBuffer({
      header: {
        periodYear: run.periodYear,
        periodMonth: run.periodMonth,
        clientName:
          (client as any)?.clientName ??
          (client as any)?.client_name ??
          (client as any)?.name ??
          null,
        employeeName: emp.employeeName,
        empCode: emp.employeeCode,
        designation: emp.designation ?? null,
        uan: emp.uan ?? null,
        esic: emp.esic ?? null,
      },
      payslip: {
        sections: [],
        totals: {
          GROSS_EARNINGS: Number(emp.grossEarnings ?? 0),
          TOTAL_DEDUCTIONS: Number(emp.totalDeductions ?? 0),
          NET_PAY: Number(emp.netPay ?? 0),
          CTC: Number(emp.employerCost ?? 0),
        },
      },
    });

    const fileName = `payslip_${run.periodYear}_${String(run.periodMonth).padStart(2, '0')}_${emp.employeeCode}.pdf`;
    return { fileName, fileType: 'application/pdf', buffer };
  }

  /**
   * Download archived payslip for a payroll run/employeeCode from payroll_payslip_archives.
   */
  async downloadArchivedPayslipForPayroll(
    user: any,
    runId: string,
    employeeId: string,
  ) {
    if (!user?.id) throw new BadRequestException('Invalid user');
    const run = await this.runRepo.findOne({ where: { id: runId } as any });
    if (!run) throw new BadRequestException('Payroll run not found');
    await this.assertPayrollAccessToClient(user, run.clientId, {
      allowReadOnly: true,
    });

    const row = await this.payslipArchiveRepo.findOne({
      where: { runId, employeeCode: employeeId } as any,
    });
    if (!row) throw new BadRequestException('Archived payslip not found');
    const buffer = fs.readFileSync(row.filePath);
    return {
      fileName: row.fileName,
      fileType: row.fileType || 'application/pdf',
      buffer,
    };
  }

  /**
   * Generate and store payslip PDFs into payroll_payslip_archives (idempotent).
   */
  async archiveRunPayslips(user: any, runId: string) {
    if (!user?.id) throw new BadRequestException('Invalid user');
    const run = await this.runRepo.findOne({ where: { id: runId } as any });
    if (!run) throw new BadRequestException('Payroll run not found');
    await this.assertPayrollAccessToClient(user, run.clientId);

    const client = await this.clientRepo.findOne({
      where: { id: run.clientId } as any,
    });
    const employees = await this.runEmployeeRepo.find({
      where: { runId } as any,
    });

    const baseDir = path.join(
      process.cwd(),
      'uploads',
      'payslips-archive',
      runId,
    );
    if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir, { recursive: true });

    let created = 0;
    let updated = 0;

    for (const emp of employees) {
      const fileName = `payslip_${run.periodYear}_${String(run.periodMonth).padStart(2, '0')}_${emp.employeeCode}.pdf`;
      const filePath = path.join(baseDir, fileName);

      const buffer = await generatePayslipPdfBuffer({
        header: {
          periodYear: run.periodYear,
          periodMonth: run.periodMonth,
          clientName:
            (client as any)?.clientName ??
            (client as any)?.client_name ??
            (client as any)?.name ??
            null,
          employeeName: emp.employeeName,
          empCode: emp.employeeCode,
          designation: emp.designation ?? null,
          uan: emp.uan ?? null,
          esic: emp.esic ?? null,
        },
        payslip: {
          sections: [],
          totals: {
            GROSS_EARNINGS: Number(emp.grossEarnings ?? 0),
            TOTAL_DEDUCTIONS: Number(emp.totalDeductions ?? 0),
            NET_PAY: Number(emp.netPay ?? 0),
            CTC: Number(emp.employerCost ?? 0),
          },
        },
      });

      fs.writeFileSync(filePath, buffer);

      const existing = await this.payslipArchiveRepo.findOne({
        where: { runId, employeeCode: emp.employeeCode } as any,
      });
      if (existing) {
        existing.fileName = fileName;
        existing.fileType = 'application/pdf';
        existing.fileSize = String(buffer.length);
        existing.filePath = filePath;
        existing.periodYear = run.periodYear;
        existing.periodMonth = run.periodMonth;
        existing.generatedByUserId = user.id;
        await this.payslipArchiveRepo.save(existing);
        updated++;
      } else {
        const row = this.payslipArchiveRepo.create({
          runId,
          clientId: run.clientId,
          branchId: run.branchId ?? null,
          employeeCode: emp.employeeCode,
          periodYear: run.periodYear,
          periodMonth: run.periodMonth,
          fileName,
          fileType: 'application/pdf',
          fileSize: String(buffer.length),
          filePath,
          generatedByUserId: user.id,
        });
        await this.payslipArchiveRepo.save(row);
        created++;
      }
    }

    return {
      ok: true,
      runId,
      created,
      updated,
      totalEmployees: employees.length,
    };
  }

  /**
   * Streams a ZIP of archived payslips for a run. If not archived yet, it will archive first.
   */
  async streamPayslipsZip(user: any, runId: string, res: any) {
    if (!user?.id) throw new BadRequestException('Invalid user');
    const run = await this.runRepo.findOne({ where: { id: runId } as any });
    if (!run) throw new BadRequestException('Payroll run not found');
    await this.assertPayrollAccessToClient(user, run.clientId);

    const existingCount = await this.payslipArchiveRepo.count({
      where: { runId } as any,
    });
    if (existingCount === 0) {
      await this.archiveRunPayslips(user, runId);
    }

    const files = await this.payslipArchiveRepo.find({
      where: { runId } as any,
    });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="payslips_${run.periodYear}_${String(run.periodMonth).padStart(2, '0')}_${runId}.zip"`,
    );

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (err) => {
      throw err;
    });
    archive.pipe(res);

    for (const f of files) {
      if (f.filePath && fs.existsSync(f.filePath)) {
        archive.file(f.filePath, { name: f.fileName });
      }
    }

    await archive.finalize();
  }
}
