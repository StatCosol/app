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
import { NotificationsService } from '../notifications/notifications.service';
import { UserEntity } from '../users/entities/user.entity';
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
        'c.basic_wage AS "basicWage"',
        'c.other_earnings AS "otherEarnings"',
        'c.gross_wage AS "grossWage"',
        'c.pf_wage AS "pfWage"',
        'c.pf_deduction AS "pfDeduction"',
        'c.pf_employer_contribution AS "pfEmployerContribution"',
        'c.esi_deduction AS "esiDeduction"',
        'c.pt_deduction AS "ptDeduction"',
        'c.net_salary AS "netSalary"',
        'c.match_status AS "matchStatus"',
        'c.mismatch_reason AS "mismatchReason"',
        'c.created_at AS "createdAt"',
      ])
      .where('c.client_id = :clientId', { clientId });

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

    const data = await qb
      .orderBy('c.created_at', 'DESC')
      .addOrderBy('c.row_number', 'ASC')
      .limit(Math.min(Math.max(Number(q.limit ?? 200), 1), 500))
      .getRawMany();
    return { data, total: data.length };
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
      rows: Array<Record<string, unknown>>;
    },
  ) {
    const clientId =
      user.roleCode === 'CONTRACTOR' ? user.clientId : input.clientId;
    if (!clientId) throw new BadRequestException('clientId is required');
    await this.scope.assertClientAllowed(user, clientId);
    const contractorUserId =
      user.roleCode === 'CONTRACTOR' ? user.id : input.contractorUserId;
    await this.assertContractorLinked(
      clientId,
      contractorUserId,
      input.branchId ?? undefined,
    );

    const output: ContractorMcdComputationEntity[] = [];
    for (let i = 0; i < input.rows.length; i++) {
      output.push(
        await this.computeOne(
          clientId,
          contractorUserId,
          input.branchId ?? null,
          input.periodMonth,
          input.uploadId ?? null,
          i + 1,
          input.rows[i],
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
    raw: Record<string, unknown>,
  ) {
    const skillCategory = this.normalizeSkill(
      this.unknownToString(raw['skill_category'] ?? raw['skill']),
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
    const quote = await this.findQuotation(
      clientId,
      contractorUserId,
      branchId,
      skillCategory,
      `${periodMonth}-01`,
    );
    const wage = quote?.dailyWage ?? mcdDailyWage ?? 0;
    const basicWage = this.round(
      this.optionalNum(raw['basic_wage'] ?? raw['basic']) ?? wage * daysWorked,
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
    });
    const pfDeduction = pf.employee;
    const pfEmployerContribution = pf.employer;
    const esiDeduction =
      grossWage > 0 && grossWage <= 21000 ? this.round(grossWage * 0.0075) : 0;
    const ptDeduction = grossWage <= 15000 ? 0 : grossWage <= 20000 ? 150 : 200;
    const netSalary = this.round(
      grossWage -
        pfDeduction -
        esiDeduction -
        ptDeduction -
        this.num(raw['other_deductions']),
    );
    const reasons: string[] = [];
    if (!quote) reasons.push('No CRM quotation wage configured');
    if (quote && mcdDailyWage != null && mcdDailyWage !== quote.dailyWage)
      reasons.push(
        `MCD daily wage ${mcdDailyWage} does not match quotation ${quote.dailyWage}`,
      );
    return this.computationRepo.create({
      uploadId,
      clientId,
      branchId,
      contractorUserId,
      periodMonth,
      rowNumber,
      employeeCode:
        this.unknownToString(raw['employee_code'] ?? raw['code']) || null,
      employeeName: this.unknownToString(raw['employee_name'] ?? raw['name']),
      skillCategory,
      daysWorked,
      quotationDailyWage: quote?.dailyWage ?? null,
      mcdDailyWage,
      basicWage,
      otherEarnings: this.round(otherEarnings),
      grossWage,
      pfWage: pf.wage,
      pfDeduction,
      pfEmployerContribution,
      esiDeduction,
      ptDeduction,
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
  }) {
    const genuineHraLimit = this.round(input.basicDaWage * 0.4);
    const excessHra = Math.max(0, input.hraWage - genuineHraLimit);
    const uncappedWage = this.round(
      input.basicDaWage + input.regularAllowance + excessHra,
    );
    const wage = this.round(
      input.ceilingEnabled ? Math.min(uncappedWage, 15000) : uncappedWage,
    );
    const contribution = this.round(wage * 0.12);
    return {
      wage,
      employee: contribution,
      employer: contribution,
    };
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
