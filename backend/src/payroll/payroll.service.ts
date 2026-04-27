import * as fs from 'fs';
import * as path from 'path';
import archiver from 'archiver';
import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
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
import { EmployeeEntity } from '../employees/entities/employee.entity';
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
import {
  ClientCreatePayrollInputDto,
  ClientUploadPayrollInputFileDto,
  ClientUploadRegisterRecordDto,
  ClientUpdatePayrollSettingsDto,
} from './dto/client-payroll-input.dto';
import { CreatePayrollRunDto } from './dto/create-payroll-run.dto';
import { SaveClientComponentsDto } from './dto/save-client-components.dto';
import { CreatePayrollQueryDto } from './dto/payroll-query.dto';
import { CreateFnfDto, UpdateFnfStatusDto } from './dto/payroll-fnf.dto';
import { generatePayslipPdfBuffer, loadLogoBuffer } from './utils/payslip-pdf';
import { PayrollRunComponentValueEntity } from './entities/payroll-run-component-value.entity';
import { IsNull } from 'typeorm';
import { PayrollClientPayslipLayoutEntity } from './entities/payroll-client-payslip-layout.entity';
import { PayrollTemplate } from './entities/payroll-template.entity';
import { PayrollTemplateComponent } from './entities/payroll-template-component.entity';
import { PayrollClientTemplate } from './entities/payroll-client-template.entity';
import { PayrollClientSettings } from './entities/payroll-client-settings.entity';
import { AuditEntity } from '../audits/entities/audit.entity';
import { AuditType } from '../common/enums';
import { PayrollQueryEntity } from './entities/payroll-query.entity';
import { PayrollQueryMessageEntity } from './entities/payroll-query-message.entity';
import { PayrollFnfEntity } from './entities/payroll-fnf.entity';
import { PayrollFnfEventEntity } from './entities/payroll-fnf-event.entity';
import { PayrollFnfDocumentEntity } from './entities/payroll-fnf-document.entity';
import { PayrollRunItemEntity } from './entities/payroll-run-item.entity';
import { LeaveLedgerEntity } from '../ess/entities/leave-ledger.entity';
import { LeaveBalanceEntity } from '../ess/entities/leave-balance.entity';
import { AttendanceService } from '../attendance/attendance.service';
import { ReqUser } from '../access/access-scope.service';

@Injectable()
export class PayrollService {
  private readonly logger = new Logger(PayrollService.name);

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
    @InjectRepository(EmployeeEntity)
    private readonly employeeRepo: Repository<EmployeeEntity>,
    @InjectRepository(PayrollClientPayslipLayoutEntity)
    private readonly layoutRepo: Repository<PayrollClientPayslipLayoutEntity>,
    @InjectRepository(PayrollTemplate)
    private readonly templateRepo: Repository<PayrollTemplate>,
    @InjectRepository(PayrollTemplateComponent)
    private readonly _templateCompRepo: Repository<PayrollTemplateComponent>,
    @InjectRepository(PayrollClientTemplate)
    private readonly clientTemplateRepo: Repository<PayrollClientTemplate>,
    @InjectRepository(PayrollClientSettings)
    private readonly clientSettingsRepo: Repository<PayrollClientSettings>,
    @InjectRepository(AuditEntity)
    private readonly auditRepo: Repository<AuditEntity>,
    @InjectRepository(PayrollQueryEntity)
    private readonly queryRepo: Repository<PayrollQueryEntity>,
    @InjectRepository(PayrollQueryMessageEntity)
    private readonly queryMsgRepo: Repository<PayrollQueryMessageEntity>,
    @InjectRepository(PayrollFnfEntity)
    private readonly fnfRepo: Repository<PayrollFnfEntity>,
    @InjectRepository(PayrollFnfEventEntity)
    private readonly fnfEventRepo: Repository<PayrollFnfEventEntity>,
    @InjectRepository(PayrollFnfDocumentEntity)
    private readonly fnfDocRepo: Repository<PayrollFnfDocumentEntity>,
    @InjectRepository(LeaveLedgerEntity)
    private readonly leaveLedgerRepo: Repository<LeaveLedgerEntity>,
    @InjectRepository(LeaveBalanceEntity)
    private readonly leaveBalanceRepo: Repository<LeaveBalanceEntity>,
    private readonly notificationsSvc: NotificationsService,
    private readonly attendanceService: AttendanceService,
  ) {}

  ymLabel(year: number, month: number) {
    if (!year || !month) return '';
    return `${year}-${String(month).padStart(2, '0')}`;
  }

  /**
   * Enrich component values with leave/attendance data computed from source tables.
   * This ensures payslips always show correct EL_ACCRUED, EL_PAID_LEAVE_DAYS, and HOLIDAYS
   * even for runs processed before these component values were added to the engine.
   */
  private async enrichLeaveAttendanceValues(
    cv: Record<string, number>,
    employeeId: string | null,
    clientId: string,
    year: number,
    month: number,
  ): Promise<void> {
    const monthStr = `${year}-${String(month).padStart(2, '0')}`;

    // ── EL_ACCRUED: read from ledger if available, else compute from WORKED_DAYS / 20 ──
    if (employeeId) {
      try {
        const elEntries = await this.leaveLedgerRepo.find({
          where: { employeeId, leaveType: 'EL' },
        });
        let accrued = 0;
        for (const entry of elEntries) {
          if (entry.refType === 'EL_ACCRUAL' && entry.remarks?.includes(monthStr)) {
            accrued += Math.abs(Number(entry.qty) || 0);
          }
        }
        cv['EL_ACCRUED'] = Math.round(accrued * 100) / 100;
      } catch {
        // Fallback to formula
        if (cv['WORKED_DAYS'] !== undefined) {
          cv['EL_ACCRUED'] = Math.round((cv['WORKED_DAYS'] / 20) * 100) / 100;
        } else if (cv['EL_ACCRUED'] === undefined) {
          cv['EL_ACCRUED'] = 0;
        }
      }
    } else {
      if (cv['WORKED_DAYS'] !== undefined) {
        cv['EL_ACCRUED'] = Math.round((cv['WORKED_DAYS'] / 20) * 100) / 100;
      } else if (cv['EL_ACCRUED'] === undefined) {
        cv['EL_ACCRUED'] = 0;
      }
    }

    // ── EL_PAID_LEAVE_DAYS: from leave ledger ──
    if (employeeId) {
      try {
        const elEntries = await this.leaveLedgerRepo.find({
          where: { employeeId, leaveType: 'EL' },
        });
        let paidLeaveDays = 0;
        for (const entry of elEntries) {
          if (entry.refType === 'EL_PAID_LEAVE' && entry.remarks?.includes(monthStr)) {
            paidLeaveDays += Math.abs(Number(entry.qty) || 0);
          }
        }
        cv['EL_PAID_LEAVE_DAYS'] = paidLeaveDays;
      } catch {
        if (cv['EL_PAID_LEAVE_DAYS'] === undefined) cv['EL_PAID_LEAVE_DAYS'] = 0;
      }

      // ── EL_BALANCE: read from leave_balances ──
      try {
        const elBal = await this.leaveBalanceRepo.findOne({
          where: { employeeId, year, leaveType: 'EL' },
        });
        cv['EL_BALANCE'] = elBal ? parseFloat(elBal.available) || 0 : 0;
      } catch {
        if (cv['EL_BALANCE'] === undefined) cv['EL_BALANCE'] = 0;
      }
    } else {
      if (cv['EL_PAID_LEAVE_DAYS'] === undefined) cv['EL_PAID_LEAVE_DAYS'] = 0;
      if (cv['EL_BALANCE'] === undefined) cv['EL_BALANCE'] = 0;
    }

    // ── HOLIDAYS: always recompute from attendance ──
    try {
      const summaries = await this.attendanceService.getMonthlySummary({
        clientId, year, month,
      });
      if (employeeId) {
        const empSummary = summaries.find((s) => s.employeeId === employeeId);
        cv['HOLIDAYS'] = empSummary?.holidays ?? 0;
        cv['WEEK_OFFS'] = empSummary?.weekOffs ?? 0;
      }
    } catch {
      if (cv['HOLIDAYS'] === undefined) cv['HOLIDAYS'] = 0;
    }
  }

  private normalizeHeader(value: unknown): string {
    const raw = this.textFromCell(value)
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
    return raw.replace(/[^a-z0-9 ]/g, '').trim();
  }

  private cellValue(value: unknown): unknown {
    if (value && typeof value === 'object') {
      if ('result' in value) return (value as Record<string, unknown>).result;
      if ('text' in value) return (value as Record<string, unknown>).text;
    }
    return value;
  }

  private textFromCell(value: unknown): string {
    const normalized = this.cellValue(value);
    if (normalized === null || normalized === undefined) return '';
    if (
      typeof normalized === 'string' ||
      typeof normalized === 'number' ||
      typeof normalized === 'boolean' ||
      typeof normalized === 'bigint'
    ) {
      return String(normalized).trim();
    }
    return '';
  }

  private numberFromCell(value: unknown): number | null {
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
      payrollBranchScope: s.payrollBranchScope === 'SELECTED' ? 'SELECTED' : 'ALL',
      payrollAllowedBranchIds: Array.isArray(s.payrollAllowedBranchIds) ? s.payrollAllowedBranchIds : [],
    };
  }

  async clientGetPayrollSettings(user: ReqUser) {
    this.ensureClientOrBranchUser(user);
    const toggles = await this.getClientAccessToggles(user.clientId!);
    return { clientId: user.clientId, ...toggles };
  }

  async clientUpdatePayrollSettings(
    user: ReqUser,
    dto: ClientUpdatePayrollSettingsDto,
  ) {
    this.ensureClientOrBranchUser(user);
    if (user.userType !== 'MASTER') {
      throw new ForbiddenException(
        'Only client master users can update settings',
      );
    }

    const existing = await this.clientSettingsRepo.findOne({
      where: { clientId: user.clientId! },
    });

    const next = {
      ...(existing?.settings || {}),
      allowBranchPayrollAccess: dto?.allowBranchPayrollAccess === true,
      allowBranchWageRegisters: dto?.allowBranchWageRegisters === true,
      allowBranchSalaryRegisters: dto?.allowBranchSalaryRegisters === true,
      payrollBranchScope: dto?.payrollBranchScope === 'SELECTED' ? 'SELECTED' : 'ALL',
      payrollAllowedBranchIds: dto?.payrollBranchScope === 'SELECTED'
        ? (Array.isArray(dto?.payrollAllowedBranchIds) ? dto.payrollAllowedBranchIds : [])
        : [],
    };

    const row = existing
      ? Object.assign(existing, { settings: next, updatedBy: user.userId })
      : this.clientSettingsRepo.create({
          clientId: user.clientId!,
          settings: next,
          updatedBy: user.userId,
        });

    await this.clientSettingsRepo.save(row);
    return { clientId: user.clientId, ...next };
  }

  private async assertPayrollAccessToClient(
    payrollUser: ReqUser,
    clientId: string,
    opts?: { allowReadOnly?: boolean },
  ) {
    if (!payrollUser?.id) throw new BadRequestException('Invalid user');

    // Admins always allowed
    if (payrollUser?.roleCode === 'ADMIN') return;

    // CEO/CCO/CRM read-only allowance when explicitly permitted by caller
    if (
      opts?.allowReadOnly &&
      ['CRM', 'CEO', 'CCO'].includes(payrollUser?.roleCode)
    ) {
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
        throw new ForbiddenException(
          'Payroll user not assigned to this client',
        );
      }
      return;
    }

    throw new ForbiddenException('Only payroll/admin allowed');
  }

  async getAssignedClients(user: ReqUser) {
    if (!user?.id) throw new BadRequestException('Invalid user');
    if (!['PAYROLL', 'ADMIN', 'CRM', 'CEO', 'CCO'].includes(user?.roleCode)) {
      throw new ForbiddenException('Only payroll/admin/CRM/CEO/CCO allowed');
    }
    if (['ADMIN', 'CRM', 'CEO', 'CCO'].includes(user.roleCode)) {
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

  async clientListPayrollRuns(user: ReqUser, q: Record<string, any>) {
    await this.ensureClientPayrollAccess(user);
    const qb = this.runRepo
      .createQueryBuilder('r')
      .where('r.client_id = :cid', { cid: user.clientId })
      .orderBy('r.created_at', 'DESC');

    if (user.userType === 'BRANCH' && user.branchIds?.length) {
      qb.andWhere('(r.branch_id IN (:...ubids) OR r.branch_id IS NULL)', {
        ubids: user.branchIds,
      });
    } else if (q?.branchId) {
      qb.andWhere('r.branch_id = :bid', { bid: q.branchId });
    }
    if (q?.periodYear)
      qb.andWhere('r.period_year = :y', { y: Number(q.periodYear) });
    if (q?.periodMonth)
      qb.andWhere('r.period_month = :m', { m: Number(q.periodMonth) });
    if (q?.status) qb.andWhere('r.status = :s', { s: q.status });

    const runs = await qb.getMany();
    if (!runs.length) return [];

    const runIds = runs.map((r) => r.id);
    const empCounts = await this.runEmployeeRepo
      .createQueryBuilder('e')
      .select('e.run_id', 'runId')
      .addSelect('COUNT(1)', 'cnt')
      .where('e.run_id IN (:...runIds)', { runIds })
      .groupBy('e.run_id')
      .getRawMany<{ runId: string; cnt: string }>();
    const cntMap = new Map<string, number>();
    for (const c of empCounts) cntMap.set(c.runId, Number(c.cnt || 0));

    return runs.map((r) => ({
      id: r.id,
      clientId: r.clientId,
      branchId: r.branchId ?? null,
      periodYear: r.periodYear,
      periodMonth: r.periodMonth,
      title: r.title ?? `Payroll Run`,
      status: r.status,
      createdAt: r.createdAt,
      employeeCount: cntMap.get(r.id) ?? 0,
      type: 'RUN' as const,
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
    user: ReqUser,
    clientId: string,
    file: Express.Multer.File,
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

  async payrollGetClientTemplateMeta(user: ReqUser, clientId: string) {
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

  async payrollDownloadClientTemplate(user: ReqUser, clientId: string) {
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
      downloadUrl: `/api/client/payroll/template/download`,
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

  async listPayrollInputFilesForPayroll(user: ReqUser, payrollInputId: string) {
    const input = await this.inputRepo.findOne({
      where: { id: payrollInputId },
    });
    if (!input) throw new BadRequestException('Payroll input not found');
    await this.assertPayrollAccessToClient(user, input.clientId);
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
    await this.assertPayrollAccessToClient(user, input.clientId, {
      allowReadOnly: true,
    });
    const buffer = fs.readFileSync(file.filePath);
    return { fileName: file.fileName, fileType: file.fileType, buffer };
  }

  async createPayrollRun(user: ReqUser, dto: CreatePayrollRunDto) {
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
      },
    });
    if (existing) {
      throw new BadRequestException(
        'Payroll run already exists for this client and period',
      );
    }

    let title = dto?.title?.trim() || null;
    if (dto?.sourcePayrollInputId) {
      const input = await this.inputRepo.findOne({
        where: { id: dto.sourcePayrollInputId },
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
    const savedRun = await this.runRepo.save(row);

    // ── Auto-seed employees from master employee list ──────────────────
    const whereClause: Record<string, any> = {
      clientId: dto.clientId,
      isActive: true,
    };
    if (dto.branchId) {
      whereClause.branchId = dto.branchId;
    }
    const masterEmployees = await this.employeeRepo.find({
      where: whereClause,
      order: { employeeCode: 'ASC' },
    });

    if (masterEmployees.length) {
      const seedEntities =
        masterEmployees.map((emp) =>
          this.runEmployeeRepo.create({
            runId: savedRun.id,
            clientId: savedRun.clientId,
            branchId: emp.branchId ?? savedRun.branchId ?? null,
            employeeId: emp.id,
            employeeCode: emp.employeeCode,
            employeeName: emp.name,
            designation: emp.designation ?? null,
            uan: emp.uan ?? null,
            esic: emp.esic ?? null,
            stateCode: emp.stateCode ?? null,
          }),
        );

      await this.runEmployeeRepo.save(seedEntities);
    }

    return {
      ...savedRun,
      employeeCount: masterEmployees.length,
    };
  }

  async deleteDraftPayrollRun(user: ReqUser, runId: string) {
    if (!user?.id) throw new BadRequestException('Invalid user');
    if (user?.roleCode !== 'PAYROLL' && user?.roleCode !== 'ADMIN') {
      throw new ForbiddenException('Only payroll/admin allowed');
    }

    const run = await this.runRepo.findOne({ where: { id: runId } });
    if (!run) throw new BadRequestException('Payroll run not found');

    await this.assertPayrollAccessToClient(user, run.clientId);

    const status = String(run.status || '').toUpperCase();
    if (status !== 'DRAFT') {
      throw new BadRequestException(
        `Cannot delete run in "${status}" state. Only DRAFT runs can be deleted.`,
      );
    }

    await this.runRepo.manager.transaction(async (manager) => {
      await manager.delete(PayrollRunComponentValueEntity, { runId });
      await manager.delete(PayrollRunItemEntity, { runId });
      await manager.delete(PayrollPayslipArchiveEntity, { runId });
      await manager.delete(PayrollRunEmployeeEntity, { runId });
      await manager.delete(PayrollRunEntity, { id: runId });
    });

    return { deleted: true, runId };
  }

  async uploadPayrollRunEmployees(
    user: ReqUser,
    runId: string,
    file: Express.Multer.File,
  ) {
    if (!user?.id) throw new BadRequestException('Invalid user');
    if (user?.roleCode !== 'PAYROLL' && user?.roleCode !== 'ADMIN') {
      throw new ForbiddenException('Only payroll/admin allowed');
    }
    if (!file) throw new BadRequestException('File is required');

    const run = await this.runRepo.findOne({ where: { id: runId } });
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
    const colMonthlyCtc = findCol([
      'monthly ctc',
      'month ctc',
      'ctc monthly',
      'total monthly ctc',
    ]);
    const colEmployerContribution = findCol([
      'employer contributions',
      'employer contribution',
      'employer cost',
      'total employer contribution',
    ]);
    // Intentionally do not match generic "ctc" / "total ctc" to avoid ingesting annual CTC.
    const colEmployerCost = colMonthlyCtc || colEmployerContribution;
    const colPfEmployee = findCol(['pf employee', 'employee pf', 'pf emp', 'pf deduction']);
    const colEsiEmployee = findCol(['esi employee', 'employee esi', 'esi emp', 'esi deduction']);
    const colPt = findCol(['professional tax', 'prof tax', 'pt']);
    const colPfEmployer = findCol(['pf employer', 'employer pf', 'pf er']);
    const colEsiEmployer = findCol(['esi employer', 'employer esi', 'esi er']);
    const colBonus = findCol(['bonus', 'attendance bonus', 'bonus provision']);

    if (!colEmployeeName)
      throw new BadRequestException('Required column not found: Name');

    const rows: Partial<PayrollRunEmployeeEntity>[] = [];
    const componentRows: Array<{
      employeeCode: string;
      pfEmployee: number | null;
      esiEmployee: number | null;
      pt: number | null;
      pfEmployer: number | null;
      esiEmployer: number | null;
      bonus: number | null;
    }> = [];
    const lastRow = ws.actualRowCount || ws.rowCount || 1;

    for (let i = 2; i <= lastRow; i++) {
      const row = ws.getRow(i);
      const nameVal = colEmployeeName
        ? this.cellValue(row.getCell(colEmployeeName).value)
        : null;
      const employeeName = this.textFromCell(nameVal);
      if (!employeeName) continue;

      const codeVal = colEmployeeCode
        ? this.cellValue(row.getCell(colEmployeeCode).value)
        : null;
      const employeeCode = this.textFromCell(codeVal) || String(i - 1);

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
      const pfEmployee = colPfEmployee
        ? this.numberFromCell(row.getCell(colPfEmployee).value)
        : null;
      const esiEmployee = colEsiEmployee
        ? this.numberFromCell(row.getCell(colEsiEmployee).value)
        : null;
      const pt = colPt
        ? this.numberFromCell(row.getCell(colPt).value)
        : null;
      const pfEmployer = colPfEmployer
        ? this.numberFromCell(row.getCell(colPfEmployer).value)
        : null;
      const esiEmployer = colEsiEmployer
        ? this.numberFromCell(row.getCell(colEsiEmployer).value)
        : null;
      const bonus = colBonus
        ? this.numberFromCell(row.getCell(colBonus).value)
        : null;

      rows.push({
        runId: run.id,
        clientId: run.clientId,
        branchId: run.branchId ?? null,
        employeeCode,
        employeeName,
        designation: this.textFromCell(designationVal) || null,
        uan: this.textFromCell(uanVal) || null,
        esic: this.textFromCell(esicVal) || null,
        grossEarnings: String(gross ?? 0),
        totalDeductions: String(totalDed ?? 0),
        netPay: String(netPay ?? 0),
        employerCost: String(employerCost ?? 0),
        pfEmployee: pfEmployee !== null ? String(pfEmployee) : null,
        esiEmployee: esiEmployee !== null ? String(esiEmployee) : null,
        pt: pt !== null ? String(pt) : null,
        pfEmployer: pfEmployer !== null ? String(pfEmployer) : null,
        esiEmployer: esiEmployer !== null ? String(esiEmployer) : null,
        bonus: bonus !== null ? String(bonus) : null,
      });

      componentRows.push({
        employeeCode,
        pfEmployee,
        esiEmployee,
        pt,
        pfEmployer,
        esiEmployer,
        bonus,
      });
    }

    if (!rows.length) throw new BadRequestException('No employee rows found');

    await this.runEmployeeRepo.upsert(rows as PayrollRunEmployeeEntity[], [
      'runId',
      'employeeCode',
    ]);

    const cvRepo = this.runEmployeeRepo.manager.getRepository(PayrollRunComponentValueEntity);
    const runEmployees = await this.runEmployeeRepo.find({ where: { runId: run.id } });
    const runEmpByCode = new Map(runEmployees.map((re) => [re.employeeCode, re.id]));
    const componentValues: Partial<PayrollRunComponentValueEntity>[] = [];

    for (const row of componentRows) {
      const runEmployeeId = runEmpByCode.get(row.employeeCode);
      if (!runEmployeeId) continue;

      const pushComp = (code: string, amount: number | null) => {
        if (amount === null || amount === undefined) return;
        componentValues.push({
          runId: run.id,
          runEmployeeId,
          componentCode: code,
          amount: String(amount),
          source: 'UPLOADED',
        });
      };

      pushComp('PF_EMP', row.pfEmployee);
      pushComp('ESI_EMP', row.esiEmployee);
      pushComp('PT', row.pt);
      pushComp('PF_ER', row.pfEmployer);
      pushComp('ESI_ER', row.esiEmployer);
      pushComp('BONUS', row.bonus);
    }

    if (componentValues.length) {
      await cvRepo
        .createQueryBuilder()
        .insert()
        .values(componentValues)
        .orUpdate(['amount', 'source'], ['run_employee_id', 'component_code'])
        .execute();
    }

    // Keep run status unchanged on employee import. Processing transition
    // is controlled explicitly by the process action.

    return { ok: true, runId: run.id, employees: rows.length };
  }

  async clientListRegistersRecords(user: ReqUser, q: Record<string, any>) {
    const qb = await this.buildClientRegistersQuery(user, q);
    const rows = await qb.getMany();
    return rows.map((r) => ({
      id: r.id,
      clientId: r.clientId,
      branchId: r.branchId ?? null,
      payrollInputId: r.payrollInputId ?? null,
      category: r.category,
      title: r.title,
      registerType: r.registerType ?? null,
      stateCode: r.stateCode ?? null,
      periodYear: r.periodYear ?? null,
      periodMonth: r.periodMonth ?? null,
      fileName: r.fileName ?? null,
      fileType: r.fileType ?? null,
      fileSize: r.fileSize ?? null,
      approvalStatus: r.approvalStatus,
      approvedAt: r.approvedAt ?? null,
      createdAt: r.createdAt,
      preparedByUserId: r.preparedByUserId ?? null,
      downloadUrl: `/api/client/payroll/registers-records/${r.id}/download`,
    }));
  }

  async streamClientRegistersPack(
    user: ReqUser,
    q: Record<string, any>,
    res: Response,
  ) {
    const qb = await this.buildClientRegistersQuery(user, q);
    const maxRows = Math.min(300, Math.max(1, Number(q?.limit) || 120));
    const rows = await qb.limit(maxRows).getMany();
    if (!rows.length) {
      throw new BadRequestException('No registers found for selected filters');
    }

    const available = rows.filter(
      (r) => r.filePath && fs.existsSync(r.filePath),
    );
    if (!available.length) {
      throw new BadRequestException('No register files available for download');
    }

    const now = new Date();
    const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="registers_pack_${stamp}.zip"`,
    );

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (err) => {
      throw err;
    });
    archive.pipe(res);

    const used = new Set<string>();
    for (const row of available) {
      const period = `${row.periodYear || 'na'}-${row.periodMonth ? String(row.periodMonth).padStart(2, '0') : 'na'}`;
      const source = row.payrollInputId ? 'generated' : 'manual';
      const rawName = `${period}_${source}_${row.title || 'register'}_${row.fileName || row.id}`;
      const zipName = this.uniqueZipFileName(rawName, used);
      archive.file(row.filePath, { name: zipName });
    }

    await archive.finalize();
  }

  private async buildClientRegistersQuery(
    user: ReqUser,
    q: Record<string, any>,
  ) {
    this.ensureClientOrBranchUser(user);
    const qb = this.rrRepo
      .createQueryBuilder('r')
      .where('r.client_id = :cid', { cid: user.clientId })
      .orderBy('r.created_at', 'DESC');

    if (user.userType === 'BRANCH') {
      const toggles = await this.getClientAccessToggles(user.clientId!);
      if (!toggles.allowBranchPayrollAccess) {
        throw new ForbiddenException(
          'Payroll access has not been enabled for branch users',
        );
      }
      if (user.branchIds?.[0]) {
        qb.andWhere('r.branch_id = :ub', { ub: user.branchIds[0] });
      }
      qb.andWhere('r.approval_status = :approved', { approved: 'APPROVED' });
      if (!toggles.allowBranchWageRegisters) {
        qb.andWhere(
          `NOT (LOWER(r.title) LIKE '%wage%' OR LOWER(COALESCE(r.register_type,'')) LIKE '%wage%')`,
        );
      }
      if (!toggles.allowBranchSalaryRegisters) {
        qb.andWhere(
          `NOT (LOWER(r.title) LIKE '%salary%' OR LOWER(COALESCE(r.register_type,'')) LIKE '%salary%')`,
        );
      }
    }

    if (q?.branchId) qb.andWhere('r.branch_id = :b', { b: q.branchId });
    if (q?.category) qb.andWhere('r.category = :cat', { cat: q.category });
    if (q?.periodYear)
      qb.andWhere('r.period_year = :y', { y: Number(q.periodYear) });
    if (q?.periodMonth)
      qb.andWhere('r.period_month = :m', { m: Number(q.periodMonth) });
    if (q?.sourceType === 'GENERATED') {
      qb.andWhere('r.payroll_input_id IS NOT NULL');
    } else if (q?.sourceType === 'MANUAL') {
      qb.andWhere('r.payroll_input_id IS NULL');
    }

    const search = String(q?.search || '').trim();
    if (search) {
      qb.andWhere(
        `(r.title ILIKE :s
          OR COALESCE(r.register_type,'') ILIKE :s
          OR COALESCE(r.file_name,'') ILIKE :s
          OR COALESCE(r.state_code,'') ILIKE :s
          OR COALESCE(r.branch_id::text,'') ILIKE :s)`,
        { s: `%${search}%` },
      );
    }

    return qb;
  }

  private sanitizeZipName(value: string): string {
    const out = String(value || '')
      .replace(/[\\/:*?"<>|]+/g, '_')
      .replace(/\s+/g, ' ')
      .trim();
    return out ? out.slice(0, 140) : 'register';
  }

  private uniqueZipFileName(rawName: string, used: Set<string>): string {
    const safe = this.sanitizeZipName(rawName);
    const dot = safe.lastIndexOf('.');
    const stem = dot > 0 ? safe.slice(0, dot) : safe;
    const ext = dot > 0 ? safe.slice(dot) : '';
    let name = safe;
    let idx = 2;
    while (used.has(name.toLowerCase())) {
      name = `${stem}_${idx}${ext}`;
      idx += 1;
    }
    used.add(name.toLowerCase());
    return name;
  }

  async clientUploadRegisterRecord(
    user: ReqUser,
    dto: ClientUploadRegisterRecordDto,
    file: Express.Multer.File,
  ) {
    await this.ensureClientPayrollAccess(user);
    if (!file) throw new BadRequestException('File is required');
    if (!dto?.category || !dto?.title) {
      throw new BadRequestException('category and title are required');
    }
    const row = this.rrRepo.create({
      clientId: user.clientId!,
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

  async payrollListRegistersRecords(user: ReqUser, q: Record<string, any>) {
    if (!user?.id) throw new BadRequestException('Invalid user');
    if (!['PAYROLL', 'ADMIN', 'CRM', 'CEO', 'CCO'].includes(user.roleCode)) {
      throw new ForbiddenException('Only payroll/admin/CRM/CEO/CCO allowed');
    }
    let ids: string[] = [];

    if (['ADMIN', 'CRM', 'CEO', 'CCO'].includes(user.roleCode)) {
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

    return { ids, q };
  }

  private buildPayrollRegistersQb(ids: string[], q: Record<string, any>) {
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
    if (q?.registerType)
      qb.andWhere('r.register_type = :rt', { rt: q.registerType });

    qb.orderBy('r.created_at', 'DESC');
    return qb;
  }

  async streamPayrollRegistersPack(
    user: ReqUser,
    q: Record<string, any>,
    res: Response,
  ) {
    const scope = await this.payrollListRegistersRecords(user, q);
    if (Array.isArray(scope)) {
      throw new BadRequestException('No registers found for selected filters');
    }
    const { ids } = scope;
    const qb = this.buildPayrollRegistersQb(ids, q);
    const rows = await qb.limit(300).getMany();
    if (!rows.length) {
      throw new BadRequestException('No registers found for selected filters');
    }

    const available = rows.filter(
      (r) => r.filePath && fs.existsSync(r.filePath),
    );
    if (!available.length) {
      throw new BadRequestException('No register files available for download');
    }

    const now = new Date();
    const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="registers_pack_${stamp}.zip"`,
    );

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (err) => {
      throw err;
    });
    archive.pipe(res);

    const used = new Set<string>();
    for (const row of available) {
      const period = `${row.periodYear || 'na'}-${row.periodMonth ? String(row.periodMonth).padStart(2, '0') : 'na'}`;
      const rawName = `${period}_${row.registerType || row.category || 'register'}_${row.fileName || row.id}`;
      const zipName = this.uniqueZipFileName(rawName, used);
      archive.file(row.filePath, { name: zipName });
    }

    await archive.finalize();
  }

  async payrollListRegistersFormatted(user: ReqUser, q: Record<string, any>) {
    const scope = await this.payrollListRegistersRecords(user, q);
    if (Array.isArray(scope)) return scope;
    const { ids } = scope;
    const qb = this.buildPayrollRegistersQb(ids, q);
    const rows = await qb.getMany();
    return rows.map((r) => ({
      id: r.id,
      clientId: r.clientId,
      branchId: r.branchId ?? null,
      payrollInputId: r.payrollInputId ?? null,
      category: r.category,
      title: r.title,
      registerType: r.registerType ?? null,
      stateCode: r.stateCode ?? null,
      periodYear: r.periodYear ?? null,
      periodMonth: r.periodMonth ?? null,
      fileName: r.fileName ?? null,
      fileType: r.fileType ?? null,
      fileSize: r.fileSize ?? null,
      approvalStatus: r.approvalStatus,
      approvedAt: r.approvedAt ?? null,
      createdAt: r.createdAt,
      preparedByUserId: r.preparedByUserId ?? null,
      downloadUrl: `/api/payroll/registers-records/${r.id}/download`,
    }));
  }

  async getPayrollSummary(user: ReqUser, _q: Record<string, any>) {
    if (!user?.id) throw new BadRequestException('Invalid user');
    if (
      user.roleCode !== 'PAYROLL' &&
      user.roleCode !== 'ADMIN' &&
      user.roleCode !== 'CRM'
    ) {
      throw new ForbiddenException('Only payroll/admin/CRM allowed');
    }

    const clientIds = await this.getAssignedClientIds(user);

    const assignedClients = clientIds.length;

    // Employees stats
    let totalEmployees = 0,
      activeEmployees = 0,
      exitedEmployees = 0;
    let pfPending = 0,
      esiPending = 0;
    if (clientIds.length) {
      const empStats = await this.employeeRepo
        .createQueryBuilder('e')
        .select([
          'COUNT(*) as total',
          'COUNT(*) FILTER (WHERE e.is_active = TRUE) as active',
          'COUNT(*) FILTER (WHERE e.is_active = FALSE) as exited',
          'COUNT(*) FILTER (WHERE e.pf_applicable = TRUE AND (e.pf_registered = FALSE OR e.pf_registered IS NULL) AND e.is_active = TRUE) as pf_pending',
          'COUNT(*) FILTER (WHERE e.esi_applicable = TRUE AND (e.esi_registered = FALSE OR e.esi_registered IS NULL) AND e.is_active = TRUE) as esi_pending',
        ])
        .where('e.client_id IN (:...ids)', { ids: clientIds })
        .getRawOne();
      totalEmployees = Number(empStats?.total ?? 0);
      activeEmployees = Number(empStats?.active ?? 0);
      exitedEmployees = Number(empStats?.exited ?? 0);
      pfPending = Number(empStats?.pf_pending ?? 0);
      esiPending = Number(empStats?.esi_pending ?? 0);
    }

    // Runs stats
    let pendingRuns = 0,
      completedThisMonth = 0,
      totalRuns = 0;
    if (clientIds.length) {
      try {
        const runStats = await this.runRepo
          .createQueryBuilder('r')
          .select([
            'COUNT(*) as total',
            "COUNT(*) FILTER (WHERE r.status IN ('DRAFT','PROCESSING')) as pending",
            "COUNT(*) FILTER (WHERE r.status = 'COMPLETED' AND r.created_at >= date_trunc('month', CURRENT_DATE)) as completed_month",
          ])
          .where('r.client_id IN (:...ids)', { ids: clientIds })
          .getRawOne();
        totalRuns = Number(runStats?.total ?? 0);
        pendingRuns = Number(runStats?.pending ?? 0);
        completedThisMonth = Number(runStats?.completed_month ?? 0);
      } catch {
        /* runs table might not exist yet */
      }
    }

    // Joiners this month
    let joinersThisMonth = 0,
      leaversThisMonth = 0;
    if (clientIds.length) {
      try {
        const jlStats = await this.employeeRepo
          .createQueryBuilder('e')
          .select([
            "COUNT(*) FILTER (WHERE e.date_of_joining >= date_trunc('month', CURRENT_DATE)) as joiners",
            "COUNT(*) FILTER (WHERE e.date_of_exit >= date_trunc('month', CURRENT_DATE)) as leavers",
          ])
          .where('e.client_id IN (:...ids)', { ids: clientIds })
          .getRawOne();
        joinersThisMonth = Number(jlStats?.joiners ?? 0);
        leaversThisMonth = Number(jlStats?.leavers ?? 0);
      } catch {
        /* OK */
      }
    }

    return {
      assignedClients,
      totalEmployees,
      activeEmployees,
      exitedEmployees,
      pendingRuns,
      completedThisMonth,
      totalRuns,
      pfPending,
      esiPending,
      joinersThisMonth,
      leaversThisMonth,
    };
  }

  /** Helper: get assigned client IDs for user */
  private async getAssignedClientIds(user: ReqUser): Promise<string[]> {
    if (user.roleCode === 'ADMIN' || user.roleCode === 'CRM') {
      const clients = await this.clientRepo
        .createQueryBuilder('c')
        .select('c.id')
        .where('c.is_deleted = false')
        .getMany();
      return clients.map((c) => c.id);
    }
    const assignments = await this.assignRepo.find({
      where: { payrollUserId: user.id, status: 'ACTIVE', endDate: IsNull() },
      select: ['clientId'],
    });
    return assignments.map((a) => a.clientId);
  }

  /**
   * Employees listing for PAYROLL role — all employees across assigned clients.
   * Supports search, status filter, client filter, pagination.
   */
  async getPayrollEmployees(user: ReqUser, q: Record<string, any>) {
    if (!user?.id) throw new BadRequestException('Invalid user');
    const clientIds = await this.getAssignedClientIds(user);
    if (!clientIds.length) return { data: [], total: 0 };

    const qb = this.employeeRepo
      .createQueryBuilder('e')
      .leftJoin('clients', 'c', 'c.id = e.client_id')
      .select([
        'e.id as "id"',
        'e.employee_code as "employeeCode"',
        'e.name as "name"',
        'e.designation as "designation"',
        'e.department as "department"',
        'e.date_of_joining as "dateOfJoining"',
        'e.date_of_exit as "dateOfExit"',
        'e.is_active as "isActive"',
        'e.pf_applicable as "pfApplicable"',
        'e.pf_registered as "pfRegistered"',
        'e.esi_applicable as "esiApplicable"',
        'e.esi_registered as "esiRegistered"',
        'e.uan as "uan"',
        'e.esic as "esic"',
        'e.phone as "phone"',
        'e.email as "email"',
        'e.client_id as "clientId"',
        'c.client_name as "clientName"',
      ])
      .where('e.client_id IN (:...ids)', { ids: clientIds });

    // Filters
    if (q?.clientId) {
      qb.andWhere('e.client_id = :cid', { cid: q.clientId });
    }
    if (q?.status === 'ACTIVE') {
      qb.andWhere('e.is_active = TRUE');
    } else if (q?.status === 'INACTIVE') {
      qb.andWhere('e.is_active = FALSE');
    }
    if (q?.search) {
      qb.andWhere(
        '(e.name ILIKE :s OR e.employee_code ILIKE :s OR e.uan ILIKE :s OR e.esic ILIKE :s)',
        { s: `%${q.search}%` },
      );
    }
    if (q?.pfStatus === 'PENDING') {
      qb.andWhere(
        'e.pf_applicable = TRUE AND (e.pf_registered = FALSE OR e.pf_registered IS NULL)',
      );
    } else if (q?.pfStatus === 'REGISTERED') {
      qb.andWhere('e.pf_applicable = TRUE AND e.pf_registered = TRUE');
    }
    if (q?.esiStatus === 'PENDING') {
      qb.andWhere(
        'e.esi_applicable = TRUE AND (e.esi_registered = FALSE OR e.esi_registered IS NULL)',
      );
    } else if (q?.esiStatus === 'REGISTERED') {
      qb.andWhere('e.esi_applicable = TRUE AND e.esi_registered = TRUE');
    }

    const total = await qb.getCount();

    qb.orderBy('e.name', 'ASC');
    const page = Math.max(1, Number(q?.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(q?.limit) || 25));
    qb.skip((page - 1) * limit).take(limit);

    const data = await qb.getRawMany();
    return { data, total, page, limit };
  }

  /**
   * Employee detail for PAYROLL role — fetch a single employee with full info.
   */
  async getPayrollEmployeeDetail(user: ReqUser, employeeId: string) {
    if (!user?.id) throw new BadRequestException('Invalid user');
    const clientIds = await this.getAssignedClientIds(user);
    if (!clientIds.length) throw new ForbiddenException('No assigned clients');

    const emp = await this.employeeRepo.findOne({ where: { id: employeeId } });
    if (!emp || !clientIds.includes(emp.clientId)) {
      throw new ForbiddenException('Employee not in your assigned clients');
    }

    // Get client name
    const client = await this.clientRepo.findOne({
      where: { id: emp.clientId },
    });

    // Get payroll run history for this employee
    let runHistory: Record<string, unknown>[] = [];
    try {
      runHistory = await this.runEmployeeRepo
        .createQueryBuilder('re')
        .leftJoin('payroll_runs', 'r', 'r.id = re.run_id')
        .select([
          're.id as "id"',
          're.run_id as "runId"',
          'r.period_year as "periodYear"',
          'r.period_month as "periodMonth"',
          'r.status as "runStatus"',
          're.gross_earnings as "grossEarnings"',
          're.total_deductions as "totalDeductions"',
          're.net_pay as "netPay"',
          'r.created_at as "runDate"',
        ])
        .where('re.employee_id = :eid', { eid: employeeId })
        .orderBy('r.period_year', 'DESC')
        .addOrderBy('r.period_month', 'DESC')
        .take(24)
        .getRawMany();
    } catch {
      /* table might not exist */
    }

    return {
      ...emp,
      clientName: client?.clientName ?? 'Unknown',
      runHistory,
    };
  }

  /**
   * PF/ESI summary across all clients assigned to the payroll user.
   * Returns per-client PF/ESI registration counts and pending employee lists.
   */
  async getPfEsiSummary(user: ReqUser) {
    if (!user?.id) throw new BadRequestException('Invalid user');

    // Get assigned client IDs
    let clientIds: string[] = [];
    if (user.roleCode === 'ADMIN' || user.roleCode === 'CRM') {
      const clients = await this.clientRepo
        .createQueryBuilder('c')
        .select('c.id')
        .where('c.is_deleted = false')
        .getMany();
      clientIds = clients.map((c) => c.id);
    } else {
      const assignments = await this.assignRepo.find({
        where: { payrollUserId: user.id, status: 'ACTIVE', endDate: IsNull() },
        select: ['clientId'],
      });
      clientIds = assignments.map((a) => a.clientId);
    }

    if (!clientIds.length) {
      return {
        clients: [],
        totals: {
          pfRegistered: 0,
          pfPending: 0,
          esiRegistered: 0,
          esiPending: 0,
        },
      };
    }

    const DAY_MS = 86400000;
    const pendingDays = (d: Date | string | null) => {
      if (!d) return 0;
      const dt = d instanceof Date ? d : new Date(d + 'T00:00:00Z');
      const diff = Math.floor((Date.now() - dt.getTime()) / DAY_MS);
      return diff > 0 ? diff : 0;
    };

    // Fetch client names
    const clientRows = await this.clientRepo
      .createQueryBuilder('c')
      .select(['c.id', 'c.client_name'])
      .where('c.id IN (:...ids)', { ids: clientIds })
      .getRawMany();
    const clientNameMap = new Map(
      clientRows.map((r: { c_id: string; c_client_name: string }) => [
        r.c_id,
        r.c_client_name,
      ]),
    );

    const results: Record<string, unknown>[] = [];
    let totalPfReg = 0,
      totalPfPend = 0,
      totalEsiReg = 0,
      totalEsiPend = 0;

    for (const clientId of clientIds) {
      const baseQb = this.employeeRepo
        .createQueryBuilder('e')
        .where('e.client_id = :clientId', { clientId })
        .andWhere('e.is_active = TRUE');

      const pfRegistered = await baseQb
        .clone()
        .andWhere('e.pf_applicable = TRUE AND e.pf_registered = TRUE')
        .getCount();

      const pfPendingRows = await baseQb
        .clone()
        .select([
          'e.id as id',
          'e.employee_code as "employeeCode"',
          'e.name as "name"',
          'e.date_of_joining as "dateOfJoining"',
          'e.pf_applicable_from as "pfApplicableFrom"',
          'e.uan as uan',
        ])
        .andWhere(
          'e.pf_applicable = TRUE AND (e.pf_registered = FALSE OR e.pf_registered IS NULL)',
        )
        .getRawMany();

      const pfPending = pfPendingRows.map((r: Record<string, unknown>) => ({
        employeeId: r.id,
        empCode: r.employeeCode,
        name: r.name || '',
        dateOfJoining: r.dateOfJoining || null,
        uanAvailable: !!r.uan,
        uan: r.uan || null,
        pendingDays: pendingDays(
          (r.pfApplicableFrom || r.dateOfJoining) as Date | string | null,
        ),
      }));

      const esiRegistered = await baseQb
        .clone()
        .andWhere('e.esi_applicable = TRUE AND e.esi_registered = TRUE')
        .getCount();

      const esiPendingRows = await baseQb
        .clone()
        .select([
          'e.id as id',
          'e.employee_code as "employeeCode"',
          'e.name as "name"',
          'e.date_of_joining as "dateOfJoining"',
          'e.esi_applicable_from as "esiApplicableFrom"',
          'e.esic as "ipNumber"',
        ])
        .andWhere(
          'e.esi_applicable = TRUE AND (e.esi_registered = FALSE OR e.esi_registered IS NULL)',
        )
        .getRawMany();

      const esiPending = esiPendingRows.map((r: Record<string, unknown>) => ({
        employeeId: r.id,
        empCode: r.employeeCode,
        name: r.name || '',
        dateOfJoining: r.dateOfJoining || null,
        ipNumberAvailable: !!r.ipNumber,
        ipNumber: r.ipNumber || null,
        pendingDays: pendingDays(
          (r.esiApplicableFrom || r.dateOfJoining) as Date | string | null,
        ),
      }));

      totalPfReg += pfRegistered;
      totalPfPend += pfPending.length;
      totalEsiReg += esiRegistered;
      totalEsiPend += esiPending.length;

      results.push({
        clientId,
        clientName: clientNameMap.get(clientId) || 'Unknown',
        pf: {
          registered: pfRegistered,
          pending: pfPending.length,
          pendingEmployees: pfPending,
        },
        esi: {
          registered: esiRegistered,
          pending: esiPending.length,
          pendingEmployees: esiPending,
        },
      });
    }

    return {
      clients: results,
      totals: {
        pfRegistered: totalPfReg,
        pfPending: totalPfPend,
        esiRegistered: totalEsiReg,
        esiPending: totalEsiPend,
      },
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

  async getClientEffectiveComponents(user: ReqUser, clientId: string) {
    if (!user?.id) throw new BadRequestException('Invalid user');
    if (user.roleCode !== 'PAYROLL' && user.roleCode !== 'ADMIN') {
      throw new ForbiddenException('Only payroll/admin allowed');
    }
    if (!clientId) throw new BadRequestException('clientId required');

    await this.assertPayrollAccessToClient(user, clientId);

    const [master, overrides] = await Promise.all([
      this.compRepo.find({
        where: { isActive: true },
        order: { code: 'ASC' },
      }),
      this.overrideRepo.find({ where: { clientId } }),
    ]);

    const ovMap = new Map<string, PayrollClientComponentOverrideEntity>();
    for (const o of overrides) ovMap.set(o.componentId, o);

    const merged = master.map((c) => {
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

  async saveClientComponentOverrides(
    user: ReqUser,
    clientId: string,
    dto: SaveClientComponentsDto,
  ) {
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
        where: { clientId, componentId: it.componentId },
      });

      const patch: Partial<PayrollClientComponentOverrideEntity> = {
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

  async getClientPayslipLayout(user: ReqUser, clientId: string) {
    if (!user?.id) throw new BadRequestException('Invalid user');
    if (user.roleCode !== 'PAYROLL' && user.roleCode !== 'ADMIN') {
      throw new ForbiddenException('Only payroll/admin allowed');
    }
    if (!clientId) throw new BadRequestException('clientId required');

    await this.assertPayrollAccessToClient(user, clientId);

    const row = await this.layoutRepo.findOne({
      where: { clientId, isActive: true },
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
    user: ReqUser,
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
    const codeSet = new Set(effective.map((x) => x.code));

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
      where: { clientId },
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
  async downloadRegisterForPayroll(user: ReqUser, registerId: string) {
    if (!user?.id) throw new BadRequestException('Invalid user');
    const row = await this.rrRepo.findOne({ where: { id: registerId } });
    if (!row) throw new BadRequestException('Register not found');
    await this.assertPayrollAccessToClient(user, row.clientId, {
      allowReadOnly: true,
    });
    const buffer = fs.readFileSync(row.filePath);
    return { fileName: row.fileName, fileType: row.fileType, buffer };
  }

  /**
   * Download a register/record file for CLIENT.
   * Only approved registers can be downloaded by clients.
   */
  async downloadRegisterForClient(user: ReqUser, registerId: string) {
    this.ensureClientOrBranchUser(user);

    // Enforce top-level payroll access toggle for branch users
    if (user.userType === 'BRANCH') {
      const branchToggles = await this.getClientAccessToggles(user.clientId!);
      if (!branchToggles.allowBranchPayrollAccess) {
        throw new ForbiddenException(
          'Payroll access has not been enabled for branch users',
        );
      }
    }

    const row = await this.rrRepo.findOne({ where: { id: registerId } });
    if (!row) throw new BadRequestException('Register not found');
    if (row.clientId !== user.clientId)
      throw new ForbiddenException('Access denied');
    // Branch users: approved only + same branch
    if (user.userType === 'BRANCH') {
      if (
        user.branchIds?.[0] &&
        row.branchId &&
        row.branchId !== user.branchIds[0]
      ) {
        throw new ForbiddenException('Not your branch register');
      }
      if (row.approvalStatus !== 'APPROVED') {
        throw new ForbiddenException(
          'Register is not yet approved for download',
        );
      }

      // Enforce wage/salary register download restrictions
      const toggles = await this.getClientAccessToggles(user.clientId);

      const title = String(row.title || '').toLowerCase();
      const rtype = String(row.registerType || '').toLowerCase();

      if (
        !toggles.allowBranchWageRegisters &&
        (title.includes('wage') || rtype.includes('wage'))
      ) {
        throw new ForbiddenException(
          'Wage registers are restricted for branch users',
        );
      }
      if (
        !toggles.allowBranchSalaryRegisters &&
        (title.includes('salary') || rtype.includes('salary'))
      ) {
        throw new ForbiddenException(
          'Salary registers are restricted for branch users',
        );
      }
    }
    // Master users can download any status
    const buffer = fs.readFileSync(row.filePath);
    return { fileName: row.fileName, fileType: row.fileType, buffer };
  }

  /**
   * List payroll runs for PAYROLL/ADMIN.
   * Matches frontend: GET /api/payroll/runs?clientId&periodYear&periodMonth&status
   */
  async listPayrollRuns(user: ReqUser, q: Record<string, any>) {
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
      .addSelect('r.created_at', 'createdAt')
      .addSelect('r.submitted_at', 'submittedAt')
      .addSelect('r.approved_at', 'approvedAt')
      .addSelect('r.rejected_at', 'rejectedAt')
      .addSelect('r.rejection_reason', 'rejectionReason')
      .addSelect('r.approval_comments', 'approvalComments')
      .where('r.client_id IN (:...ids)', { ids: allowedClientIds })
      .andWhere('c.is_deleted = false')
      .orderBy('r.created_at', 'DESC');

    if (q?.clientId) qb.andWhere('r.client_id = :cid', { cid: q.clientId });
    if (q?.periodYear)
      qb.andWhere('r.period_year = :y', { y: Number(q.periodYear) });
    if (q?.periodMonth)
      qb.andWhere('r.period_month = :m', { m: Number(q.periodMonth) });
    if (q?.status) qb.andWhere('r.status = :st', { st: q.status });

    interface PayrollRunRaw {
      id: string;
      clientId: string;
      clientName: string | null;
      periodYear: string;
      periodMonth: string;
      status: string | null;
      createdAt: string | null;
      submittedAt: string | null;
      approvedAt: string | null;
      rejectedAt: string | null;
      rejectionReason: string | null;
      approvalComments: string | null;
    }
    const rows = await qb.getRawMany<PayrollRunRaw>();

    // employeeCount (batched)
    const runIds = rows.map((r) => r.id).filter(Boolean);
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
    return rows.map((r) => ({
      id: r.id,
      clientId: r.clientId,
      clientName: r.clientName ?? null,
      periodYear: Number(r.periodYear),
      periodMonth: Number(r.periodMonth),
      status: r.status ?? 'DRAFT',
      employeeCount: mapCnt.get(r.id) ?? 0,
      createdAt: r.createdAt ?? null,
      submittedAt: r.submittedAt ?? null,
      approvedAt: r.approvedAt ?? null,
      rejectedAt: r.rejectedAt ?? null,
      rejectionReason: r.rejectionReason ?? null,
      approvalComments: r.approvalComments ?? null,
    }));
  }

  /**
   * List employees for a payroll run.
   * NOTE: Frontend uses `employeeId` as a path param later; we return employeeCode there.
   */
  async listPayrollRunEmployees(user: ReqUser, runId: string) {
    if (!user?.id) throw new BadRequestException('Invalid user');
    const run = await this.runRepo.findOne({ where: { id: runId } });
    if (!run) throw new BadRequestException('Payroll run not found');
    await this.assertPayrollAccessToClient(user, run.clientId, {
      allowReadOnly: true,
    });

    const rows = await this.runEmployeeRepo.find({
      where: { runId },
      order: { employeeName: 'ASC' },
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
    user: ReqUser,
    runId: string,
    employeeId: string,
  ) {
    if (!user?.id) throw new BadRequestException('Invalid user');
    const run = await this.runRepo.findOne({ where: { id: runId } });
    if (!run) throw new BadRequestException('Payroll run not found');
    await this.assertPayrollAccessToClient(user, run.clientId, {
      allowReadOnly: true,
    });

    const emp = await this.runEmployeeRepo.findOne({
      where: { runId, employeeCode: employeeId },
    });
    if (!emp) throw new BadRequestException('Employee not found in run');

    const client = await this.clientRepo.findOne({
      where: { id: run.clientId },
    });

    // Fetch employee record for dateOfJoining
    const employee = emp.employeeId
      ? await this.employeeRepo.findOne({ where: { id: emp.employeeId } })
      : null;

    // Fetch component values for detailed breakdown
    const cvRepo = this.runEmployeeRepo.manager.getRepository(PayrollRunComponentValueEntity);
    const compValues = await cvRepo.find({ where: { runId, runEmployeeId: emp.id } });
    const componentValues: Record<string, number> = {};
    for (const v of compValues) {
      componentValues[v.componentCode] = Number(v.amount) || 0;
    }

    // Enrich with leave/attendance data if missing
    await this.enrichLeaveAttendanceValues(
      componentValues, emp.employeeId ?? null, run.clientId, run.periodYear, run.periodMonth,
    );

    // Load client logo
    const logoBuffer = loadLogoBuffer(client?.logoUrl);

    const buffer = await generatePayslipPdfBuffer({
      header: {
        periodYear: run.periodYear,
        periodMonth: run.periodMonth,
        clientName: client?.clientName ?? null,
        clientAddress: client?.registeredAddress ?? null,
        employeeName: emp.employeeName,
        empCode: emp.employeeCode,
        designation: emp.designation ?? null,
        dateOfJoining: employee?.dateOfJoining ?? null,
        uan: emp.uan ?? null,
        esic: emp.esic ?? null,
        logoBuffer,
      },
      componentValues,
    });

    const fileName = `payslip_${run.periodYear}_${String(run.periodMonth).padStart(2, '0')}_${emp.employeeCode}.pdf`;
    return { fileName, fileType: 'application/pdf', buffer };
  }

  /**
   * Download archived payslip for a payroll run/employeeCode from payroll_payslip_archives.
   */
  async downloadArchivedPayslipForPayroll(
    user: ReqUser,
    runId: string,
    employeeId: string,
  ) {
    // Generate on-the-fly with enriched values instead of reading stale archive
    return this.generatePayslipPdfForPayroll(user, runId, employeeId);
  }

  /**
   * Generate and store payslip PDFs into payroll_payslip_archives (idempotent).
   */
  async archiveRunPayslips(user: ReqUser, runId: string) {
    if (!user?.id) throw new BadRequestException('Invalid user');
    const run = await this.runRepo.findOne({ where: { id: runId } });
    if (!run) throw new BadRequestException('Payroll run not found');
    await this.assertPayrollAccessToClient(user, run.clientId);
    if (String(run.status || '').toUpperCase() !== 'APPROVED') {
      throw new BadRequestException(
        'Run must be approved before archiving/publishing payslips',
      );
    }

    const client = await this.clientRepo.findOne({
      where: { id: run.clientId },
    });
    const employees = await this.runEmployeeRepo.find({
      where: { runId },
    });

    // Load client logo once for all employees
    const logoBuffer = loadLogoBuffer(client?.logoUrl);

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

      // Fetch employee record for dateOfJoining
      const employee = emp.employeeId
        ? await this.employeeRepo.findOne({ where: { id: emp.employeeId } })
        : null;

      // Fetch component values for detailed breakdown
      const cvRepo = this.runEmployeeRepo.manager.getRepository(PayrollRunComponentValueEntity);
      const compValues = await cvRepo.find({ where: { runId, runEmployeeId: emp.id } });
      const componentValues: Record<string, number> = {};
      for (const v of compValues) {
        componentValues[v.componentCode] = Number(v.amount) || 0;
      }

      // Enrich with leave/attendance data
      await this.enrichLeaveAttendanceValues(
        componentValues, emp.employeeId ?? null, run.clientId, run.periodYear, run.periodMonth,
      );

      const buffer = await generatePayslipPdfBuffer({
        header: {
          periodYear: run.periodYear,
          periodMonth: run.periodMonth,
          clientName: client?.clientName ?? null,
          clientAddress: client?.registeredAddress ?? null,
          employeeName: emp.employeeName,
          empCode: emp.employeeCode,
          designation: emp.designation ?? null,
          dateOfJoining: employee?.dateOfJoining ?? null,
          uan: emp.uan ?? null,
          esic: emp.esic ?? null,
          logoBuffer,
        },
        componentValues,
      });

      fs.writeFileSync(filePath, buffer);

      const existing = await this.payslipArchiveRepo.findOne({
        where: { runId, employeeCode: emp.employeeCode },
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
  async streamPayslipsZip(user: ReqUser, runId: string, res: Response) {
    if (!user?.id) throw new BadRequestException('Invalid user');
    const run = await this.runRepo.findOne({ where: { id: runId } });
    if (!run) throw new BadRequestException('Payroll run not found');
    await this.assertPayrollAccessToClient(user, run.clientId);
    if (String(run.status || '').toUpperCase() !== 'APPROVED') {
      throw new BadRequestException(
        'Run must be approved before downloading published payslips',
      );
    }

    // Always re-archive to pick up enriched leave/attendance values
    await this.archiveRunPayslips(user, runId);

    const files = await this.payslipArchiveRepo.find({
      where: { runId },
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

  // ── Register Approval ──────────────────────────────────

  /**
   * Approve a register. PAYROLL or ADMIN only.
   */
  async approveRegister(user: ReqUser, registerId: string) {
    if (!user?.id) throw new BadRequestException('Invalid user');
    if (user.roleCode !== 'PAYROLL' && user.roleCode !== 'ADMIN') {
      throw new ForbiddenException(
        'Only payroll or admin users can approve registers',
      );
    }
    const row = await this.rrRepo.findOne({ where: { id: registerId } });
    if (!row) throw new BadRequestException('Register not found');
    await this.assertPayrollAccessToClient(user, row.clientId);

    row.approvalStatus = 'APPROVED';
    row.approvedByUserId = user.id;
    row.approvedAt = new Date();
    await this.rrRepo.save(row);
    return {
      id: row.id,
      approvalStatus: row.approvalStatus,
      approvedAt: row.approvedAt,
    };
  }

  /**
   * Reject a register. PAYROLL or ADMIN only.
   */
  async rejectRegister(user: ReqUser, registerId: string, reason?: string) {
    if (!user?.id) throw new BadRequestException('Invalid user');
    if (user.roleCode !== 'PAYROLL' && user.roleCode !== 'ADMIN') {
      throw new ForbiddenException(
        'Only payroll or admin users can reject registers',
      );
    }
    const row = await this.rrRepo.findOne({ where: { id: registerId } });
    if (!row) throw new BadRequestException('Register not found');
    await this.assertPayrollAccessToClient(user, row.clientId);

    row.approvalStatus = 'REJECTED';
    row.approvedByUserId = user.id;
    row.approvedAt = new Date();
    await this.rrRepo.save(row);
    return {
      id: row.id,
      approvalStatus: row.approvalStatus,
      approvedAt: row.approvedAt,
      reason: reason ?? null,
    };
  }

  // ── Auditor Register Access ────────────────────────────

  /**
   * List registers for AUDITOR. Only registers belonging to clients
   * where the auditor has a PAYROLL-type audit assigned (IN_PROGRESS or PLANNED).
   */
  async auditorListRegisters(user: ReqUser, q: Record<string, any>) {
    if (!user?.id) throw new BadRequestException('Invalid user');
    if (user.roleCode !== 'AUDITOR') {
      throw new ForbiddenException('Only auditors can access this resource');
    }

    // Find client IDs where this auditor has a PAYROLL-type audit assigned
    const audits = await this.auditRepo
      .createQueryBuilder('a')
      .select('DISTINCT a.client_id', 'clientId')
      .where('a.assigned_auditor_id = :uid', { uid: user.id })
      .andWhere('a.audit_type = :type', { type: 'PAYROLL' })
      .andWhere('a.status IN (:...statuses)', {
        statuses: ['PLANNED', 'IN_PROGRESS'],
      })
      .getRawMany<{ clientId: string }>();

    const allowedClientIds = audits.map((a) => a.clientId);
    if (allowedClientIds.length === 0) return [];

    // If clientId filter passed, check access
    let clientIds = allowedClientIds;
    if (q?.clientId) {
      if (!allowedClientIds.includes(q.clientId)) {
        throw new ForbiddenException(
          'No payroll audit assigned for this client',
        );
      }
      clientIds = [q.clientId];
    }

    const qb = this.rrRepo
      .createQueryBuilder('r')
      .where('r.client_id IN (:...ids)', { ids: clientIds });

    if (q?.branchId) qb.andWhere('r.branch_id = :b', { b: q.branchId });
    if (q?.periodYear)
      qb.andWhere('r.period_year = :y', { y: Number(q.periodYear) });
    if (q?.periodMonth)
      qb.andWhere('r.period_month = :m', { m: Number(q.periodMonth) });
    if (q?.category) qb.andWhere('r.category = :cat', { cat: q.category });

    qb.orderBy('r.created_at', 'DESC');
    const rows = await qb.getMany();
    return rows.map((r) => ({
      id: r.id,
      clientId: r.clientId,
      branchId: r.branchId ?? null,
      category: r.category,
      title: r.title,
      registerType: r.registerType ?? null,
      stateCode: r.stateCode ?? null,
      periodYear: r.periodYear ?? null,
      periodMonth: r.periodMonth ?? null,
      fileName: r.fileName ?? null,
      fileType: r.fileType ?? null,
      approvalStatus: r.approvalStatus,
      approvedAt: r.approvedAt ?? null,
      createdAt: r.createdAt,
      downloadUrl: `/api/auditor/registers/${r.id}/download`,
    }));
  }

  /**
   * Download a register for AUDITOR. Only when auditor has PAYROLL audit for the client.
   */
  async downloadRegisterForAuditor(user: ReqUser, registerId: string) {
    if (!user?.id) throw new BadRequestException('Invalid user');
    if (user.roleCode !== 'AUDITOR') {
      throw new ForbiddenException('Only auditors can access this resource');
    }
    const row = await this.rrRepo.findOne({ where: { id: registerId } });
    if (!row) throw new BadRequestException('Register not found');

    // Check auditor has payroll audit for this client
    const audit = await this.auditRepo.findOne({
      where: {
        assignedAuditorId: user.id,
        clientId: row.clientId,
        auditType: AuditType.PAYROLL,
      },
    });
    if (
      !audit ||
      (audit.status !== 'PLANNED' && audit.status !== 'IN_PROGRESS')
    ) {
      throw new ForbiddenException('No active payroll audit for this client');
    }

    const buffer = fs.readFileSync(row.filePath);
    return { fileName: row.fileName, fileType: row.fileType, buffer };
  }

  // --- Templates listing ---
  async listTemplates() {
    const items = await this.templateRepo.find({
      order: { name: 'ASC' },
      relations: ['components'],
    });
    return { items, total: items.length };
  }

  // --- Payslips listing ---
  async listPayslips(_user: ReqUser, q: Record<string, any>) {
    try {
      const qb = this.payslipArchiveRepo.createQueryBuilder('p');
      if (q?.clientId) qb.andWhere('p.client_id = :cid', { cid: q.clientId });
      if (q?.month && q?.year) {
        qb.andWhere('p.period_month = :m AND p.period_year = :y', {
          m: Number(q.month),
          y: Number(q.year),
        });
      }
      qb.orderBy('p.generated_at', 'DESC').take(200);
      const items = await qb.getMany();
      return { items, total: items.length };
    } catch (err) {
      this.logger.error('listPayslips query failed', (err as Error)?.message);
      return { items: [], total: 0 };
    }
  }

  // ====================
  // PAYROLL QUERIES (TICKETS)
  // ====================

  async listQueries(user: ReqUser, q: Record<string, any>) {
    const clientIds = await this.getAssignedClientIds(user);
    if (!clientIds.length) return { data: [], total: 0 };

    const qb = this.queryRepo
      .createQueryBuilder('pq')
      .leftJoin('clients', 'c', 'c.id = pq.client_id')
      .leftJoin('employees', 'e', 'e.id = pq.employee_id')
      .leftJoin('users', 'u', 'u.id = pq.raised_by')
      .select([
        'pq.id as "id"',
        'pq.subject as "subject"',
        'pq.category as "category"',
        'pq.priority as "priority"',
        'pq.status as "status"',
        'pq.created_at as "createdAt"',
        'pq.resolved_at as "resolvedAt"',
        'pq.client_id as "clientId"',
        'c.client_name as "clientName"',
        'pq.employee_id as "employeeId"',
        'e.name as "employeeName"',
        'u.name as "raisedByName"',
      ])
      .where('pq.client_id IN (:...ids)', { ids: clientIds });

    if (q?.status) qb.andWhere('pq.status = :st', { st: q.status });
    if (q?.clientId) qb.andWhere('pq.client_id = :cid', { cid: q.clientId });
    if (q?.priority) qb.andWhere('pq.priority = :pr', { pr: q.priority });
    if (q?.category) qb.andWhere('pq.category = :cat', { cat: q.category });
    if (q?.search) {
      qb.andWhere('(pq.subject ILIKE :s OR pq.description ILIKE :s)', {
        s: `%${q.search}%`,
      });
    }

    const total = await qb.getCount();
    qb.orderBy('pq.created_at', 'DESC');
    const page = Math.max(1, Number(q?.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(q?.limit) || 25));
    qb.skip((page - 1) * limit).take(limit);
    const data = await qb.getRawMany();
    return { data, total, page, limit };
  }

  async getQueryDetail(user: ReqUser, queryId: string) {
    const query = await this.queryRepo.findOne({ where: { id: queryId } });
    if (!query) throw new BadRequestException('Query not found');

    const clientIds = await this.getAssignedClientIds(user);
    if (!clientIds.includes(query.clientId)) {
      throw new ForbiddenException('Query not in your assigned clients');
    }

    const messages = await this.queryMsgRepo.find({
      where: { queryId },
      order: { createdAt: 'ASC' },
    });

    // Get sender names
    const senderIds = [...new Set(messages.map((m) => m.senderId))];
    let senderMap = new Map<string, string>();
    if (senderIds.length) {
      try {
        const rows = await this.queryRepo.manager
          .createQueryBuilder()
          .select(['u.id as id', 'u.name as name'])
          .from('users', 'u')
          .where('u.id IN (:...ids)', { ids: senderIds })
          .getRawMany();
        senderMap = new Map(
          rows.map((r: { id: string; name: string }) => [r.id, r.name]),
        );
      } catch {
        /* OK */
      }
    }

    return {
      ...query,
      messages: messages.map((m) => ({
        ...m,
        senderName: senderMap.get(m.senderId) || 'Unknown',
      })),
    };
  }

  async createQuery(user: ReqUser, dto: CreatePayrollQueryDto) {
    const clientIds = await this.getAssignedClientIds(user);
    if (!dto.clientId || !clientIds.includes(dto.clientId)) {
      throw new ForbiddenException('Invalid client');
    }

    const query = this.queryRepo.create({
      clientId: dto.clientId,
      employeeId: dto.employeeId || null,
      raisedBy: user.id,
      assignedTo: dto.assignedTo || user.id,
      subject: dto.subject,
      category: dto.category || 'GENERAL',
      priority: dto.priority || 'MEDIUM',
      status: 'OPEN',
      description: dto.description || null,
    });
    const saved = await this.queryRepo.save(query);

    // Add initial message if description provided
    if (dto.description) {
      await this.queryMsgRepo.save(
        this.queryMsgRepo.create({
          queryId: saved.id,
          senderId: user.id,
          message: dto.description,
        }),
      );
    }

    return saved;
  }

  async addQueryMessage(user: ReqUser, queryId: string, message: string) {
    const query = await this.queryRepo.findOne({ where: { id: queryId } });
    if (!query) throw new BadRequestException('Query not found');

    const msg = await this.queryMsgRepo.save(
      this.queryMsgRepo.create({
        queryId,
        senderId: user.id,
        message,
      }),
    );

    // Update timestamp
    await this.queryRepo.update(queryId, { updatedAt: new Date() });
    return msg;
  }

  async resolveQuery(user: ReqUser, queryId: string, resolution: string) {
    const query = await this.queryRepo.findOne({ where: { id: queryId } });
    if (!query) throw new BadRequestException('Query not found');

    await this.queryRepo.update(queryId, {
      status: 'RESOLVED',
      resolvedAt: new Date(),
      resolvedBy: user.id,
      resolution,
    });

    // Add resolution message
    await this.queryMsgRepo.save(
      this.queryMsgRepo.create({
        queryId,
        senderId: user.id,
        message: `[Resolved] ${resolution}`,
      }),
    );

    return { success: true };
  }

  async updateQueryStatus(_user: ReqUser, queryId: string, status: string) {
    const query = await this.queryRepo.findOne({ where: { id: queryId } });
    if (!query) throw new BadRequestException('Query not found');
    await this.queryRepo.update(queryId, { status });
    return { success: true };
  }

  // ====================
  // FULL & FINAL (F&F)
  // ====================
  private readonly FNF_ALLOWED_TRANSITIONS: Record<string, string[]> = {
    INITIATED: ['UNDER_REVIEW', 'APPROVED'],
    UNDER_REVIEW: ['APPROVED', 'SETTLED'],
    APPROVED: ['SETTLED', 'DOCS_ISSUED'],
    SETTLED: ['DOCS_ISSUED', 'COMPLETED'],
    DOCS_ISSUED: ['COMPLETED'],
    COMPLETED: [],
  };

  async listFnf(user: ReqUser, q: Record<string, any>) {
    const clientIds = await this.getAssignedClientIds(user);
    if (!clientIds.length) return { data: [], total: 0 };

    const qb = this.fnfRepo
      .createQueryBuilder('f')
      .leftJoin('clients', 'c', 'c.id = f.client_id')
      .leftJoin('employees', 'e', 'e.id = f.employee_id')
      .select([
        'f.id as "id"',
        'f.separation_date as "separationDate"',
        'f.last_working_day as "lastWorkingDay"',
        'f.reason as "reason"',
        'f.status as "status"',
        'f.settlement_amount as "settlementAmount"',
        'f.created_at as "createdAt"',
        'f.client_id as "clientId"',
        'c.client_name as "clientName"',
        'f.employee_id as "employeeId"',
        'e.name as "employeeName"',
        'e.employee_code as "employeeCode"',
      ])
      .where('f.client_id IN (:...ids)', { ids: clientIds });

    if (q?.status) qb.andWhere('f.status = :st', { st: q.status });
    if (q?.clientId) qb.andWhere('f.client_id = :cid', { cid: q.clientId });
    if (q?.search) {
      qb.andWhere(
        '(e.name ILIKE :s OR e.employee_code ILIKE :s)',
        { s: `%${q.search}%` },
      );
    }

    const total = await qb.getCount();
    qb.orderBy('f.created_at', 'DESC');
    const page = Math.max(1, Number(q?.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(q?.limit) || 25));
    qb.skip((page - 1) * limit).take(limit);
    const data = await qb.getRawMany();
    return { data, total, page, limit };
  }

  async createFnf(user: ReqUser, dto: CreateFnfDto) {
    const clientIds = await this.getAssignedClientIds(user);
    if (!dto.clientId || !clientIds.includes(dto.clientId)) {
      throw new ForbiddenException('Invalid client');
    }
    if (!dto.employeeId) {
      throw new BadRequestException('employeeId is required');
    }

    const employee = await this.employeeRepo.findOne({
      where: { id: dto.employeeId },
    });
    if (!employee || employee.clientId !== dto.clientId) {
      throw new BadRequestException(
        'Employee does not belong to selected client',
      );
    }

    const fnf = this.fnfRepo.create({
      clientId: dto.clientId,
      employeeId: dto.employeeId,
      separationDate: dto.separationDate,
      lastWorkingDay: dto.lastWorkingDay || null,
      reason: dto.reason || null,
      status: 'INITIATED',
      checklist: dto.checklist || [],
      settlementBreakup: dto.settlementBreakup || null,
      remarks: dto.remarks || null,
      initiatedBy: user.id,
    });
    const saved = await this.fnfRepo.save(fnf);

    await this.fnfEventRepo.save(
      this.fnfEventRepo.create({
        fnfId: saved.id,
        statusFrom: null,
        statusTo: 'INITIATED',
        action: 'INITIATED',
        remarks: saved.remarks || null,
        performedBy: user.id || null,
        metadata: {
          separationDate: saved.separationDate,
          lastWorkingDay: saved.lastWorkingDay,
        },
      }),
    );

    return saved;
  }

  async updateFnfStatus(user: ReqUser, fnfId: string, dto: UpdateFnfStatusDto) {
    const fnf = await this.fnfRepo.findOne({ where: { id: fnfId } });
    if (!fnf) throw new BadRequestException('F&F not found');
    if (!dto?.status) throw new BadRequestException('status is required');

    const fromStatus = this.normalizeFnfStatus(fnf.status);
    const toStatus = this.normalizeFnfStatus(dto.status);

    if (fromStatus === toStatus) {
      throw new BadRequestException(`Case is already in ${toStatus} status`);
    }

    const allowedNext = this.FNF_ALLOWED_TRANSITIONS[fromStatus] || [];
    if (!allowedNext.includes(toStatus)) {
      throw new BadRequestException(
        `Invalid F&F transition from ${fromStatus} to ${toStatus}`,
      );
    }

    const update: Partial<
      Pick<
        PayrollFnfEntity,
        | 'status'
        | 'remarks'
        | 'checklist'
        | 'settlementBreakup'
        | 'approvedBy'
        | 'settlementAmount'
      >
    > = { status: toStatus };

    if (dto.remarks !== undefined) {
      update.remarks = String(dto.remarks || '').trim() || null;
    }
    if (dto.checklist !== undefined) {
      if (!Array.isArray(dto.checklist)) {
        throw new BadRequestException('checklist must be an array');
      }
      update.checklist = dto.checklist;
    }
    if (dto.settlementBreakup !== undefined) {
      update.settlementBreakup = dto.settlementBreakup ?? null;
    }

    if (toStatus === 'APPROVED') {
      update.approvedBy = user.id;
    }

    if (toStatus === 'SETTLED') {
      const settlementAmount = Number(dto.settlementAmount);
      if (!Number.isFinite(settlementAmount) || settlementAmount <= 0) {
        throw new BadRequestException(
          'settlementAmount must be a positive number for SETTLED status',
        );
      }
      update.settlementAmount = settlementAmount;
    }

    if (toStatus === 'COMPLETED') {
      const amount = Number(fnf.settlementAmount || 0);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new BadRequestException(
          'Cannot complete F&F case before settlement amount is captured',
        );
      }
    }

    await this.fnfRepo.update(fnfId, update);

    await this.fnfEventRepo.save(
      this.fnfEventRepo.create({
        fnfId,
        statusFrom: fromStatus,
        statusTo: toStatus,
        action: 'STATUS_UPDATE',
        remarks: update.remarks ?? fnf.remarks ?? null,
        settlementAmount:
          update.settlementAmount !== undefined &&
          update.settlementAmount !== null
            ? String(update.settlementAmount)
            : null,
        performedBy: user?.id || null,
        metadata: {
          checklistUpdated: dto.checklist !== undefined,
          hasSettlementBreakup: dto.settlementBreakup !== undefined,
        },
      }),
    );

    return { success: true, status: toStatus };
  }

  async getFnfDetail(_user: ReqUser, fnfId: string) {
    const fnf = await this.fnfRepo.findOne({ where: { id: fnfId } });
    if (!fnf) throw new BadRequestException('F&F not found');

    const emp = await this.employeeRepo.findOne({
      where: { id: fnf.employeeId },
    });
    const client = await this.clientRepo.findOne({
      where: { id: fnf.clientId },
    });
    const history = await this.fnfEventRepo.find({
      where: { fnfId },
      order: { createdAt: 'ASC' },
    });

    return {
      ...fnf,
      employeeName: emp
        ? emp.name
        : 'Unknown',
      employeeCode: emp?.employeeCode || '',
      clientName: client?.clientName || 'Unknown',
      history: history.map((event) => ({
        id: event.id,
        statusFrom: event.statusFrom,
        statusTo: event.statusTo,
        action: event.action,
        remarks: event.remarks,
        settlementAmount:
          event.settlementAmount !== null &&
          event.settlementAmount !== undefined
            ? Number(event.settlementAmount)
            : null,
        performedBy: event.performedBy,
        createdAt: event.createdAt,
      })),
    };
  }

  private normalizeFnfStatus(input: string): string {
    const normalized = String(input || '')
      .trim()
      .toUpperCase();
    if (!normalized) return 'INITIATED';
    return normalized;
  }

  // ====================
  // F&F DOCUMENTS
  // ====================

  async uploadFnfDocument(
    user: ReqUser,
    fnfId: string,
    file: { fileName: string; filePath: string; fileSize: number; mimeType?: string },
    docType: string,
    docName: string,
    remarks?: string,
  ) {
    const fnf = await this.fnfRepo.findOne({ where: { id: fnfId } });
    if (!fnf) throw new BadRequestException('F&F case not found');

    const doc = this.fnfDocRepo.create({
      fnfId,
      clientId: fnf.clientId,
      employeeId: fnf.employeeId,
      docType,
      docName,
      fileName: file.fileName,
      filePath: file.filePath,
      fileSize: file.fileSize,
      mimeType: file.mimeType ?? null,
      uploadedBy: user.userId || user.id,
      remarks: remarks || null,
    });
    return this.fnfDocRepo.save(doc);
  }

  async listFnfDocuments(_user: ReqUser, fnfId: string) {
    const fnf = await this.fnfRepo.findOne({ where: { id: fnfId } });
    if (!fnf) throw new BadRequestException('F&F case not found');

    return this.fnfDocRepo.find({
      where: { fnfId },
      order: { createdAt: 'DESC' },
    });
  }

  async getFnfDocument(_user: ReqUser, docId: string) {
    const doc = await this.fnfDocRepo.findOne({ where: { id: docId } });
    if (!doc) throw new BadRequestException('Document not found');
    return doc;
  }

  async deleteFnfDocument(_user: ReqUser, docId: string) {
    const doc = await this.fnfDocRepo.findOne({ where: { id: docId } });
    if (!doc) throw new BadRequestException('Document not found');
    // Remove physical file if it exists
    if (fs.existsSync(doc.filePath)) {
      fs.unlinkSync(doc.filePath);
    }
    await this.fnfDocRepo.remove(doc);
    return { deleted: true };
  }

  async processPayrollRun(user: ReqUser, runId: string) {
    if (!user?.id) throw new BadRequestException('Invalid user');

    const run = await this.runRepo.findOne({ where: { id: runId } });
    if (!run) throw new BadRequestException('Payroll run not found');

    await this.assertPayrollAccessToClient(user, run.clientId);

    const currentStatus = String(run.status || '').toUpperCase();
    if (
      currentStatus !== 'DRAFT' &&
      currentStatus !== 'REJECTED' &&
      currentStatus !== 'IN_PROGRESS'
    ) {
      throw new BadRequestException(
        `Payroll run is "${currentStatus}". Only DRAFT, REJECTED, or IN_PROGRESS runs can be processed.`,
      );
    }

    const employeeCount = await this.runEmployeeRepo.count({
      where: { runId },
    });
    if (employeeCount <= 0) {
      throw new BadRequestException(
        'No employees found in this run. Import attendance/input before processing.',
      );
    }

    run.status = 'PROCESSED';
    // Reset workflow metadata for a fresh cycle.
    run.submittedByUserId = null;
    run.submittedAt = null;
    run.approvedByUserId = null;
    run.approvedAt = null;
    run.approvalComments = null;
    run.rejectedByUserId = null;
    run.rejectedAt = null;
    run.rejectionReason = null;

    return this.runRepo.save(run);
  }

  async approvePayrollRun(user: ReqUser, runId: string) {
    if (!user?.id) throw new BadRequestException('Invalid user');

    const run = await this.runRepo.findOne({ where: { id: runId } });
    if (!run) throw new BadRequestException('Payroll run not found');

    await this.assertPayrollAccessToClient(user, run.clientId);

    const currentStatus = String(run.status || '').toUpperCase();
    if (currentStatus !== 'SUBMITTED') {
      throw new BadRequestException(
        `Payroll run is "${currentStatus}". Only SUBMITTED runs can be approved.`,
      );
    }

    run.status = 'APPROVED';
    run.approvedByUserId = user.id;
    run.approvedAt = new Date();
    run.rejectedByUserId = null;
    run.rejectedAt = null;
    run.rejectionReason = null;

    const saved = await this.runRepo.save(run);

    await this.archiveRunPayslips(user, runId);

    return saved;
  }

  // ====================
  // ONE-TIME: Seed March 2026 EL from paysheet
  // ====================
  async seedMarchEl(runId: string) {
    const { MARCH_2026_SHEET_DATA } = await import('./march-2026-el-data');

    const run = await this.runRepo.findOne({ where: { id: runId } });
    if (!run) throw new BadRequestException('Payroll run not found');

    const year = run.periodYear;
    const month = run.periodMonth;
    const monthStr = `${year}-${String(month).padStart(2, '0')}`;
    const entryDate = `${monthStr}-01`;

    // Get all employees in this run
    const runEmps = await this.runEmployeeRepo.find({ where: { runId } });

    const results: { empCode: string; action: string; elAccrued?: number; paidLeave?: number; balance?: number }[] = [];

    for (const re of runEmps) {
      const empCode = re.employeeCode;
      const sheetRow = MARCH_2026_SHEET_DATA[empCode];
      if (!sheetRow) {
        results.push({ empCode, action: 'SKIP_NOT_IN_SHEET' });
        continue;
      }

      // Look up master employee for DOJ
      const masterEmp = re.employeeId
        ? await this.employeeRepo.findOne({ where: { id: re.employeeId } })
        : null;

      // Skip employees who joined in the same month as the payroll run
      if (masterEmp?.dateOfJoining) {
        const doj = new Date(masterEmp.dateOfJoining);
        if (doj.getFullYear() === year && doj.getMonth() + 1 === month) {
          results.push({ empCode, action: 'SKIP_MARCH_JOINER' });
          continue;
        }
      }

      const elAccrued = Math.round((sheetRow.workDays / 20) * 100) / 100;
      const paidLeave = sheetRow.paidLeave;

      if (!re.employeeId) {
        results.push({ empCode, action: 'SKIP_NO_EMPLOYEE_ID' });
        continue;
      }

      // Delete existing EL ledger entries for this month (idempotent)
      await this.leaveLedgerRepo
        .createQueryBuilder()
        .delete()
        .where('employee_id = :empId', { empId: re.employeeId })
        .andWhere('leave_type = :lt', { lt: 'EL' })
        .andWhere('remarks LIKE :m', { m: `%${monthStr}%` })
        .execute();

      // Ledger: EL accrual (credit)
      if (elAccrued > 0) {
        await this.leaveLedgerRepo.save(
          this.leaveLedgerRepo.create({
            employeeId: re.employeeId,
            clientId: run.clientId,
            leaveType: 'EL',
            entryDate,
            qty: String(elAccrued),
            refType: 'EL_ACCRUAL',
            refId: run.id,
            remarks: `EL accrual for ${monthStr}: ${elAccrued} days`,
          }),
        );
      }

      // Ledger: EL paid leave (debit)
      if (paidLeave > 0) {
        await this.leaveLedgerRepo.save(
          this.leaveLedgerRepo.create({
            employeeId: re.employeeId,
            clientId: run.clientId,
            leaveType: 'EL',
            entryDate,
            qty: String(-paidLeave),
            refType: 'EL_PAID_LEAVE',
            refId: run.id,
            remarks: `EL paid leave for ${monthStr}: ${paidLeave} days`,
          }),
        );
      }

      // Upsert leave_balances
      await this.leaveBalanceRepo.query(
        `INSERT INTO leave_balances (id, employee_id, client_id, year, leave_type, opening, accrued, used, lapsed, available, created_at)
         VALUES (gen_random_uuid(), $1, $2, $3, 'EL', 0, $4, $5, 0, $6, NOW())
         ON CONFLICT (employee_id, year, leave_type)
         DO UPDATE SET accrued   = COALESCE((
                         SELECT SUM(ABS(qty)) FROM leave_ledger
                         WHERE employee_id = $1 AND leave_type = 'EL' AND ref_type = 'EL_ACCRUAL'
                           AND EXTRACT(YEAR FROM entry_date::date) = $3
                       ), 0),
                       used      = COALESCE((
                         SELECT SUM(ABS(qty)) FROM leave_ledger
                         WHERE employee_id = $1 AND leave_type = 'EL' AND ref_type = 'EL_PAID_LEAVE'
                           AND EXTRACT(YEAR FROM entry_date::date) = $3
                       ), 0),
                       available = GREATEST(leave_balances.opening
                         + COALESCE((
                             SELECT SUM(ABS(qty)) FROM leave_ledger
                             WHERE employee_id = $1 AND leave_type = 'EL' AND ref_type = 'EL_ACCRUAL'
                               AND EXTRACT(YEAR FROM entry_date::date) = $3
                           ), 0)
                         - COALESCE((
                             SELECT SUM(ABS(qty)) FROM leave_ledger
                             WHERE employee_id = $1 AND leave_type = 'EL' AND ref_type = 'EL_PAID_LEAVE'
                               AND EXTRACT(YEAR FROM entry_date::date) = $3
                           ), 0), 0),
                       last_updated_at = NOW()`,
        [re.employeeId, run.clientId, year, elAccrued, paidLeave, Math.max(elAccrued - paidLeave, 0)],
      );

      const balance = Math.max(Math.round((elAccrued - paidLeave) * 100) / 100, 0);
      results.push({ empCode, action: 'SEEDED', elAccrued, paidLeave, balance });
    }

    return { runId, month: monthStr, results };
  }

  /** One-time: remove employees from a run that are not in the March paysheet */
  async removeNotInSheet(runId: string) {
    const { MARCH_2026_SHEET_DATA } = await import('./march-2026-el-data');

    const run = await this.runRepo.findOne({ where: { id: runId } });
    if (!run) throw new BadRequestException('Payroll run not found');

    const runEmps = await this.runEmployeeRepo.find({ where: { runId } });
    const removed: string[] = [];

    for (const re of runEmps) {
      if (!MARCH_2026_SHEET_DATA[re.employeeCode]) {
        // Delete archive record
        await this.payslipArchiveRepo.delete({ runId, employeeCode: re.employeeCode });
        // Delete component values
        const cvRepo = this.runEmployeeRepo.manager.getRepository(PayrollRunComponentValueEntity);
        await cvRepo.delete({ runId, runEmployeeId: re.id });
        // Delete from run employees
        await this.runEmployeeRepo.delete({ id: re.id });
        removed.push(re.employeeCode);
      }
    }

    return { runId, removed };
  }
}
