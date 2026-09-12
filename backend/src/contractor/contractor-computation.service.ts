import { PayrollDocumentReconciliationService } from '../payroll-reconciliation/payroll-document-reconciliation.service';
import {
  calculateRateCard,
  calculateRateCardSegments,
  validateRateCard,
} from './contractor-rate-card';
import { ContractorDaysService } from '../biometric/contractor-days.service';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as ExcelJS from 'exceljs';
import { IsNull, Repository } from 'typeorm';
import { AccessScopeService, ReqUser } from '../access/access-scope.service';
import { BranchContractorEntity } from '../branches/entities/branch-contractor.entity';
import { BranchEntity } from '../branches/entities/branch.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { PayrollClientSetupEntity } from '../payroll/entities/payroll-client-setup.entity';
import { StateSlabService } from '../payroll/services/state-slab.service';
import { UserEntity } from '../users/entities/user.entity';
import { ContractorEmployeeEntity } from './contractor-employees/entities/contractor-employee.entity';
import { MinimumWageEntity } from './contractor-employees/entities/minimum-wage.entity';
import {
  ContractorQuotationWageEntity,
  ContractorWageSkill,
} from './entities/contractor-quotation-wage.entity';
import { ContractorMcdComputationEntity } from './entities/contractor-mcd-computation.entity';

import {
  ContractorPayrollWorkflowService,
  DRAFT_PAYROLL_ROLES,
  auditorPayrollScope,
} from './contractor-payroll-workflow.service';

const SKILLS: ContractorWageSkill[] = [
  'UNSKILLED',
  'SEMI_SKILLED',
  'SKILLED',
  'HIGHLY_SKILLED',
];

type AttendanceComputeRow = Record<string, unknown>;

@Injectable()
export class ContractorComputationService {
  private readonly logger = new Logger(ContractorComputationService.name);
  constructor(
    @InjectRepository(ContractorQuotationWageEntity)
    private readonly quotationRepo: Repository<ContractorQuotationWageEntity>,
    @InjectRepository(ContractorMcdComputationEntity)
    private readonly computationRepo: Repository<ContractorMcdComputationEntity>,
    @InjectRepository(BranchContractorEntity)
    private readonly branchContractorRepo: Repository<BranchContractorEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(ContractorEmployeeEntity)
    private readonly employeeRepo: Repository<ContractorEmployeeEntity>,
    @InjectRepository(BranchEntity)
    private readonly branchRepo: Repository<BranchEntity>,
    @InjectRepository(MinimumWageEntity)
    private readonly minimumWageRepo: Repository<MinimumWageEntity>,
    @InjectRepository(PayrollClientSetupEntity)
    private readonly payrollSetupRepo: Repository<PayrollClientSetupEntity>,
    private readonly stateSlab: StateSlabService,
    private readonly scope: AccessScopeService,
    private readonly notifications: NotificationsService,
    private readonly workflow: ContractorPayrollWorkflowService,
    private readonly contractorDays: ContractorDaysService,
    private readonly reconciliation?: PayrollDocumentReconciliationService,
  ) {}

  async listQuotations(user: ReqUser, q: Record<string, string>) {
    const clientId = await this.resolveCrmClient(user, q.clientId);
    const where: any = { clientId };
    if (q.contractorUserId) where.contractorUserId = q.contractorUserId;
    const data = await this.quotationRepo.find({
      where,
      order: {
        contractorUserId: 'ASC',
        skillCategory: 'ASC',
        effectiveFrom: 'DESC',
      },
    });
    return { data, total: data.length };
  }

  async listComputations(user: ReqUser, q: Record<string, string>) {
    const clientId = await this.resolveCrmClient(user, q.clientId);
    return this.listComputationsForScope(user, { ...q, clientId });
  }

  async listComputationsForScope(user: ReqUser, q: Record<string, string>) {
    const clientId = this.scope.resolveClientId(user, q.clientId);
    if (!clientId) throw new BadRequestException('clientId is required');
    await this.scope.assertClientAllowed(user, clientId);
    if (user.roleCode === 'CCO') {
      await this.scope.assertCcoClientAllowed(user, clientId);
      if (q.branchId) await this.scope.assertCcoBranchAllowed(user, q.branchId);
    }
    const qb = this.computationRepo
      .createQueryBuilder('c')
      .leftJoin(UserEntity, 'u', 'u.id = c.contractor_user_id')
      .leftJoin(
        'contractor_payroll_versions',
        'pv',
        'pv.client_id=c.client_id AND pv.contractor_user_id=c.contractor_user_id AND pv.branch_id IS NOT DISTINCT FROM c.branch_id AND pv.period_month=c.period_month AND pv.is_current',
      )
      .leftJoin('client_branches', 'b', 'b.id = c.branch_id')
      .select([
        'c.id AS "id"',
        `COALESCE(pv.status, 'DRAFT') AS "payrollStatus"`,
        'pv.version AS "payrollVersion"',
        'c.upload_id AS "uploadId"',
        'c.client_id AS "clientId"',
        'c.branch_id AS "branchId"',
        'b.branchname AS "branchName"',
        'c.contractor_user_id AS "contractorUserId"',
        'u.name AS "contractorName"',
        'c.period_month AS "periodMonth"',
        'c.row_number AS "rowNumber"',
        'c.employee_code AS "employeeCode"',
        'c.employee_name AS "employeeName"',
        'c.skill_category AS "skillCategory"',
        'c.days_worked AS "daysWorked"',
        'c.quotation_daily_wage AS "quotationDailyWage"',
        'c.mcd_daily_wage AS "mcdDailyWage"',
        'c.minimum_daily_wage AS "minimumDailyWage"',
        'c.employee_daily_wage AS "employeeDailyWage"',
        'c.payable_daily_wage AS "payableDailyWage"',
        'c.basic_wage AS "basicWage"',
        'c.other_earnings AS "otherEarnings"',
        'c.gross_wage AS "grossWage"',
        'c.total_earnings AS "totalEarnings"',
        'c.pf_wage AS "pfWage"',
        'c.pf_deduction AS "pfDeduction"',
        'c.pf_employer_contribution AS "pfEmployerContribution"',
        'c.esi_deduction AS "esiDeduction"',
        'c.esi_employer_contribution AS "esiEmployerContribution"',
        'c.pt_deduction AS "ptDeduction"',
        'c.lwf_employee_deduction AS "lwfEmployeeDeduction"',
        'c.lwf_employer_contribution AS "lwfEmployerContribution"',
        'c.total_employer_contribution AS "totalEmployerContribution"',
        'c.net_salary AS "netSalary"',
        'c.match_status AS "matchStatus"',
        'c.mismatch_reason AS "mismatchReason"',
        'c.calculation_snapshot AS "calculationSnapshot"',
        'c.created_at AS "createdAt"',
      ])
      .where('c.client_id = :clientId', { clientId });

    if (user.roleCode === 'AUDITOR')
      qb.andWhere(auditorPayrollScope('c', ':payrollAuditorId'), {
        payrollAuditorId: user.id,
      });
    if (!DRAFT_PAYROLL_ROLES.includes(user.roleCode)) {
      qb.andWhere("pv.status IN ('CRM_APPROVED','VERIFIED_LOCKED')");
    }
    const scope = await this.scope.getScope(user);
    this.scope.applyToQb(qb, scope, {
      clientPath: 'c.client_id',
      branchPath: 'c.branch_id',
    });

    if (user.roleCode === 'CONTRACTOR') {
      qb.andWhere('c.contractor_user_id = :currentContractorUserId', {
        currentContractorUserId: user.id,
      });
    }

    if (q.contractorUserId) {
      qb.andWhere('c.contractor_user_id = :contractorUserId', {
        contractorUserId: q.contractorUserId,
      });
    }
    if (q.branchId)
      qb.andWhere('c.branch_id = :branchId', { branchId: q.branchId });
    if (q.periodMonth)
      qb.andWhere('c.period_month = :periodMonth', {
        periodMonth: q.periodMonth,
      });
    if (q.matchStatus)
      qb.andWhere('c.match_status = :matchStatus', {
        matchStatus: q.matchStatus,
      });

    const limit = Math.min(Math.max(Number(q.limit ?? 200), 1), 500);
    const offset = Math.max(Number(q.offset ?? 0), 0);
    const totalRow = await qb
      .clone()
      .select('COUNT(*)', 'total')
      .getRawOne<{ total: string }>();
    const total = Number(totalRow?.total ?? 0);
    const data = await qb
      .orderBy('c.created_at', 'DESC')
      .addOrderBy('c.row_number', 'ASC')
      .limit(limit)
      .offset(offset)
      .getRawMany();
    return { data, total, limit, offset };
  }

  async uploadAttendanceExcel(
    user: ReqUser,
    dto: {
      clientId?: string;
      contractorUserId?: string;
      branchId?: string;
      periodMonth?: string;
      uploadId?: string;
    },
    file: Express.Multer.File,
  ) {
    if (!file?.buffer) throw new BadRequestException('Excel file is required');
    if (!dto.periodMonth || !/^\d{4}-\d{2}$/.test(dto.periodMonth)) {
      throw new BadRequestException('periodMonth is required as YYYY-MM');
    }
    const sheet = await this.firstSheet(file.buffer);
    const headers = this.headers(sheet);
    const rows: AttendanceComputeRow[] = [];
    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
      const row = sheet.getRow(rowNumber);
      const employeeName = this.cellString(row, headers, [
        'employee_name',
        'employee',
        'name',
        'worker_name',
      ]);
      const employeeCode = this.cellString(row, headers, [
        'employee_code',
        'worker_code',
        'code',
      ]);
      const daysWorked = this.cellNumber(row, headers, [
        'days_worked',
        'payable_days',
        'present_days',
        'days',
      ]);
      if (!employeeName && !employeeCode && daysWorked == null) continue;
      if (daysWorked == null)
        throw new BadRequestException(
          `Payable days are required on row ${rowNumber}`,
        );
      rows.push({
        employee_code: employeeCode,
        attendance_date: this.cellString(row, headers, [
          'attendance_date',
          'date',
        ]),
        employee_name: employeeName,
        skill_category: this.cellString(row, headers, [
          'skill_category',
          'skill',
          'category',
        ]),
        days_worked: daysWorked ?? 0,
        ot_hours: this.cellString(row, headers, ['ot_hours', 'overtime_hours'])
          ? Number(
              this.cellString(row, headers, ['ot_hours', 'overtime_hours']),
            )
          : 0,
      });
    }
    let submittedRows = rows;
    if (rows.some((row) => row.attendance_date)) {
      const grouped = new Map<string, AttendanceComputeRow>();
      for (const row of rows) {
        const code = this.unknownToString(row.employee_code);
        let group = grouped.get(code);
        if (!group) {
          group = {
            employee_code: code,
            employee_name: row.employee_name,
            days_worked: 0,
            ot_hours: 0,
            daily_attendance: [],
          };
          grouped.set(code, group);
        }
        group.days_worked = Number(group.days_worked) + Number(row.days_worked);
        group.ot_hours = Number(group.ot_hours) + Number(row.ot_hours || 0);
        (group.daily_attendance as any[]).push({
          date: row.attendance_date,
          days: Number(row.days_worked),
          hours: Number(row.ot_hours || 0),
        });
      }
      submittedRows = [...grouped.values()];
    }
    return this.computeMcdRows(user, {
      clientId: dto.clientId ?? '',
      contractorUserId: dto.contractorUserId ?? '',
      branchId: dto.branchId ?? null,
      periodMonth: dto.periodMonth,
      uploadId: dto.uploadId ?? null,
      rows: submittedRows,
    });
  }

  async uploadQuotationExcel(
    user: ReqUser,
    dto: {
      clientId?: string;
      contractorUserId?: string;
      branchId?: string;
      effectiveFrom?: string;
    },
    file: Express.Multer.File,
  ) {
    if (!['CRM', 'ADMIN'].includes(user.roleCode))
      throw new ForbiddenException(
        'Only CRM can maintain contractor wage rates',
      );
    if (!file?.buffer) throw new BadRequestException('Excel file is required');
    if (!dto.clientId) throw new BadRequestException('clientId is required');
    if (!dto.contractorUserId)
      throw new BadRequestException('contractorUserId is required');
    const clientId = await this.resolveCrmClient(user, dto.clientId);
    await this.assertContractorLinked(
      clientId,
      dto.contractorUserId,
      dto.branchId,
    );

    const sheet = this.normalizeQuotationSheet(
      await this.firstSheet(file.buffer),
      dto.effectiveFrom,
    );
    const headers = this.headers(sheet);
    let inserted = 0;
    const updated = 0;
    let errors = 0;
    const results: any[] = [];

    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
      const row = sheet.getRow(rowNumber);
      const skillRaw = this.cellString(row, headers, [
        'skill_category',
        'skill',
        'category',
      ]);
      let dailyWage = this.cellNumber(row, headers, [
        'daily_wage',
        'quotation_daily_wage',
        'wage_rate',
        'rate',
      ]);
      if (!skillRaw && dailyWage == null) continue;
      try {
        const skillCategory = this.normalizeSkill(skillRaw);
        const designation = this.cellString(row, headers, ['designation'])
          .trim()
          .toUpperCase();
        if (designation.length > 120)
          throw new BadRequestException('Designation exceeds 120 characters');
        const cardText = this.cellString(row, headers, ['rate_card_json']);
        const rateCard = cardText
          ? validateRateCard(JSON.parse(cardText))
          : null;
        if (rateCard)
          dailyWage =
            calculateRateCard(rateCard, rateCard.divisor).amounts.BASIC_DA /
            rateCard.divisor;
        if (!dailyWage || dailyWage <= 0)
          throw new BadRequestException('daily_wage must be greater than zero');
        const effectiveFrom =
          this.cellString(row, headers, ['effective_from']) ||
          dto.effectiveFrom;
        if (!effectiveFrom || !this.validDate(effectiveFrom)) {
          throw new BadRequestException(
            'effective_from is required as YYYY-MM-DD',
          );
        }
        const effectiveTo =
          this.cellString(row, headers, ['effective_to']) || null;
        if (
          effectiveTo &&
          (!this.validDate(effectiveTo) || effectiveTo < effectiveFrom)
        )
          throw new BadRequestException(
            'effective_to must be a valid date on or after effective_from',
          );
        const where = {
          clientId,
          contractorUserId: dto.contractorUserId,
          branchId: dto.branchId ?? IsNull(),
          skillCategory,
          designation,
          effectiveFrom,
        } as any;
        await this.quotationRepo.manager.transaction(async (manager) => {
          await manager.query(
            'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
            [
              [
                'contractor-rate',
                clientId,
                dto.contractorUserId,
                dto.branchId || '',
                skillCategory,
                designation,
                effectiveFrom,
              ]
                .join(':')
                .toLowerCase(),
            ],
          );
          const rates = manager.getRepository(ContractorQuotationWageEntity);
          const existing = await rates.findOne({ where });
          if (existing)
            throw new BadRequestException(
              'Rate versions cannot be overwritten; use a new effective date',
            );
          const entity =
            existing ??
            rates.create({
              clientId,
              contractorUserId: dto.contractorUserId,
              branchId: dto.branchId ?? null,
              skillCategory,
              designation,
              effectiveFrom,
              createdByUserId: user.id,
            });
          entity.rateCard = rateCard;
          entity.dailyWage = rateCard
            ? calculateRateCard(rateCard, rateCard.divisor).amounts.BASIC_DA /
              rateCard.divisor
            : dailyWage!;
          if (!Number.isFinite(entity.dailyWage) || entity.dailyWage <= 0)
            throw new BadRequestException(
              'A positive BASIC_DA earning is required',
            );
          entity.monthlyWage = this.cellNumber(row, headers, [
            'monthly_wage',
            'monthly_rate',
          ]);
          entity.effectiveTo = effectiveTo;
          entity.source =
            this.cellString(row, headers, ['source']) || file.originalname;
          entity.notes =
            this.cellString(row, headers, ['notes', 'remarks']) || null;
          await rates.save(entity);
        });
        inserted++;
        results.push({
          rowNumber,
          skillCategory,
          outcome: 'inserted',
        });
      } catch (err) {
        errors++;
        results.push({
          rowNumber,
          skillCategory: skillRaw,
          outcome: 'error',
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return {
      total: inserted + updated + errors,
      inserted,
      updated,
      errors,
      results,
    };
  }

  async computeMcdRows(
    user: ReqUser,
    input: {
      clientId: string;
      contractorUserId: string;
      branchId?: string | null;
      periodMonth: string;
      uploadId?: string | null;
      rows: AttendanceComputeRow[];
    },
  ) {
    return this.submitAttendanceRows(user, input);
  }

  async submitSystemAttendance(
    user: ReqUser,
    input: { branchId: string; periodMonth: string },
  ) {
    if (user.roleCode !== 'CONTRACTOR' || !user.clientId)
      throw new ForbiddenException('Contractor access required');
    if (
      !/^\d{4}-(0[1-9]|1[0-2])$/.test(input.periodMonth || '') ||
      !input.branchId
    )
      throw new BadRequestException('Select a branch and payroll month');
    await this.scope.assertBranchAllowed(user, input.branchId);
    await this.assertContractorLinked(user.clientId, user.id, input.branchId);
    const from = input.periodMonth + '-01';
    const day = new Date(
      Number(input.periodMonth.slice(0, 4)),
      Number(input.periodMonth.slice(5)),
      0,
    ).getDate();
    const summary = await this.contractorDays.summarise(
      user.clientId,
      from,
      input.periodMonth + '-' + day,
      user.id,
      input.branchId,
    );
    if (summary.unpayable.length)
      throw new BadRequestException(
        'Assign employee IDs to all workers before submitting device attendance',
      );
    return this.submitAttendanceRows(
      user,
      {
        clientId: user.clientId,
        contractorUserId: user.id,
        ...input,
        rows: summary.rows.map((row) => ({
          employee_code: row.employeeCode,
          days_worked: row.daysWorked,
          ...(row.attendanceDates
            ? {
                daily_attendance: row.attendanceDates.map((date) => ({
                  date,
                  days: 1,
                  hours: 0,
                })),
              }
            : {}),
        })),
      },
      'SYSTEM',
    );
  }

  private async submitAttendanceRows(
    user: ReqUser,
    input: {
      clientId: string;
      contractorUserId: string;
      branchId?: string | null;
      periodMonth: string;
      uploadId?: string | null;
      rows: Array<AttendanceComputeRow>;
    },
    source: 'EXCEL' | 'SYSTEM' = 'EXCEL',
  ) {
    if (user.roleCode !== 'CONTRACTOR')
      throw new ForbiddenException(
        'Only the contractor can submit Excel attendance',
      );
    const clientId =
      user.roleCode === 'CONTRACTOR' ? user.clientId : input.clientId;
    if (!clientId) throw new BadRequestException('clientId is required');
    await this.scope.assertClientAllowed(user, clientId);
    const contractorUserId =
      user.roleCode === 'CONTRACTOR' ? user.id : input.contractorUserId;
    if (!contractorUserId)
      throw new BadRequestException('contractorUserId is required');
    await this.assertContractorLinked(
      clientId,
      contractorUserId,
      input.branchId ?? undefined,
    );
    if (input.branchId)
      await this.scope.assertBranchAllowed(user, input.branchId);

    if (!Array.isArray(input.rows)) {
      throw new BadRequestException('rows must be an array');
    }
    const MAX_ROWS = 1000;
    if (input.rows.length > MAX_ROWS) {
      throw new BadRequestException(`rows must not exceed ${MAX_ROWS} items`);
    }
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.periodMonth || ''))
      throw new BadRequestException('periodMonth must be YYYY-MM');
    if (!input.branchId)
      throw new BadRequestException(
        'Select the deployment branch before calculating payroll',
      );
    if (!input.rows.length)
      throw new BadRequestException('Attendance must contain employees');
    const seen = new Set<string>();
    const daysInMonth = new Date(
      Number(input.periodMonth.slice(0, 4)),
      Number(input.periodMonth.slice(5)),
      0,
    ).getDate();
    for (const row of input.rows) {
      if (!row || typeof row !== 'object')
        throw new BadRequestException('Invalid attendance row');
      const code = this.unknownToString(
        row.employee_code ?? row.worker_code ?? row.code ?? '',
      )
        .trim()
        .toLowerCase();
      if (!code || seen.has(code))
        throw new BadRequestException(
          'Each attendance row needs a unique employee code',
        );
      seen.add(code);
      const days = Number(row.days_worked ?? row.days);
      if (!Number.isFinite(days) || days < 0 || days > daysInMonth)
        throw new BadRequestException(
          'Payable days must be within the selected month',
        );
      // Contractor input is attendance, not a source of wage or deduction authority.
      for (const field of [
        'daily_wage',
        'wage_rate',
        'basic_wage',
        'basic',
        'da',
        'dearness_allowance',
        'hra',
        'ot',
        'ot_amount',
        'arrears',
        'attendance_bonus',
        'attn_bonus',
        'bonus',
        'incentive',
        'other_earnings',
        'other_deductions',
        'special_allowance',
        'other_allowance',
        'regular_allowance',
        'universal_allowance',
        'conveyance',
      ]) {
        if (row[field] != null && row[field] !== '' && Number(row[field]) !== 0)
          throw new BadRequestException(
            'Upload attendance only. Wage components, overtime and adjustments require an approved rate/adjustment workflow.',
          );
        delete row[field];
      }
      const hours = Number(row.ot_hours || 0);
      if (!Number.isFinite(hours) || hours < 0 || hours > daysInMonth * 24)
        throw new BadRequestException('Invalid overtime hours');
      if (row.daily_attendance)
        this.validateDatedAttendance(
          row.daily_attendance,
          input.periodMonth,
          days,
          hours,
        );
      delete row.pf_ceiling_enabled;
    }
    // Store only attendance fields; wages in vendor documents are reconciliation evidence.
    const attendanceRows: AttendanceComputeRow[] = [];
    for (const row of input.rows) {
      const code = this.unknownToString(
        row.employee_code ?? row.worker_code ?? row.code,
      ).trim();
      const employee = await this.findEmployee(
        clientId,
        contractorUserId,
        input.branchId,
        code,
        '',
      );
      if (!employee)
        throw new BadRequestException(
          'Register and assign every attendance employee before submission',
        );
      attendanceRows.push({
        employee_code: employee.employeeCode,
        employee_name: employee.name,
        days_worked: Number(row.days_worked ?? row.days),
        ...(Number(row.ot_hours) ? { ot_hours: Number(row.ot_hours) } : {}),
        ...(row.daily_attendance
          ? { daily_attendance: row.daily_attendance }
          : {}),
      });
    }
    if (input.uploadId) {
      const [document] = await this.computationRepo.manager.query(
        'SELECT id FROM contractor_documents WHERE id=$1 AND client_id=$2 AND contractor_user_id=$3 AND branch_id=$4 AND doc_month=$5',
        [
          input.uploadId,
          clientId,
          contractorUserId,
          input.branchId,
          input.periodMonth,
        ],
      );
      if (!document)
        throw new BadRequestException(
          'Attendance document does not match this contractor, branch and month',
        );
    }
    const key = {
      client_id: clientId,
      contractor_user_id: contractorUserId,
      branch_id: input.branchId,
      period_month: input.periodMonth,
    };
    return this.computationRepo.manager.transaction(async (manager) => {
      await this.workflow.lock(manager, key);
      const [previous] = await manager.query(
        'SELECT status FROM contractor_payroll_versions WHERE client_id=$1 AND contractor_user_id=$2 AND branch_id=$3 AND period_month=$4 AND is_current',
        [clientId, contractorUserId, input.branchId, input.periodMonth],
      );
      if (
        previous &&
        !['DRAFT', 'RETURNED', 'REOPENED'].includes(previous.status)
      )
        throw new ConflictException(
          'Return or reopen payroll before replacing attendance',
        );
      await manager.query(
        'UPDATE contractor_attendance_batches SET is_current=false WHERE client_id=$1 AND contractor_user_id=$2 AND branch_id=$3 AND period_month=$4 AND is_current',
        [clientId, contractorUserId, input.branchId, input.periodMonth],
      );
      const [batch] = await manager.query(
        `INSERT INTO contractor_attendance_batches(client_id,contractor_user_id,branch_id,period_month,rows_snapshot,submitted_by,source,source_document_id)
         VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,$8) RETURNING id,status`,
        [
          clientId,
          contractorUserId,
          input.branchId,
          input.periodMonth,
          JSON.stringify(attendanceRows),
          user.id,
          source,
          input.uploadId || null,
        ],
      );
      return {
        ...batch,
        total: attendanceRows.length,
        message: 'Attendance submitted for branch approval',
      };
    });
  }

  private isAttendanceApprover(user: ReqUser) {
    return (
      user.roleCode === 'BRANCH_DESK' ||
      (user.roleCode === 'CLIENT' && user.userType === 'BRANCH')
    );
  }

  async listAttendance(user: ReqUser, query: Record<string, string>) {
    if (user.roleCode !== 'CONTRACTOR' && !this.isAttendanceApprover(user))
      return { data: [] };
    const clientId = this.scope.resolveClientId(user, query.clientId);
    if (!clientId) throw new BadRequestException('Select a client');
    await this.scope.assertClientAllowed(user, clientId);
    const offset = Number(query.offset || 0);
    if (!Number.isSafeInteger(offset) || offset < 0)
      throw new BadRequestException('Invalid page offset');
    const params: unknown[] = [clientId];
    const where = ['a.client_id=$1', 'a.is_current'];
    if (user.roleCode === 'CONTRACTOR') {
      params.push(user.id);
      where.push('a.contractor_user_id=$' + params.length);
    } else {
      params.push(user.branchIds || []);
      where.push('a.branch_id=ANY($' + params.length + '::uuid[])');
    }
    if (query.periodMonth) {
      params.push(query.periodMonth);
      where.push('a.period_month=$' + params.length);
    }
    const data = await this.computationRepo.manager.query(
      `SELECT a.*, b.branchname AS branch_name, u.name AS contractor_name
       FROM contractor_attendance_batches a JOIN client_branches b ON b.id=a.branch_id
       JOIN users u ON u.id=a.contractor_user_id WHERE ${where.join(' AND ')}
       ORDER BY a.created_at DESC, a.id DESC LIMIT 51 OFFSET ${offset}`,
      params,
    );
    return {
      hasMore: data.length > 50,
      data: data.slice(0, 50).map((row) => ({
        ...row,
        rows_snapshot: row.approved_rows_snapshot || row.rows_snapshot,
        canReview: this.isAttendanceApprover(user) && row.status === 'PENDING',
      })),
    };
  }

  async reviewAttendance(
    user: ReqUser,
    id: string,
    decision: string,
    remarks: string,
    adjustments?: Array<{
      employee_code: string;
      days_worked: number;
      ot_hours?: number;
    }>,
  ) {
    if (!this.isAttendanceApprover(user))
      throw new ForbiddenException(
        'Only the assigned branch user can approve attendance',
      );
    if (!['approve', 'return'].includes(decision))
      throw new BadRequestException('Invalid attendance decision');
    if (
      typeof remarks !== 'string' ||
      remarks.trim().length < 5 ||
      remarks.length > 2000
    )
      throw new BadRequestException(
        'Provide review remarks (5 to 2000 characters)',
      );
    const [batch] = await this.computationRepo.manager.query(
      'SELECT * FROM contractor_attendance_batches WHERE id=$1',
      [id],
    );
    if (!batch) throw new NotFoundException('Attendance batch not found');
    if (
      user.clientId !== batch.client_id ||
      !user.branchIds?.includes(batch.branch_id)
    )
      throw new ForbiddenException(
        'Attendance is outside your assigned branch',
      );
    await this.scope.assertBranchAllowed(user, batch.branch_id);
    let approvedRows = batch.rows_snapshot;
    if (decision === 'approve' && adjustments !== undefined) {
      if (
        !Array.isArray(adjustments) ||
        adjustments.length !== batch.rows_snapshot.length
      )
        throw new BadRequestException(
          'Review must contain every submitted employee',
        );
      const seen = new Set<string>(),
        daysInMonth = new Date(
          Number(batch.period_month.slice(0, 4)),
          Number(batch.period_month.slice(5)),
          0,
        ).getDate();
      approvedRows = adjustments.map((row) => {
        const original = batch.rows_snapshot.find(
          (item) => item.employee_code === row.employee_code,
        );
        if (
          !original ||
          seen.has(row.employee_code) ||
          typeof row.days_worked !== 'number' ||
          !Number.isFinite(row.days_worked) ||
          row.days_worked < 0 ||
          row.days_worked > daysInMonth ||
          !Number.isFinite(Number(row.ot_hours || 0)) ||
          Number(row.ot_hours || 0) < 0 ||
          Number(row.ot_hours || 0) > daysInMonth * 24
        )
          throw new BadRequestException('Invalid branch attendance correction');
        seen.add(row.employee_code);
        const changed =
          Number(original.days_worked) !== row.days_worked ||
          Number(original.ot_hours || 0) !== Number(row.ot_hours || 0);
        return {
          ...original,
          days_worked: row.days_worked,
          ot_hours: Number(row.ot_hours || 0),
          ...(changed ? { daily_attendance: undefined } : {}),
        };
      });
    }
    const review = async (manager: import('typeorm').EntityManager) => {
      const [current] = await manager.query(
        'SELECT * FROM contractor_attendance_batches WHERE id=$1 FOR UPDATE',
        [id],
      );
      if (!current?.is_current || current.status !== 'PENDING')
        throw new ConflictException(
          'Attendance was already reviewed or replaced. Refresh the queue.',
        );
      await manager.query(
        'UPDATE contractor_attendance_batches SET status=$2,reviewed_by=$3,reviewed_at=now(),remarks=$4,approved_rows_snapshot=$5::jsonb WHERE id=$1',
        [
          id,
          decision === 'approve' ? 'APPROVED' : 'RETURNED',
          user.id,
          remarks.trim(),
          decision === 'approve' ? JSON.stringify(approvedRows) : null,
        ],
      );
    };
    if (decision === 'return') {
      await this.computationRepo.manager.transaction(async (manager) => {
        await this.workflow.lock(manager, batch);
        await review(manager);
      });
      return { id, status: 'RETURNED' };
    }
    const result = await this.workflow.saveDraft(
      user,
      batch,
      async () => {
        const output: ContractorMcdComputationEntity[] = [];
        for (let i = 0; i < approvedRows.length; i++) {
          output.push(
            await this.computeOne(
              batch.client_id,
              batch.contractor_user_id,
              batch.branch_id,
              batch.period_month,
              batch.source_document_id || null,
              i + 1,
              approvedRows[i],
            ),
          );
        }
        return output;
      },
      review,
    );
    // saveDraft resolves after the approval and payroll transaction commits.
    const mismatches = result.saved.filter(
      (row) => row.matchStatus !== 'MATCHED',
    );
    if (mismatches.length) {
      await this.notifyCrm(
        batch.client_id,
        batch.branch_id,
        batch.contractor_user_id,
        batch.period_month,
        mismatches,
      );
    }
    await this.reconciliation
      ?.checkPeriod(
        batch.client_id,
        batch.branch_id,
        batch.contractor_user_id,
        batch.period_month,
      )
      .catch(() =>
        this.logger.warn(
          'Payroll document checks need a retry from the auditor portal',
        ),
      );
    return {
      id,
      status: 'APPROVED',
      total: result.saved.length,
      version: result.version,
    };
  }

  private async computeOne(
    clientId: string,
    contractorUserId: string,
    branchId: string | null,
    periodMonth: string,
    uploadId: string | null,
    rowNumber: number,
    raw: AttendanceComputeRow,
  ) {
    const employeeCode =
      this.unknownToString(
        raw['employee_code'] ?? raw['worker_code'] ?? raw['code'],
      ) || null;
    const rawEmployeeName = this.unknownToString(
      raw['employee_name'] ?? raw['worker_name'] ?? raw['name'],
    );
    const employee = await this.findEmployee(
      clientId,
      contractorUserId,
      branchId,
      employeeCode,
      rawEmployeeName,
    );
    if (!employee)
      throw new BadRequestException(
        'Attendance employee is not active in this contractor deployment',
      );
    const skillCategory = this.normalizeSkill(employee.skillCategory ?? '');
    const suppliedSkill = raw['skill_category'] ?? raw['skill'];
    if (
      suppliedSkill &&
      this.normalizeSkill(this.unknownToString(suppliedSkill)) !== skillCategory
    )
      throw new BadRequestException(
        'Attendance skill must match the employee master',
      );
    const daysWorked = this.num(raw['days_worked'] ?? raw['days']);
    const monthStart = new Date(`${periodMonth}-01T00:00:00Z`);
    const monthEnd = new Date(
      Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0),
    );
    const start = employee.dateOfJoining
      ? new Date(
          Math.max(
            monthStart.getTime(),
            new Date(employee.dateOfJoining).getTime(),
          ),
        )
      : monthStart;
    const end = employee.dateOfExit
      ? new Date(
          Math.min(monthEnd.getTime(), new Date(employee.dateOfExit).getTime()),
        )
      : monthEnd;
    const eligibleDays = Math.max(
      0,
      Math.floor((end.getTime() - start.getTime()) / 86400000) + 1,
    );
    if (daysWorked > eligibleDays)
      throw new BadRequestException(
        'Payable days exceed the employee employment dates',
      );
    const mcdDailyWage = this.optionalNum(
      raw['daily_wage'] ?? raw['wage_rate'],
    );
    const otherEarnings =
      this.num(raw['ot']) +
      this.num(raw['arrears']) +
      this.num(raw['attendance_bonus'] ?? raw['attn_bonus']) +
      this.num(raw['bonus']) +
      this.num(raw['incentive']) +
      this.num(raw['other_earnings']);
    const branch = branchId
      ? await this.branchRepo.findOne({
          where: { id: branchId },
          select: ['id', 'stateCode', 'clientId'],
        })
      : null;
    const stateCode = branch?.stateCode ?? employee?.stateCode ?? null;
    const [initialQuote, setup, minimumDailyWage] = await Promise.all([
      this.findQuotation(
        clientId,
        contractorUserId,
        branchId,
        skillCategory,
        `${periodMonth}-01`,
        employee.designation || '',
      ),
      this.findPayrollSetup(clientId),
      this.findMinimumDailyWage(stateCode, skillCategory, `${periodMonth}-01`),
    ]);
    const candidates = await this.quotationRepo
      .createQueryBuilder('q')
      .where(
        'q.client_id = :clientId AND q.contractor_user_id = :contractorUserId',
        { clientId, contractorUserId },
      )
      .andWhere('q.skill_category = :skillCategory', { skillCategory })
      .andWhere("(q.designation = '' OR q.designation = :designation)", {
        designation: (employee.designation || '').trim().toUpperCase(),
      })
      .andWhere('(q.branch_id IS NULL OR q.branch_id = :branchId)', {
        branchId,
      })
      .andWhere(
        'q.effective_from <= :end AND (q.effective_to IS NULL OR q.effective_to >= :start)',
        {
          start: periodMonth + '-01',
          end: monthEnd.toISOString().slice(0, 10),
        },
      )
      .orderBy('CASE WHEN q.branch_id IS NOT NULL THEN 1 ELSE 0 END', 'DESC')
      .addOrderBy('q.designation', 'DESC')
      .addOrderBy('q.effective_from', 'DESC')
      .getMany();
    const quoteForDate = (date: string) =>
      candidates.find(
        (q) =>
          q.effectiveFrom <= date && (!q.effectiveTo || q.effectiveTo >= date),
      );
    const selectedIds = new Set<string | undefined>();
    for (let day = 1; day <= monthEnd.getUTCDate(); day++)
      selectedIds.add(
        quoteForDate(periodMonth + '-' + String(day).padStart(2, '0'))?.id,
      );
    const dated = raw.daily_attendance as
      | Array<{ date: string; days: number; hours: number }>
      | undefined;
    if (dated) {
      this.validateDatedAttendance(
        dated,
        periodMonth,
        daysWorked,
        Number(raw.ot_hours || 0),
      );
      if (
        dated.some(
          (r) =>
            (r.days > 0 || r.hours > 0) &&
            (new Date(r.date).getTime() < start.getTime() ||
              new Date(r.date).getTime() > end.getTime()),
        )
      )
        throw new BadRequestException(
          'Dated attendance falls outside employee employment dates',
        );
    }
    if (selectedIds.size > 1 && !dated)
      throw new BadRequestException(
        'Quotation changes within this month. Upload attendance with attendance_date, days_worked and ot_hours so each date uses its applicable rate',
      );
    const segments: Array<{
      quote: ContractorQuotationWageEntity;
      days: number;
      hours: number;
    }> = [];
    if (dated && selectedIds.size > 1) {
      for (const entry of dated) {
        if (!entry.days && !entry.hours) continue;
        const applicable = quoteForDate(entry.date);
        if (!applicable?.rateCard)
          throw new BadRequestException(
            'CRM must configure component rate cards covering every payable date before approving revised-rate attendance',
          );
        let segment = segments.find((x) => x.quote.id === applicable.id);
        if (!segment) {
          segment = { quote: applicable, days: 0, hours: 0 };
          segments.push(segment);
        }
        segment.days += entry.days;
        segment.hours += Number(entry.hours || 0);
      }
      segments.sort((a, b) =>
        a.quote.effectiveFrom.localeCompare(b.quote.effectiveFrom),
      );
    }
    const quote = segments[segments.length - 1]?.quote || initialQuote;
    const employeeDailyWage = this.resolveEmployeeDailyWage(employee);
    const payableDailyWage = this.round(quote?.dailyWage ?? 0);
    const basicWage = this.round(
      this.optionalNum(raw['basic_wage'] ?? raw['basic']) ??
        payableDailyWage * daysWorked,
    );
    const daWage = this.round(this.num(raw['da'] ?? raw['dearness_allowance']));
    const hraWage = this.round(this.num(raw['hra']));
    const regularAllowance = this.round(
      this.num(raw['special_allowance']) +
        this.num(raw['other_allowance']) +
        this.num(raw['regular_allowance']) +
        this.num(raw['universal_allowance']),
    );
    const conveyance = this.round(this.num(raw['conveyance']));
    const basicDaWage = this.round(basicWage + daWage);
    const grossWage = this.round(
      basicDaWage + hraWage + regularAllowance + conveyance + otherEarnings,
    );
    const pf = this.computePf({
      basicDaWage,
      hraWage,
      regularAllowance,
      ceilingEnabled: this.bool(raw['pf_ceiling_enabled'], true),
      employeeRate: Number(setup.pfEmployeeRate) || 12,
      employerRate: Number(setup.pfEmployerRate) || 12,
      ceiling: Number(setup.pfWageCeiling) || 15000,
      applicable: employee?.pfApplicable !== false && setup.pfEnabled,
    });
    const pfDeduction = pf.employee;
    const pfEmployerContribution = pf.employer;
    const esi = this.computeEsi({
      grossWage,
      setup,
      applicable: employee?.esiApplicable !== false && setup.esiEnabled,
    });
    const ptDeduction = await this.resolveSlabAmount({
      clientId,
      stateCode,
      componentCode: 'PT',
      baseAmount: grossWage,
      enabled: setup.ptEnabled,
      asOfDate: `${periodMonth}-01`,
    });
    const lwfEmployeeDeduction = await this.resolveSlabAmount({
      clientId,
      stateCode,
      componentCode: 'LWF_EMP',
      baseAmount: grossWage,
      enabled: setup.lwfEnabled,
      asOfDate: `${periodMonth}-01`,
    });
    const lwfEmployerContribution = await this.resolveSlabAmount({
      clientId,
      stateCode,
      componentCode: 'LWF_ER',
      baseAmount: grossWage,
      enabled: setup.lwfEnabled,
      asOfDate: `${periodMonth}-01`,
    });
    const netSalary = this.round(
      grossWage -
        pfDeduction -
        esi.employee -
        ptDeduction -
        lwfEmployeeDeduction -
        this.num(raw['other_deductions']),
    );
    const totalEmployerContribution = this.round(
      pfEmployerContribution + esi.employer + lwfEmployerContribution,
    );
    const reasons: string[] = [];
    if (!employee) reasons.push('Employee master not found');
    if (!quote) reasons.push('No CRM quotation wage configured');
    if (quote && mcdDailyWage != null && mcdDailyWage !== quote.dailyWage)
      reasons.push(
        `MCD daily wage ${mcdDailyWage} does not match quotation ${quote.dailyWage}`,
      );
    if (!minimumDailyWage && stateCode)
      reasons.push(
        `No minimum wage configured for ${stateCode}/${skillCategory}`,
      );
    if (
      minimumDailyWage &&
      (payableDailyWage < minimumDailyWage ||
        segments.some((s) => s.quote.dailyWage < minimumDailyWage))
    )
      reasons.push('Payable wage is below state minimum wage');
    if (!stateCode) reasons.push('Branch/employee state is missing');
    const excluded = [
      ...(employee.pfApplicable === false ? ['PF_EMP', 'PF_ER'] : []),
      ...(employee.esiApplicable === false ? ['ESI_EMP', 'ESI_ER'] : []),
    ];
    const calculationSegments = segments.length
      ? segments
      : quote?.rateCard
        ? [{ quote, days: daysWorked, hours: Number(raw.ot_hours || 0) }]
        : [];
    if (
      calculationSegments.some(
        (s) =>
          s.hours > 0 &&
          !s.quote.rateCard?.components.some((c) => c.method === 'HOURLY'),
      ) ||
      (!calculationSegments.length && Number(raw.ot_hours) > 0)
    )
      throw new BadRequestException(
        'CRM must configure an hourly overtime component before approving overtime',
      );
    const cardResult = calculationSegments.length
      ? calculateRateCardSegments(
          calculationSegments.map((s) => ({
            card: s.quote.rateCard!,
            days: s.days,
            hours: s.hours,
          })),
          excluded,
        )
      : null;
    if (cardResult) {
      for (const code of [
        'BASIC_DA',
        ...(employee.pfApplicable ? ['PF_EMP', 'PF_ER'] : []),
        ...(employee.esiApplicable ? ['ESI_EMP', 'ESI_ER'] : []),
      ]) {
        if (
          calculationSegments.some(
            (s) => !s.quote.rateCard!.components.some((c) => c.code === code),
          )
        )
          reasons.push('Rate card missing required component ' + code);
      }
    }
    return this.computationRepo.create({
      calculationSnapshot: {
        quotationId: quote?.id || null,
        effectiveFrom: quote?.effectiveFrom || null,
        designation: employee.designation,
        uan: employee.uan,
        esic: employee.esic,
        pfApplicable: employee.pfApplicable,
        esiApplicable: employee.esiApplicable,
        rateCard: quote?.rateCard || null,
        result: cardResult,
        overtimeHours: Number(raw.ot_hours || 0),
        segments: calculationSegments.map((s) => ({
          quotationId: s.quote.id,
          effectiveFrom: s.quote.effectiveFrom,
          days: s.days,
          hours: s.hours,
          rateCard: s.quote.rateCard,
        })),
      },
      uploadId,
      clientId,
      branchId,
      contractorUserId,
      periodMonth,
      rowNumber,
      employeeCode,
      employeeName: employee?.name ?? rawEmployeeName,
      skillCategory,
      daysWorked,
      quotationDailyWage: quote?.dailyWage ?? null,
      mcdDailyWage,
      minimumDailyWage,
      employeeDailyWage,
      payableDailyWage,
      basicWage: cardResult?.amounts.BASIC_DA ?? basicWage,
      otherEarnings: cardResult
        ? this.round(cardResult.earnings - (cardResult.amounts.BASIC_DA || 0))
        : this.round(otherEarnings),
      grossWage: cardResult
        ? this.round(
            cardResult.earnings -
              (cardResult.amounts.BONUS || 0) -
              (cardResult.amounts.LEAVE || 0),
          )
        : grossWage,
      totalEarnings: cardResult?.earnings ?? grossWage,
      pfWage: cardResult ? cardResult.bases.PF_EMP || 0 : pf.wage,
      pfDeduction: cardResult ? cardResult.amounts.PF_EMP || 0 : pfDeduction,
      pfEmployerContribution: cardResult
        ? cardResult.amounts.PF_ER || 0
        : pfEmployerContribution,
      esiDeduction: cardResult ? cardResult.amounts.ESI_EMP || 0 : esi.employee,
      esiEmployerContribution: cardResult
        ? cardResult.amounts.ESI_ER || 0
        : esi.employer,
      ptDeduction: cardResult ? cardResult.amounts.PT || 0 : ptDeduction,
      lwfEmployeeDeduction: cardResult
        ? cardResult.amounts.LWF_EMP || 0
        : lwfEmployeeDeduction,
      lwfEmployerContribution: cardResult
        ? cardResult.amounts.LWF_ER || 0
        : lwfEmployerContribution,
      totalEmployerContribution:
        cardResult?.employerCosts ?? totalEmployerContribution,
      netSalary: cardResult?.netPay ?? netSalary,
      matchStatus: !quote
        ? 'NO_QUOTATION'
        : reasons.length
          ? 'MISMATCH'
          : 'MATCHED',
      mismatchReason: reasons.join('; ') || null,
    });
  }

  private async findQuotation(
    clientId: string,
    contractorUserId: string,
    branchId: string | null,
    skillCategory: ContractorWageSkill,
    onDate: string,
    designation = '',
  ) {
    const qb = this.quotationRepo
      .createQueryBuilder('q')
      .where('q.client_id = :clientId', { clientId })
      .andWhere('q.contractor_user_id = :contractorUserId', {
        contractorUserId,
      })
      .andWhere('q.skill_category = :skillCategory', { skillCategory })
      .andWhere("(q.designation='' OR q.designation=:designation)", {
        designation: designation.trim().toUpperCase(),
      })
      .andWhere('q.effective_from <= :onDate', { onDate })
      .andWhere('(q.effective_to IS NULL OR q.effective_to >= :onDate)', {
        onDate,
      });
    if (branchId)
      qb.andWhere('(q.branch_id = :branchId OR q.branch_id IS NULL)', {
        branchId,
      });
    else qb.andWhere('q.branch_id IS NULL');
    return qb
      .orderBy('CASE WHEN q.branch_id IS NOT NULL THEN 1 ELSE 0 END', 'DESC')
      .addOrderBy('q.designation', 'DESC')
      .addOrderBy('q.effective_from', 'DESC')
      .getOne();
  }

  private async findEmployee(
    clientId: string,
    contractorUserId: string,
    branchId: string | null,
    employeeCode: string | null,
    employeeName: string,
  ) {
    if (employeeCode) {
      const byCode = await this.employeeRepo.findOne({
        where: {
          clientId,
          contractorUserId,
          employeeCode,
          ...(branchId ? { branchId } : {}),
        } as any,
      });
      return byCode?.isActive &&
        !['LEFT', 'INACTIVE', 'PENDING_DELETE'].includes(byCode.status)
        ? byCode
        : null;
    }
    if (!employeeName) return null;
    const qb = this.employeeRepo
      .createQueryBuilder('e')
      .where('e.client_id = :clientId', { clientId })
      .andWhere('e.contractor_user_id = :contractorUserId', {
        contractorUserId,
      })
      .andWhere('LOWER(TRIM(e.name)) = LOWER(TRIM(:employeeName))', {
        employeeName,
      })
      .andWhere('e.is_active = true')
      .andWhere("e.status NOT IN ('LEFT', 'INACTIVE', 'PENDING_DELETE')");
    if (branchId) qb.andWhere('e.branch_id = :branchId', { branchId });
    return qb.getOne();
  }

  private resolveEmployeeDailyWage(
    employee: ContractorEmployeeEntity | null,
  ): number | null {
    if (!employee) return null;
    if (employee.dailyWage != null && employee.dailyWage > 0) {
      return employee.dailyWage;
    }
    if (employee.monthlySalary != null && employee.monthlySalary > 0) {
      return this.round(employee.monthlySalary / 26);
    }
    return null;
  }

  private async findMinimumDailyWage(
    stateCode: string | null,
    skillCategory: ContractorWageSkill,
    onDate: string,
  ): Promise<number | null> {
    if (!stateCode) return null;
    const row = await this.minimumWageRepo
      .createQueryBuilder('mw')
      .where('mw.state_code = :stateCode', { stateCode })
      .andWhere('mw.skill_category = :skillCategory', { skillCategory })
      .andWhere('mw.effective_from <= :onDate', { onDate })
      .andWhere('(mw.effective_to IS NULL OR mw.effective_to >= :onDate)', {
        onDate,
      })
      .orderBy('mw.scheduled_employment', 'DESC')
      .addOrderBy('mw.effective_from', 'DESC')
      .getOne();
    if (!row) return null;
    return row.dailyWage ?? this.round(row.monthlyWage / 26);
  }

  private async findPayrollSetup(
    clientId: string,
  ): Promise<PayrollClientSetupEntity> {
    const existing = await this.payrollSetupRepo.findOne({
      where: { clientId },
    });
    return (
      existing ??
      this.payrollSetupRepo.create({
        clientId,
        pfEnabled: true,
        esiEnabled: true,
        ptEnabled: true,
        lwfEnabled: false,
        pfEmployeeRate: '12',
        pfEmployerRate: '12',
        pfWageCeiling: '15000',
        esiEmployeeRate: '0.75',
        esiEmployerRate: '3.25',
        esiWageCeiling: '21000',
      })
    );
  }

  /**
   * PT/LWF for a contractor worker.
   *
   * Delegates to StateSlabService, the same resolution employee payroll uses.
   * This used to be a private copy of that fallback chain and band match, and
   * the two had already drifted: the copy fell through to the next fallback
   * tier when a tier's bands did not cover the amount, where the shared service
   * stops at the first tier that has any slabs at all. The shared behaviour
   * wins — a client who has configured their own PT table is the authority for
   * their own state, and quietly falling back to the shared defaults applies
   * someone else's rates.
   *
   * The rounding stays here: contractor figures are ceil'd at the point of use,
   * and StateSlabService deliberately returns the raw amount so its other
   * callers can round on their own terms.
   */
  private async resolveSlabAmount(input: {
    clientId: string;
    stateCode: string | null;
    componentCode: string;
    baseAmount: number;
    enabled: boolean;
    /** Payroll period as YYYY-MM-DD, so a slab revision applies from its month. */
    asOfDate?: string;
  }): Promise<number> {
    if (!input.enabled || !input.stateCode) return 0;
    const amount = await this.stateSlab.resolveAmount({
      clientId: input.clientId,
      stateCode: input.stateCode,
      componentCode: input.componentCode,
      baseAmount: input.baseAmount,
      asOfDate: input.asOfDate,
    });
    return Math.ceil(amount);
  }

  private async notifyCrm(
    clientId: string,
    branchId: string | null,
    contractorUserId: string,
    periodMonth: string,
    rows: ContractorMcdComputationEntity[],
  ) {
    const contractor = await this.userRepo.findOne({
      where: { id: contractorUserId },
    });
    await this.notifications.createSystemNotification({
      clientId,
      branchId: branchId ?? undefined,
      sourceKey: `contractor-mcd-computation:${contractorUserId}:${periodMonth}:${Date.now()}`,
      queryType: 'COMPLIANCE',
      priority: 1,
      subject: `Contractor MCD wage mismatch - ${contractor?.name ?? 'Contractor'} - ${periodMonth}`,
      message: rows
        .slice(0, 10)
        .map(
          (r) => `Row ${r.rowNumber}: ${r.employeeName} - ${r.mismatchReason}`,
        )
        .join('\n'),
    });
  }

  private async resolveCrmClient(user: ReqUser, clientId?: string) {
    if (!['ADMIN', 'CRM', 'CEO', 'CCO'].includes(user.roleCode))
      throw new ForbiddenException('CRM access required');
    if (!clientId) throw new BadRequestException('clientId is required');
    await this.scope.assertClientAllowed(user, clientId);
    if (user.roleCode === 'CCO')
      await this.scope.assertCcoClientAllowed(user, clientId);
    return clientId;
  }

  private async assertContractorLinked(
    clientId: string,
    contractorUserId: string,
    branchId?: string | null,
  ) {
    const where: any = { clientId, contractorUserId };
    if (branchId) where.branchId = branchId;
    if (!(await this.branchContractorRepo.findOne({ where })))
      throw new BadRequestException(
        'Contractor is not linked to this client/branch',
      );
  }

  private normalizeSkill(value: string): ContractorWageSkill {
    const skill = value
      .trim()
      .toUpperCase()
      .replace(/[\s-]+/g, '_') as ContractorWageSkill;
    if (!SKILLS.includes(skill))
      throw new BadRequestException(`Invalid skill category: ${value}`);
    return skill;
  }

  private validDate(value: string) {
    return (
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      Number.isFinite(Date.parse(value + 'T00:00:00Z')) &&
      new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value
    );
  }

  private validateDatedAttendance(
    value: unknown,
    month: string,
    days: number,
    hours: number,
  ) {
    if (!Array.isArray(value) || value.length > 31)
      throw new BadRequestException(
        'Provide at most one attendance entry per employee per date',
      );
    const dates = new Set<string>();
    let totalDays = 0,
      totalHours = 0;
    for (const row of value) {
      const date = String(row?.date || '');
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        date.slice(0, 7) !== month ||
        !Number.isFinite(Date.parse(date + 'T00:00:00Z')) ||
        new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) !== date ||
        dates.has(date) ||
        typeof row.days !== 'number' ||
        !Number.isFinite(row.days) ||
        row.days < 0 ||
        row.days > 1 ||
        !Number.isFinite(Number(row.hours || 0)) ||
        Number(row.hours || 0) < 0 ||
        Number(row.hours || 0) > 24
      )
        throw new BadRequestException('Invalid or duplicate dated attendance');
      dates.add(date);
      totalDays += row.days;
      totalHours += Number(row.hours || 0);
    }
    if (
      Math.abs(totalDays - days) > 0.0001 ||
      Math.abs(totalHours - hours) > 0.0001
    )
      throw new BadRequestException(
        'Dated attendance must reconcile with payable days and overtime',
      );
  }

  private normalizeQuotationSheet(
    sheet: ExcelJS.Worksheet,
    effectiveFrom?: string,
  ) {
    const headers = this.headers(sheet);
    if (!headers.has('component_code')) return sheet;
    const groups = new Map<
      string,
      {
        skill: string;
        designation: string;
        from: string;
        to: string;
        divisor: number;
        rounding: string;
        components: unknown[];
      }
    >();
    for (let n = 2; n <= sheet.rowCount; n++) {
      const row = sheet.getRow(n);
      const text = (key: string) => this.cellString(row, headers, [key]);
      const code = text('component_code').toUpperCase();
      if (!code) continue;
      const skill = text('skill_category'),
        designation = text('designation').toUpperCase();
      const from = text('effective_from') || effectiveFrom || '',
        to = text('effective_to');
      const divisor = Number(text('divisor')),
        rounding = text('rounding').toUpperCase();
      const key = JSON.stringify([skill, designation, from]);
      let group = groups.get(key);
      if (!group) {
        group = {
          skill,
          designation,
          from,
          to,
          divisor,
          rounding,
          components: [],
        };
        groups.set(key, group);
      }
      if (
        group.divisor !== divisor ||
        group.rounding !== rounding ||
        group.to !== to
      )
        throw new BadRequestException(
          'All rows in a rate card must use the same divisor, rounding and end date',
        );
      const prorate = text('prorate').toLowerCase();
      if (!['true', 'false', 'yes', 'no'].includes(prorate))
        throw new BadRequestException('Prorate must be yes or no');
      group.components.push({
        code,
        label: text('label') || code,
        category: text('category').toUpperCase(),
        method: text('method').toUpperCase(),
        value: this.cellNumber(row, headers, ['value']),
        basis: text('basis')
          .split(',')
          .map((v) => v.trim().toUpperCase())
          .filter(Boolean),
        ...(text('ceiling') ? { ceiling: Number(text('ceiling')) } : {}),
        prorate: ['true', 'yes'].includes(prorate),
      });
    }
    const normalized = new ExcelJS.Workbook().addWorksheet('Rate cards');
    normalized.addRow([
      'skill_category',
      'designation',
      'effective_from',
      'effective_to',
      'rate_card_json',
    ]);
    for (const g of groups.values())
      normalized.addRow([
        g.skill,
        g.designation,
        g.from,
        g.to,
        JSON.stringify({
          divisor: g.divisor,
          rounding: g.rounding,
          components: g.components,
        }),
      ]);
    return normalized;
  }

  async quotationTemplate() {
    const workbook = new ExcelJS.Workbook(),
      sheet = workbook.addWorksheet('Components');
    sheet.addRow([
      'skill_category',
      'designation',
      'effective_from',
      'effective_to',
      'divisor',
      'rounding',
      'component_code',
      'label',
      'category',
      'method',
      'value',
      'basis',
      'ceiling',
      'prorate',
    ]);
    for (const [designation, basic, site, bonus, leave] of [
      ['SECURITY GUARD', 16000, 2000, 1333, 770],
      ['ASO', 20000, 2150, 1666, 962],
    ] as const) {
      const rows = [
        ['BASIC_DA', 'Basic + DA', 'EARNING', 'FIXED', basic, '', '', 'yes'],
        ['SITE', 'Site allowance', 'EARNING', 'FIXED', site, '', '', 'yes'],
        ['BONUS', 'Monthly bonus', 'EARNING', 'FIXED', bonus, '', '', 'yes'],
        [
          'LEAVE',
          'Monthly leave wages',
          'EARNING',
          'FIXED',
          leave,
          '',
          '',
          'yes',
        ],
        [
          'PF_EMP',
          'Employee PF',
          'DEDUCTION',
          'PERCENT',
          12,
          'BASIC_DA',
          15000,
          'no',
        ],
        [
          'ESI_EMP',
          'Employee ESI (quotation basis)',
          'DEDUCTION',
          'PERCENT',
          0.75,
          'BASIC_DA',
          '',
          'no',
        ],
        [
          'PT',
          'Professional tax (quotation amount)',
          'DEDUCTION',
          'FIXED',
          150,
          '',
          '',
          'no',
        ],
        [
          'PF_ER',
          'Employer PF quotation cost',
          'EMPLOYER_COST',
          'FIXED',
          1950,
          '',
          '',
          'yes',
        ],
        [
          'ESI_ER',
          'Employer ESI quotation cost',
          'EMPLOYER_COST',
          'PERCENT',
          3.25,
          'BASIC_DA',
          '',
          'no',
        ],
      ];
      for (const r of rows)
        sheet.addRow(['SKILLED', designation, '', '', 30, 'RUPEE', ...r]);
    }
    sheet.getRow(1).font = { bold: true };
    sheet.columns.forEach((c) => (c.width = 24));
    const notes = workbook.addWorksheet('Instructions');
    notes.getColumn(1).width = 120;
    notes.addRows([
      [
        'Sample quotation mapping only. Enter effective dates and verify client-specific statutory bases/rates before use.',
      ],
      [
        'Use one row per component. Percentage basis contains preceding component codes, separated by commas.',
      ],
      [
        'EARNING adds employee pay; DEDUCTION reduces take-home; EMPLOYER_COST and BILLING_FEE add billing only.',
      ],
      [
        'Include bonus and leave payouts once as EARNING; do not repeat them as employer costs.',
      ],
      [
        'Add the remaining approved quotation charges. The sample does not represent a complete commercial bill.',
      ],
      [
        'Overtime: use method HOURLY, value as the approved hourly amount and prorate=no. Use code OT.',
      ],
      [
        'Fixed monthly components with prorate=yes use payable days/divisor; percentage components must use prorate=no.',
      ],
    ]);
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  async attendanceTemplate() {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Attendance');
    sheet.addRow([
      'employee_code',
      'attendance_date',
      'days_worked',
      'ot_hours',
    ]);
    sheet.columns.forEach((c) => {
      c.width = 24;
      c.numFmt = '@';
    });
    const instructions = workbook.addWorksheet('Instructions');
    instructions.getColumn(1).width = 120;
    instructions.addRows([
      [
        'Use enrolled employee IDs. Enter dates as YYYY-MM-DD and one row per employee per date.',
      ],
      [
        'Payable days: 0 to 1 per date (for example 0.5 for half day). Overtime hours: 0 to 24.',
      ],
      [
        'Dates are required when the quotation changes within the selected month. Otherwise one monthly total row per employee can leave attendance_date blank.',
      ],
      [
        'Upload the completed XLSX through Monthly Documents. Branch approval is required before calculation.',
      ],
      [
        'Do not enter wages or deductions here. CRM quotations determine pay; upload the wage register separately for comparison.',
      ],
    ]);
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  private async firstSheet(buffer: Buffer) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);
    const sheet = workbook.worksheets[0];
    if (!sheet) throw new BadRequestException('No worksheet found');
    return sheet;
  }

  private headers(sheet: ExcelJS.Worksheet) {
    const headers = new Map<string, number>();
    sheet.getRow(1).eachCell((cell, col) =>
      headers.set(
        cell.text
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '_'),
        col,
      ),
    );
    return headers;
  }

  private cellString(
    row: ExcelJS.Row,
    headers: Map<string, number>,
    names: string[],
  ) {
    for (const name of names) {
      const col = headers.get(name);
      if (col) {
        const value = row.getCell(col).text.trim();
        if (value) return value;
      }
    }
    return '';
  }

  private cellNumber(
    row: ExcelJS.Row,
    headers: Map<string, number>,
    names: string[],
  ) {
    const value = this.cellString(row, headers, names).replace(/,/g, '');
    if (!value) return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  private optionalNum(value: unknown) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  private computePf(input: {
    basicDaWage: number;
    hraWage: number;
    regularAllowance: number;
    ceilingEnabled: boolean;
    employeeRate: number;
    employerRate: number;
    ceiling: number;
    applicable: boolean;
  }) {
    if (!input.applicable) return { wage: 0, employee: 0, employer: 0 };
    const genuineHraLimit = this.round(input.basicDaWage * 0.4);
    const excessHra = Math.max(0, input.hraWage - genuineHraLimit);
    const uncappedWage = this.round(
      input.basicDaWage + input.regularAllowance + excessHra,
    );
    const wage = this.round(
      input.ceilingEnabled
        ? Math.min(uncappedWage, input.ceiling)
        : uncappedWage,
    );
    return {
      wage,
      employee: this.round((wage * input.employeeRate) / 100),
      employer: this.round((wage * input.employerRate) / 100),
    };
  }

  private computeEsi(input: {
    grossWage: number;
    setup: PayrollClientSetupEntity;
    applicable: boolean;
  }) {
    const ceiling = Number(input.setup.esiWageCeiling) || 21000;
    if (
      !input.applicable ||
      input.grossWage <= 0 ||
      input.grossWage > ceiling
    ) {
      return { employee: 0, employer: 0 };
    }
    return {
      employee: this.round(
        (input.grossWage * (Number(input.setup.esiEmployeeRate) || 0.75)) / 100,
      ),
      employer: this.round(
        (input.grossWage * (Number(input.setup.esiEmployerRate) || 3.25)) / 100,
      ),
    };
  }

  private summarize(rows: ContractorMcdComputationEntity[]) {
    return rows.reduce(
      (acc, row) => {
        acc.grossWage = this.round(acc.grossWage + row.grossWage);
        acc.netSalary = this.round(acc.netSalary + row.netSalary);
        acc.employeeDeductions = this.round(
          acc.employeeDeductions +
            row.pfDeduction +
            row.esiDeduction +
            row.ptDeduction +
            row.lwfEmployeeDeduction,
        );
        acc.employerContributions = this.round(
          acc.employerContributions + row.totalEmployerContribution,
        );
        return acc;
      },
      {
        grossWage: 0,
        netSalary: 0,
        employeeDeductions: 0,
        employerContributions: 0,
      },
    );
  }

  private bool(value: unknown, fallback: boolean) {
    if (value == null || value === '') return fallback;
    if (typeof value === 'boolean') return value;
    if (
      typeof value !== 'string' &&
      typeof value !== 'number' &&
      typeof value !== 'bigint'
    ) {
      return fallback;
    }
    const s = value.toString().trim().toLowerCase();
    if (['true', 'yes', 'y', '1', 'enabled'].includes(s)) return true;
    if (['false', 'no', 'n', '0', 'disabled'].includes(s)) return false;
    return fallback;
  }

  private num(value: unknown) {
    const n = Number(value ?? 0);
    return Number.isFinite(n) ? n : 0;
  }

  private round(n: number) {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  private unknownToString(value: unknown) {
    if (value == null) return '';
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      return String(value);
    }
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return '';
  }
}
