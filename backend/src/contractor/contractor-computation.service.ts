import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as ExcelJS from 'exceljs';
import { IsNull, Repository } from 'typeorm';
import { AccessScopeService, ReqUser } from '../access/access-scope.service';
import { BranchContractorEntity } from '../branches/entities/branch-contractor.entity';
import { BranchEntity } from '../branches/entities/branch.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { PayrollClientSetupEntity } from '../payroll/entities/payroll-client-setup.entity';
import { PayrollStatutorySlabEntity } from '../payroll/entities/payroll-statutory-slab.entity';
import { SHARED_SLAB_CLIENT_ID } from '../payroll/services/state-slab.service';
import { UserEntity } from '../users/entities/user.entity';
import { ContractorEmployeeEntity } from './contractor-employees/entities/contractor-employee.entity';
import { MinimumWageEntity } from './contractor-employees/entities/minimum-wage.entity';
import {
  ContractorQuotationWageEntity,
  ContractorWageSkill,
} from './entities/contractor-quotation-wage.entity';
import { ContractorMcdComputationEntity } from './entities/contractor-mcd-computation.entity';

const SKILLS: ContractorWageSkill[] = [
  'UNSKILLED',
  'SEMI_SKILLED',
  'SKILLED',
  'HIGHLY_SKILLED',
];

type AttendanceComputeRow = Record<string, unknown>;

@Injectable()
export class ContractorComputationService {
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
    @InjectRepository(PayrollStatutorySlabEntity)
    private readonly statutorySlabRepo: Repository<PayrollStatutorySlabEntity>,
    private readonly scope: AccessScopeService,
    private readonly notifications: NotificationsService,
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
    const qb = this.computationRepo
      .createQueryBuilder('c')
      .leftJoin(UserEntity, 'u', 'u.id = c.contractor_user_id')
      .leftJoin('client_branches', 'b', 'b.id = c.branch_id')
      .select([
        'c.id AS "id"',
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
        'c.created_at AS "createdAt"',
      ])
      .where('c.client_id = :clientId', { clientId });

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
      rows.push({
        employee_code: employeeCode,
        employee_name: employeeName,
        skill_category: this.cellString(row, headers, [
          'skill_category',
          'skill',
          'category',
        ]),
        days_worked: daysWorked ?? 0,
        daily_wage: this.cellNumber(row, headers, [
          'daily_wage',
          'wage_rate',
          'mcd_daily_wage',
        ]),
        basic_wage: this.cellNumber(row, headers, ['basic_wage', 'basic']),
        da: this.cellNumber(row, headers, ['da', 'dearness_allowance']),
        hra: this.cellNumber(row, headers, ['hra']),
        ot_hours: this.cellNumber(row, headers, ['ot_hours', 'overtime_hours']),
        ot: this.cellNumber(row, headers, ['ot', 'ot_amount', 'ot_wages']),
        arrears: this.cellNumber(row, headers, ['arrears']),
        attendance_bonus: this.cellNumber(row, headers, [
          'attendance_bonus',
          'attn_bonus',
        ]),
        bonus: this.cellNumber(row, headers, ['bonus']),
        incentive: this.cellNumber(row, headers, ['incentive']),
        other_earnings: this.cellNumber(row, headers, ['other_earnings']),
        other_deductions: this.cellNumber(row, headers, ['other_deductions']),
      });
    }
    return this.computeMcdRows(user, {
      clientId: dto.clientId ?? '',
      contractorUserId: dto.contractorUserId ?? '',
      branchId: dto.branchId ?? null,
      periodMonth: dto.periodMonth,
      uploadId: dto.uploadId ?? null,
      rows,
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

    const sheet = await this.firstSheet(file.buffer);
    const headers = this.headers(sheet);
    let inserted = 0;
    let updated = 0;
    let errors = 0;
    const results: any[] = [];

    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
      const row = sheet.getRow(rowNumber);
      const skillRaw = this.cellString(row, headers, [
        'skill_category',
        'skill',
        'category',
      ]);
      const dailyWage = this.cellNumber(row, headers, [
        'daily_wage',
        'quotation_daily_wage',
        'wage_rate',
        'rate',
      ]);
      if (!skillRaw && dailyWage == null) continue;
      try {
        const skillCategory = this.normalizeSkill(skillRaw);
        if (!dailyWage || dailyWage <= 0)
          throw new BadRequestException('daily_wage must be greater than zero');
        const effectiveFrom =
          this.cellString(row, headers, ['effective_from']) ||
          dto.effectiveFrom;
        if (!effectiveFrom || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) {
          throw new BadRequestException(
            'effective_from is required as YYYY-MM-DD',
          );
        }
        const where = {
          clientId,
          contractorUserId: dto.contractorUserId,
          branchId: dto.branchId ?? IsNull(),
          skillCategory,
          effectiveFrom,
        } as any;
        const existing = await this.quotationRepo.findOne({ where });
        const entity =
          existing ??
          this.quotationRepo.create({
            clientId,
            contractorUserId: dto.contractorUserId,
            branchId: dto.branchId ?? null,
            skillCategory,
            effectiveFrom,
            createdByUserId: user.id,
          });
        entity.dailyWage = dailyWage;
        entity.monthlyWage = this.cellNumber(row, headers, [
          'monthly_wage',
          'monthly_rate',
        ]);
        entity.effectiveTo =
          this.cellString(row, headers, ['effective_to']) || null;
        entity.source =
          this.cellString(row, headers, ['source']) || file.originalname;
        entity.notes =
          this.cellString(row, headers, ['notes', 'remarks']) || null;
        await this.quotationRepo.save(entity);
        if (existing) updated++;
        else inserted++;
        results.push({
          rowNumber,
          skillCategory,
          outcome: existing ? 'updated' : 'inserted',
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
      rows: Array<AttendanceComputeRow>;
    },
  ) {
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
    if (input.branchId) await this.scope.assertBranchAllowed(user, input.branchId);

    if (!Array.isArray(input.rows)) {
      throw new BadRequestException('rows must be an array');
    }
    const MAX_ROWS = 1000;
    if (input.rows.length > MAX_ROWS) {
      throw new BadRequestException(`rows must not exceed ${MAX_ROWS} items`);
    }
    const rows = input.rows;
    await this.computationRepo.delete({
      clientId,
      contractorUserId,
      branchId: input.branchId ?? IsNull(),
      periodMonth: input.periodMonth,
    });

    const output: ContractorMcdComputationEntity[] = [];
    for (let i = 0; i < rows.length; i++) {
      output.push(
        await this.computeOne(
          clientId,
          contractorUserId,
          input.branchId ?? null,
          input.periodMonth,
          input.uploadId ?? null,
          i + 1,
          rows[i],
        ),
      );
    }
    const saved = await this.computationRepo.save(output);
    const mismatches = saved.filter((r) => r.matchStatus !== 'MATCHED');
    if (mismatches.length)
      await this.notifyCrm(
        clientId,
        input.branchId ?? null,
        contractorUserId,
        input.periodMonth,
        mismatches,
      );
    return {
      total: saved.length,
      matched: saved.length - mismatches.length,
      mismatches: mismatches.length,
      summary: this.summarize(saved),
      rows: saved,
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
      this.unknownToString(raw['employee_code'] ?? raw['worker_code'] ?? raw['code']) ||
      null;
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
    const skillCategory = this.normalizeSkill(
      this.unknownToString(
        raw['skill_category'] ?? raw['skill'] ?? employee?.skillCategory,
      ),
    );
    const daysWorked = this.num(raw['days_worked'] ?? raw['days']);
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
    const [quote, setup, minimumDailyWage] = await Promise.all([
      this.findQuotation(
      clientId,
      contractorUserId,
      branchId,
      skillCategory,
      `${periodMonth}-01`,
      ),
      this.findPayrollSetup(clientId),
      this.findMinimumDailyWage(stateCode, skillCategory, `${periodMonth}-01`),
    ]);
    const employeeDailyWage = this.resolveEmployeeDailyWage(employee);
    const payableDailyWage = this.round(
      Math.max(
        quote?.dailyWage ?? 0,
        minimumDailyWage ?? 0,
        employeeDailyWage ?? 0,
        mcdDailyWage ?? 0,
      ),
    );
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
    });
    const lwfEmployeeDeduction = await this.resolveSlabAmount({
      clientId,
      stateCode,
      componentCode: 'LWF_EMP',
      baseAmount: grossWage,
      enabled: setup.lwfEnabled,
    });
    const lwfEmployerContribution = await this.resolveSlabAmount({
      clientId,
      stateCode,
      componentCode: 'LWF_ER',
      baseAmount: grossWage,
      enabled: setup.lwfEnabled,
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
      reasons.push(`No minimum wage configured for ${stateCode}/${skillCategory}`);
    if (minimumDailyWage && payableDailyWage < minimumDailyWage)
      reasons.push('Payable wage is below state minimum wage');
    if (!stateCode) reasons.push('Branch/employee state is missing');
    return this.computationRepo.create({
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
      basicWage,
      otherEarnings: this.round(otherEarnings),
      grossWage,
      pfWage: pf.wage,
      pfDeduction,
      pfEmployerContribution,
      esiDeduction: esi.employee,
      esiEmployerContribution: esi.employer,
      ptDeduction,
      lwfEmployeeDeduction,
      lwfEmployerContribution,
      totalEmployerContribution,
      netSalary,
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
  ) {
    const qb = this.quotationRepo
      .createQueryBuilder('q')
      .where('q.client_id = :clientId', { clientId })
      .andWhere('q.contractor_user_id = :contractorUserId', {
        contractorUserId,
      })
      .andWhere('q.skill_category = :skillCategory', { skillCategory })
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
      .orderBy('q.branch_id', 'DESC')
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
      if (byCode) return byCode;
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

  private async resolveSlabAmount(input: {
    clientId: string;
    stateCode: string | null;
    componentCode: string;
    baseAmount: number;
    enabled: boolean;
  }): Promise<number> {
    if (!input.enabled || !input.stateCode) return 0;
    const candidates: Array<[string, string]> = [
      [input.clientId, input.stateCode],
      [input.clientId, 'ALL'],
      [SHARED_SLAB_CLIENT_ID, input.stateCode],
      [SHARED_SLAB_CLIENT_ID, 'ALL'],
    ];
    for (const [clientId, stateCode] of candidates) {
      const slabs = await this.statutorySlabRepo.find({
        where: { clientId, stateCode, componentCode: input.componentCode },
        order: { fromAmount: 'ASC' },
      });
      for (const slab of slabs) {
        const from = Number(slab.fromAmount);
        const to = slab.toAmount != null ? Number(slab.toAmount) : null;
        if (input.baseAmount < from || (to != null && input.baseAmount > to)) {
          continue;
        }
        if (slab.valueAmount != null) return Math.ceil(Number(slab.valueAmount));
        if (slab.valuePercent != null) {
          return Math.ceil((input.baseAmount * Number(slab.valuePercent)) / 100);
        }
        return 0;
      }
    }
    return 0;
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
      input.ceilingEnabled ? Math.min(uncappedWage, input.ceiling) : uncappedWage,
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
    if (!input.applicable || input.grossWage <= 0 || input.grossWage > ceiling) {
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
