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
import { LeavePolicyEntity } from '../ess/entities/leave-policy.entity';
import { AttendanceService } from '../attendance/attendance.service';
import { HolidayCalendarService } from '../attendance/holiday-calendar.service';
import { ReqUser } from '../access/access-scope.service';
import { evaluateFormula } from './engine/expression';
import { PayrollClientScopeService } from './payroll-client-scope.service';
import { PayrollQueryService } from './payroll-query.service';
import { PayrollFnfService } from './payroll-fnf.service';
import { PayrollRegistersService } from './payroll-registers.service';
import { PayrollInputService } from './payroll-input.service';
import { PayrollRunsService } from './payroll-runs.service';
import { PayrollPayslipsService } from './payroll-payslips.service';

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
    @InjectRepository(LeavePolicyEntity)
    private readonly leavePolicyRepo: Repository<LeavePolicyEntity>,
    private readonly notificationsSvc: NotificationsService,
    private readonly attendanceService: AttendanceService,
    private readonly holidayService: HolidayCalendarService,
    private readonly scopeService: PayrollClientScopeService,
    private readonly queryService: PayrollQueryService,
    private readonly fnfService: PayrollFnfService,
    private readonly registersService: PayrollRegistersService,
    private readonly inputService: PayrollInputService,
    private readonly runsService: PayrollRunsService,
    private readonly payslipsService: PayrollPayslipsService,
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

  private async assertPayrollAccessToClient(
    payrollUser: ReqUser,
    clientId: string,
    opts?: { allowReadOnly?: boolean },
  ) {
    return this.scopeService.assertPayrollAccessToClient(
      payrollUser,
      clientId,
      opts,
    );
  }

  private ensureClientOrBranchUser(user: ReqUser) {
    const isClient =
      !!user?.id && user?.roleCode === 'CLIENT' && !!user?.clientId;
    if (!isClient) {
      throw new BadRequestException(
        'Only client users can access this resource',
      );
    }
  }

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
      payrollBranchScope:
        dto?.payrollBranchScope === 'SELECTED' ? 'SELECTED' : 'ALL',
      payrollAllowedBranchIds:
        dto?.payrollBranchScope === 'SELECTED'
          ? Array.isArray(dto?.payrollAllowedBranchIds)
            ? dto.payrollAllowedBranchIds
            : []
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

  async clientUpdatePayrollInputStatus(
    user: ReqUser,
    payrollInputId: string,
    dto: ClientUpdatePayrollInputStatusDto,
  ) {
    return this.inputService.clientUpdatePayrollInputStatus(
      user,
      payrollInputId,
      dto,
    );
  }

  async clientGetPayrollInputStatusHistory(
    user: ReqUser,
    payrollInputId: string,
  ) {
    return this.inputService.clientGetPayrollInputStatusHistory(
      user,
      payrollInputId,
    );
  }

  async clientCreatePayrollInput(
    user: ReqUser,
    dto: ClientCreatePayrollInputDto,
  ) {
    return this.inputService.clientCreatePayrollInput(user, dto);
  }

  async clientListPayrollInputs(user: ReqUser, q: Record<string, any>) {
    return this.inputService.clientListPayrollInputs(user, q);
  }
  async clientListPayrollRuns(user: ReqUser, q: Record<string, any>) {
    return this.runsService.clientListPayrollRuns(user, q);
  }

  async createPayrollRun(user: ReqUser, dto: CreatePayrollRunDto) {
    return this.runsService.createPayrollRun(user, dto);
  }

  async deleteDraftPayrollRun(user: ReqUser, runId: string) {
    return this.runsService.deleteDraftPayrollRun(user, runId);
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
    const colPfEmployee = findCol([
      'pf employee',
      'employee pf',
      'pf emp',
      'pf deduction',
    ]);
    const colEsiEmployee = findCol([
      'esi employee',
      'employee esi',
      'esi emp',
      'esi deduction',
    ]);
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
      const pt = colPt ? this.numberFromCell(row.getCell(colPt).value) : null;
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

    const cvRepo = this.runEmployeeRepo.manager.getRepository(
      PayrollRunComponentValueEntity,
    );
    const runEmployees = await this.runEmployeeRepo.find({
      where: { runId: run.id },
    });
    const runEmpByCode = new Map(
      runEmployees.map((re) => [re.employeeCode, re.id]),
    );
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

  async listPayrollRuns(user: ReqUser, q: Record<string, any>) {
    return this.runsService.listPayrollRuns(user, q);
  }

  async processPayrollRun(user: ReqUser, runId: string) {
    return this.runsService.processPayrollRun(user, runId);
  }

  async seedMarchEl(runId: string) {
    return this.runsService.seedMarchEl(runId);
  }

  async removeNotInSheet(runId: string) {
    return this.runsService.removeNotInSheet(runId);
  }
  async clientUploadPayrollInputFile(
    user: ReqUser,
    payrollInputId: string,
    dto: ClientUploadPayrollInputFileDto,
    file: Express.Multer.File,
  ) {
    return this.inputService.clientUploadPayrollInputFile(
      user,
      payrollInputId,
      dto,
      file,
    );
  }

  async clientListPayrollInputFiles(user: ReqUser, payrollInputId: string) {
    return this.inputService.clientListPayrollInputFiles(user, payrollInputId);
  }

  async payrollListPayrollInputs(user: ReqUser, q: Record<string, any>) {
    return this.inputService.payrollListPayrollInputs(user, q);
  }
  async payrollUploadClientTemplate(
    user: ReqUser,
    clientId: string,
    file: Express.Multer.File,
    dto: { effectiveFrom?: string; effectiveTo?: string },
  ) {
    return this.inputService.payrollUploadClientTemplate(
      user,
      clientId,
      file,
      dto,
    );
  }

  async payrollGetClientTemplateMeta(user: ReqUser, clientId: string) {
    return this.inputService.payrollGetClientTemplateMeta(user, clientId);
  }

  async payrollDownloadClientTemplate(user: ReqUser, clientId: string) {
    return this.inputService.payrollDownloadClientTemplate(user, clientId);
  }

  async clientGetPayrollTemplateMeta(user: ReqUser) {
    return this.inputService.clientGetPayrollTemplateMeta(user);
  }

  async clientDownloadPayrollTemplate(user: ReqUser) {
    return this.inputService.clientDownloadPayrollTemplate(user);
  }

  async updatePayrollInputStatus(
    user: ReqUser,
    payrollInputId: string,
    dto: UpdatePayrollInputStatusDto,
  ) {
    return this.inputService.updatePayrollInputStatus(
      user,
      payrollInputId,
      dto,
    );
  }

  async listPayrollInputFilesForPayroll(user: ReqUser, payrollInputId: string) {
    return this.inputService.listPayrollInputFilesForPayroll(
      user,
      payrollInputId,
    );
  }

  async downloadPayrollInputFileForClient(user: ReqUser, fileId: string) {
    return this.inputService.downloadPayrollInputFileForClient(user, fileId);
  }

  async downloadPayrollInputFileForPayroll(user: ReqUser, fileId: string) {
    return this.inputService.downloadPayrollInputFileForPayroll(user, fileId);
  }
  async clientListRegistersRecords(user: ReqUser, q: Record<string, any>) {
    return this.registersService.clientListRegistersRecords(user, q);
  }

  async streamClientRegistersPack(
    user: ReqUser,
    q: Record<string, any>,
    res: Response,
  ) {
    return this.registersService.streamClientRegistersPack(user, q, res);
  }

  async clientUploadRegisterRecord(
    user: ReqUser,
    dto: ClientUploadRegisterRecordDto,
    file: Express.Multer.File,
  ) {
    return this.registersService.clientUploadRegisterRecord(user, dto, file);
  }

  async payrollUploadRegisterRecord(
    user: ReqUser,
    dto: any,
    file: Express.Multer.File,
  ) {
    return this.registersService.payrollUploadRegisterRecord(user, dto, file);
  }

  async payrollListRegistersRecords(user: ReqUser, q: Record<string, any>) {
    return this.registersService.payrollListRegistersRecords(user, q);
  }

  async streamPayrollRegistersPack(
    user: ReqUser,
    q: Record<string, any>,
    res: Response,
  ) {
    return this.registersService.streamPayrollRegistersPack(user, q, res);
  }

  async payrollListRegistersFormatted(user: ReqUser, q: Record<string, any>) {
    return this.registersService.payrollListRegistersFormatted(user, q);
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
    return this.scopeService.getAssignedClientIds(user);
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
    const statusFilter = String(q?.status || '').toUpperCase();
    if (statusFilter === 'ACTIVE') {
      qb.andWhere('e.is_active = TRUE');
    } else if (statusFilter === 'INACTIVE') {
      qb.andWhere('e.is_active = FALSE');
    } else if (statusFilter === 'EXITED') {
      qb.andWhere('e.is_active = FALSE');
      qb.andWhere('e.date_of_exit IS NOT NULL');
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
    return this.registersService.downloadRegisterForPayroll(user, registerId);
  }

  async downloadRegisterForClient(user: ReqUser, registerId: string) {
    return this.registersService.downloadRegisterForClient(user, registerId);
  }

  async listPayrollRunEmployees(user: ReqUser, runId: string) {
    return this.payslipsService.listPayrollRunEmployees(user, runId);
  }

  async generatePayslipPdfForPayroll(
    user: ReqUser,
    runId: string,
    employeeId: string,
  ) {
    return this.payslipsService.generatePayslipPdfForPayroll(
      user,
      runId,
      employeeId,
    );
  }

  async downloadArchivedPayslipForPayroll(
    user: ReqUser,
    runId: string,
    employeeId: string,
  ) {
    return this.payslipsService.downloadArchivedPayslipForPayroll(
      user,
      runId,
      employeeId,
    );
  }

  async archiveRunPayslips(user: ReqUser, runId: string) {
    return this.payslipsService.archiveRunPayslips(user, runId);
  }

  async streamPayslipsZip(user: ReqUser, runId: string, res: Response) {
    return this.payslipsService.streamPayslipsZip(user, runId, res);
  }

  async listPayslips(_user: ReqUser, q: Record<string, any>) {
    return this.payslipsService.listPayslips(_user, q);
  }

  async approveRegister(user: ReqUser, registerId: string) {
    return this.registersService.approveRegister(user, registerId);
  }

  async rejectRegister(user: ReqUser, registerId: string, reason?: string) {
    return this.registersService.rejectRegister(user, registerId, reason);
  }

  async auditorListRegisters(user: ReqUser, q: Record<string, any>) {
    return this.registersService.auditorListRegisters(user, q);
  }

  async downloadRegisterForAuditor(user: ReqUser, registerId: string) {
    return this.registersService.downloadRegisterForAuditor(user, registerId);
  }
  async listTemplates() {
    return this.inputService.listTemplates();
  }

  // ====================
  // PAYROLL QUERIES (TICKETS)
  // ====================

  async listQueries(user: ReqUser, q: Record<string, any>) {
    return this.queryService.listQueries(user, q);
  }

  async getQueryDetail(user: ReqUser, queryId: string) {
    return this.queryService.getQueryDetail(user, queryId);
  }

  async createQuery(user: ReqUser, dto: CreatePayrollQueryDto) {
    return this.queryService.createQuery(user, dto);
  }

  async addQueryMessage(user: ReqUser, queryId: string, message: string) {
    return this.queryService.addQueryMessage(user, queryId, message);
  }

  async resolveQuery(user: ReqUser, queryId: string, resolution: string) {
    return this.queryService.resolveQuery(user, queryId, resolution);
  }

  async updateQueryStatus(user: ReqUser, queryId: string, status: string) {
    return this.queryService.updateQueryStatus(user, queryId, status);
  }

  // ====================
  // FULL & FINAL (F&F) — delegated to PayrollFnfService
  // ====================
  async listFnf(user: ReqUser, q: Record<string, any>) {
    return this.fnfService.listFnf(user, q);
  }

  async createFnf(user: ReqUser, dto: CreateFnfDto) {
    return this.fnfService.createFnf(user, dto);
  }

  async updateFnfStatus(user: ReqUser, fnfId: string, dto: UpdateFnfStatusDto) {
    return this.fnfService.updateFnfStatus(user, fnfId, dto);
  }

  async saveFnfBreakup(
    user: ReqUser,
    fnfId: string,
    body: {
      settlementBreakup: Record<string, number>;
      manualOverride?: boolean;
      remarks?: string;
    },
  ) {
    return this.fnfService.saveFnfBreakup(user, fnfId, body);
  }

  async getFnfDetail(user: ReqUser, fnfId: string) {
    return this.fnfService.getFnfDetail(user, fnfId);
  }

  async uploadFnfDocument(
    user: ReqUser,
    fnfId: string,
    file: {
      fileName: string;
      filePath: string;
      fileSize: number;
      mimeType?: string;
    },
    docType: string,
    docName: string,
    remarks?: string,
  ) {
    return this.fnfService.uploadFnfDocument(
      user,
      fnfId,
      file,
      docType,
      docName,
      remarks,
    );
  }

  async listFnfDocuments(user: ReqUser, fnfId: string) {
    return this.fnfService.listFnfDocuments(user, fnfId);
  }

  async getFnfDocument(user: ReqUser, docId: string) {
    return this.fnfService.getFnfDocument(user, docId);
  }

  async deleteFnfDocument(user: ReqUser, docId: string) {
    return this.fnfService.deleteFnfDocument(user, docId);
  }

  async generateFnfDocumentPdf(
    user: ReqUser,
    fnfId: string,
    docType: string,
    override?: {
      pendingSalary?: number;
      leaveEncashment?: number;
      bonusArrears?: number;
      deductions?: number;
      recoveries?: number;
      settlementAmount?: number;
    },
  ) {
    return this.fnfService.generateFnfDocumentPdf(
      user,
      fnfId,
      docType,
      override,
    );
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

    await this.payslipsService.archiveRunPayslips(user, runId);

    return saved;
  }

  // ====================
  // ONE-TIME: Seed March 2026 EL from paysheet (delegated to PayrollRunsService)
  // ====================
}
