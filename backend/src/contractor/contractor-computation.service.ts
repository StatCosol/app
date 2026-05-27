import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as ExcelJS from 'exceljs';
import { In, IsNull, Repository } from 'typeorm';
import { AccessScopeService, ReqUser } from '../access/access-scope.service';
import { BranchContractorEntity } from '../branches/entities/branch-contractor.entity';
import { BranchEntity } from '../branches/entities/branch.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { UserEntity } from '../users/entities/user.entity';
import {
  ContractorQuotationWageEntity,
  ContractorWageSkill,
} from './entities/contractor-quotation-wage.entity';
import {
  ContractorMcdUploadEntity,
  ContractorMcdUploadStatus,
} from './entities/contractor-mcd-upload.entity';
import {
  ContractorMcdRowEntity,
  ContractorMcdRowStatus,
} from './entities/contractor-mcd-row.entity';

type QuotationInput = {
  clientId: string;
  contractorUserId: string;
  branchId?: string | null;
  skillCategory: ContractorWageSkill;
  dailyWage: number;
  monthlyWage?: number | null;
  effectiveFrom: string;
  effectiveTo?: string | null;
  source?: string | null;
  notes?: string | null;
};

type McdParsedRow = {
  rowNumber: number;
  employeeCode: string | null;
  employeeName: string;
  skillCategory: ContractorWageSkill;
  daysWorked: number;
  dailyWage: number | null;
  basicWage: number | null;
  ot: number;
  arrears: number;
  attendanceBonus: number;
  incentive: number;
  bonus: number;
  otherEarnings: number;
  reportedGross: number | null;
  otherDeductions: number;
  rawData: Record<string, unknown>;
};

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
    @InjectRepository(ContractorMcdUploadEntity)
    private readonly uploadRepo: Repository<ContractorMcdUploadEntity>,
    @InjectRepository(ContractorMcdRowEntity)
    private readonly rowRepo: Repository<ContractorMcdRowEntity>,
    @InjectRepository(BranchContractorEntity)
    private readonly branchContractorRepo: Repository<BranchContractorEntity>,
    @InjectRepository(BranchEntity)
    private readonly branchRepo: Repository<BranchEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    private readonly scope: AccessScopeService,
    private readonly notifications: NotificationsService,
  ) {}

  async listQuotations(user: ReqUser, q: Record<string, string>) {
    const clientId = await this.resolveClientForCrm(user, q.clientId);
    const qb = this.quotationRepo
      .createQueryBuilder('w')
      .leftJoin(UserEntity, 'u', 'u.id = w.contractor_user_id')
      .leftJoin(BranchEntity, 'b', 'b.id = w.branch_id')
      .select([
        'w.id AS "id"',
        'w.client_id AS "clientId"',
        'w.branch_id AS "branchId"',
        'b.branchname AS "branchName"',
        'w.contractor_user_id AS "contractorUserId"',
        'u.name AS "contractorName"',
        'w.skill_category AS "skillCategory"',
        'w.daily_wage AS "dailyWage"',
        'w.monthly_wage AS "monthlyWage"',
        'w.effective_from AS "effectiveFrom"',
        'w.effective_to AS "effectiveTo"',
        'w.source AS "source"',
        'w.notes AS "notes"',
        'w.created_at AS "createdAt"',
      ])
      .where('w.client_id = :clientId', { clientId });

    if (q.contractorUserId) {
      qb.andWhere('w.contractor_user_id = :contractorUserId', {
        contractorUserId: q.contractorUserId,
      });
    }
    if (q.branchId)
      qb.andWhere('w.branch_id = :branchId', { branchId: q.branchId });
    if (q.skillCategory) {
      qb.andWhere('w.skill_category = :skill', {
        skill: this.normalizeSkill(q.skillCategory),
      });
    }

    const data = await qb
      .orderBy('u.name', 'ASC')
      .addOrderBy('w.skill_category', 'ASC')
      .addOrderBy('w.effective_from', 'DESC')
      .getRawMany();
    return { data, total: data.length };
  }

  async upsertQuotation(user: ReqUser, dto: QuotationInput) {
    const clientId = await this.resolveClientForCrm(user, dto.clientId);
    await this.assertContractorLinked(
      clientId,
      dto.contractorUserId,
      dto.branchId,
    );

    const skillCategory = this.normalizeSkill(dto.skillCategory);
    const dailyWage = this.toNumber(dto.dailyWage, 'dailyWage');
    if (dailyWage <= 0)
      throw new BadRequestException('dailyWage must be greater than zero');
    if (!this.isDate(dto.effectiveFrom)) {
      throw new BadRequestException('effectiveFrom must be YYYY-MM-DD');
    }
    if (dto.effectiveTo && !this.isDate(dto.effectiveTo)) {
      throw new BadRequestException('effectiveTo must be YYYY-MM-DD');
    }

    const existing = await this.quotationRepo.findOne({
      where: {
        clientId,
        contractorUserId: dto.contractorUserId,
        branchId: dto.branchId ?? IsNull(),
        skillCategory,
        effectiveFrom: dto.effectiveFrom,
      } as any,
    });

    const row =
      existing ??
      this.quotationRepo.create({
        clientId,
        contractorUserId: dto.contractorUserId,
        branchId: dto.branchId ?? null,
        skillCategory,
        effectiveFrom: dto.effectiveFrom,
        createdByUserId: user.id,
      });

    row.dailyWage = dailyWage;
    row.monthlyWage = dto.monthlyWage != null ? Number(dto.monthlyWage) : null;
    row.effectiveTo = dto.effectiveTo ?? null;
    row.source = dto.source ?? null;
    row.notes = dto.notes ?? null;

    return this.quotationRepo.save(row);
  }

  async uploadQuotationExcel(
    user: ReqUser,
    dto: {
      clientId?: string;
      contractorUserId?: string;
      branchId?: string | null;
      effectiveFrom?: string;
    },
    file: Express.Multer.File,
  ) {
    if (!file?.buffer) throw new BadRequestException('Excel file is required');
    if (!dto.clientId) throw new BadRequestException('clientId is required');
    if (!dto.contractorUserId) {
      throw new BadRequestException('contractorUserId is required');
    }
    const clientId = await this.resolveClientForCrm(user, dto.clientId);
    await this.assertContractorLinked(
      clientId,
      dto.contractorUserId,
      dto.branchId,
    );

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(file.buffer as any);
    const sheet = workbook.worksheets[0];
    if (!sheet) throw new BadRequestException('No worksheet found');

    const headers = new Map<string, number>();
    sheet.getRow(1).eachCell((cell, colNumber) => {
      const key = this.normalizeHeader(this.cellValueToString(cell.value));
      if (key) headers.set(key, colNumber);
    });

    let inserted = 0;
    let updated = 0;
    let errors = 0;
    const results: Array<{
      rowNumber: number;
      skillCategory?: string;
      outcome: 'inserted' | 'updated' | 'error';
      message?: string;
    }> = [];

    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
      const row = sheet.getRow(rowNumber);
      const skillRaw = this.cellString(row, headers, [
        'skill_category',
        'skill',
        'category',
      ]);
      const dailyWage = this.cellOptionalNumber(row, headers, [
        'daily_wage',
        'quotation_daily_wage',
        'wage_rate',
        'rate',
      ]);
      if (!skillRaw && dailyWage == null) continue;

      try {
        const skillCategory = this.normalizeSkill(skillRaw);
        if (dailyWage == null || dailyWage <= 0) {
          throw new BadRequestException('daily_wage must be greater than zero');
        }
        const effectiveFrom =
          this.cellString(row, headers, ['effective_from']) ||
          dto.effectiveFrom;
        if (!effectiveFrom || !this.isDate(effectiveFrom)) {
          throw new BadRequestException(
            'effective_from is required as YYYY-MM-DD',
          );
        }
        const existing = await this.quotationRepo.findOne({
          where: {
            clientId,
            contractorUserId: dto.contractorUserId,
            branchId: dto.branchId ?? IsNull(),
            skillCategory,
            effectiveFrom,
          } as any,
        });
        await this.upsertQuotation(user, {
          clientId,
          contractorUserId: dto.contractorUserId,
          branchId: dto.branchId ?? null,
          skillCategory,
          dailyWage,
          monthlyWage: this.cellOptionalNumber(row, headers, [
            'monthly_wage',
            'monthly_rate',
          ]),
          effectiveFrom,
          effectiveTo: this.cellString(row, headers, ['effective_to']) || null,
          source:
            this.cellString(row, headers, ['source']) || file.originalname,
          notes: this.cellString(row, headers, ['notes', 'remark', 'remarks']),
        });
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

  async listUploads(user: ReqUser, q: Record<string, string>) {
    const clientId = await this.resolveClient(user, q.clientId);
    const qb = this.uploadRepo
      .createQueryBuilder('u')
      .leftJoin(UserEntity, 'cu', 'cu.id = u.contractor_user_id')
      .leftJoin(BranchEntity, 'b', 'b.id = u.branch_id')
      .select([
        'u.id AS "id"',
        'u.client_id AS "clientId"',
        'u.branch_id AS "branchId"',
        'b.branchname AS "branchName"',
        'u.contractor_user_id AS "contractorUserId"',
        'cu.name AS "contractorName"',
        'u.period_month AS "periodMonth"',
        'u.file_name AS "fileName"',
        'u.status AS "status"',
        'u.total_rows AS "totalRows"',
        'u.matched_rows AS "matchedRows"',
        'u.mismatch_rows AS "mismatchRows"',
        'u.error_rows AS "errorRows"',
        'u.notification_id AS "notificationId"',
        'u.created_at AS "createdAt"',
      ])
      .where('u.client_id = :clientId', { clientId });

    if (user.roleCode === 'CONTRACTOR') {
      qb.andWhere('u.contractor_user_id = :uid', { uid: user.id });
    } else if (q.contractorUserId) {
      qb.andWhere('u.contractor_user_id = :contractorUserId', {
        contractorUserId: q.contractorUserId,
      });
    }
    if (q.branchId)
      qb.andWhere('u.branch_id = :branchId', { branchId: q.branchId });
    if (q.periodMonth)
      qb.andWhere('u.period_month = :periodMonth', {
        periodMonth: q.periodMonth,
      });
    if (q.status) qb.andWhere('u.status = :status', { status: q.status });

    const data = await qb
      .orderBy('u.created_at', 'DESC')
      .limit(200)
      .getRawMany();
    return { data, total: data.length };
  }

  async getUploadDetail(user: ReqUser, uploadId: string) {
    const upload = await this.uploadRepo.findOne({ where: { id: uploadId } });
    if (!upload) throw new NotFoundException('MCD upload not found');
    await this.assertUploadVisible(user, upload);
    const rows = await this.rowRepo.find({
      where: { uploadId },
      order: { rowNumber: 'ASC' },
    });
    return { upload, rows };
  }

  async uploadMcdExcel(
    user: ReqUser,
    dto: { branchId?: string; periodMonth?: string },
    file: Express.Multer.File,
  ) {
    if (!file?.buffer) throw new BadRequestException('Excel file is required');
    if (!dto.periodMonth || !/^\d{4}-\d{2}$/.test(dto.periodMonth)) {
      throw new BadRequestException(
        'periodMonth is required in YYYY-MM format',
      );
    }
    if (!user.clientId)
      throw new BadRequestException('Contractor is not linked to a client');

    const branchId = dto.branchId ?? null;
    if (branchId)
      await this.assertContractorLinked(user.clientId, user.id, branchId);

    const parsedRows = await this.parseMcdWorkbook(file.buffer);
    if (!parsedRows.length)
      throw new BadRequestException('No MCD rows found in Excel');

    const upload = await this.uploadRepo.save(
      this.uploadRepo.create({
        clientId: user.clientId,
        branchId,
        contractorUserId: user.id,
        periodMonth: dto.periodMonth,
        fileName: file.originalname,
        uploadedByUserId: user.id,
        status: 'COMPLIANT',
      }),
    );

    const computedRows: ContractorMcdRowEntity[] = [];
    for (const parsed of parsedRows) {
      computedRows.push(
        await this.computeMcdRow(
          upload.id,
          user.clientId,
          user.id,
          branchId,
          dto.periodMonth,
          parsed,
        ),
      );
    }

    await this.rowRepo.save(computedRows);

    const mismatchRows = computedRows.filter(
      (r) => r.matchStatus !== 'MATCHED',
    ).length;
    const errorRows = computedRows.filter(
      (r) => r.matchStatus === 'INVALID',
    ).length;
    const status: ContractorMcdUploadStatus =
      errorRows > 0 ? 'ERROR' : mismatchRows > 0 ? 'MISMATCH' : 'COMPLIANT';

    upload.totalRows = computedRows.length;
    upload.matchedRows = computedRows.length - mismatchRows;
    upload.mismatchRows = mismatchRows;
    upload.errorRows = errorRows;
    upload.status = status;

    if (mismatchRows > 0) {
      const notification = await this.notifyCrm(upload, computedRows);
      upload.notificationId = notification.id;
    }

    await this.uploadRepo.save(upload);

    return {
      uploadId: upload.id,
      status: upload.status,
      totalRows: upload.totalRows,
      matchedRows: upload.matchedRows,
      mismatchRows: upload.mismatchRows,
      errorRows: upload.errorRows,
      notificationId: upload.notificationId,
      rows: computedRows.slice(0, 50),
    };
  }

  private async computeMcdRow(
    uploadId: string,
    clientId: string,
    contractorUserId: string,
    branchId: string | null,
    periodMonth: string,
    row: McdParsedRow,
  ): Promise<ContractorMcdRowEntity> {
    const reasons: string[] = [];
    const quotation = await this.findQuotation(
      clientId,
      contractorUserId,
      branchId,
      row.skillCategory,
      `${periodMonth}-01`,
    );

    if (!quotation)
      reasons.push('No quotation wage configured for this skill category');

    const quotationDailyWage = quotation?.dailyWage ?? null;
    if (
      quotationDailyWage != null &&
      row.dailyWage != null &&
      row.dailyWage !== quotationDailyWage
    ) {
      reasons.push(
        `MCD daily wage ${row.dailyWage} does not match quotation daily wage ${quotationDailyWage}`,
      );
    }

    const appliedDailyWage = quotationDailyWage ?? row.dailyWage ?? 0;
    const expectedBasicWage = this.round(appliedDailyWage * row.daysWorked);
    if (
      row.basicWage != null &&
      Math.abs(row.basicWage - expectedBasicWage) > 1
    ) {
      reasons.push(
        `Reported basic ${row.basicWage} does not match ${appliedDailyWage} x ${row.daysWorked} = ${expectedBasicWage}`,
      );
    }

    const computedGross = this.round(expectedBasicWage + row.otherEarnings);
    if (
      row.reportedGross != null &&
      Math.abs(row.reportedGross - computedGross) > 1
    ) {
      reasons.push(
        `Reported gross ${row.reportedGross} does not match computed gross ${computedGross}`,
      );
    }

    const pfDeduction = this.computePf(expectedBasicWage);
    const esiDeduction = this.computeEsi(computedGross);
    const ptDeduction = this.computePt(computedGross);
    const netSalary = this.round(
      computedGross -
        pfDeduction -
        esiDeduction -
        ptDeduction -
        row.otherDeductions,
    );

    const matchStatus: ContractorMcdRowStatus = !quotation
      ? 'NO_QUOTATION'
      : reasons.some((r) => r.includes('gross'))
        ? 'GROSS_MISMATCH'
        : reasons.length
          ? 'WAGE_MISMATCH'
          : 'MATCHED';

    return this.rowRepo.create({
      uploadId,
      rowNumber: row.rowNumber,
      employeeCode: row.employeeCode,
      employeeName: row.employeeName,
      skillCategory: row.skillCategory,
      daysWorked: row.daysWorked,
      mcdDailyWage: row.dailyWage,
      quotationDailyWage,
      expectedBasicWage,
      reportedBasicWage: row.basicWage,
      otherEarnings: row.otherEarnings,
      computedGross,
      reportedGross: row.reportedGross,
      pfDeduction,
      esiDeduction,
      ptDeduction,
      otherDeductions: row.otherDeductions,
      netSalary,
      matchStatus,
      mismatchReason: reasons.length ? reasons.join('; ') : null,
      rawData: row.rawData,
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

    if (branchId) {
      qb.andWhere('(q.branch_id = :branchId OR q.branch_id IS NULL)', {
        branchId,
      });
      qb.orderBy('CASE WHEN q.branch_id IS NULL THEN 1 ELSE 0 END', 'ASC');
    } else {
      qb.andWhere('q.branch_id IS NULL');
      qb.orderBy('q.effective_from', 'DESC');
    }

    return qb.addOrderBy('q.effective_from', 'DESC').getOne();
  }

  private async parseMcdWorkbook(buffer: Buffer): Promise<McdParsedRow[]> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);
    const sheet = workbook.worksheets[0];
    if (!sheet) return [];

    const headerRow = sheet.getRow(1);
    const headers = new Map<string, number>();
    headerRow.eachCell((cell, colNumber) => {
      const key = this.normalizeHeader(this.cellValueToString(cell.value));
      if (key) headers.set(key, colNumber);
    });

    const rows: McdParsedRow[] = [];
    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
      const row = sheet.getRow(rowNumber);
      const employeeName = this.cellString(row, headers, [
        'employee_name',
        'name',
      ]);
      const skillRaw = this.cellString(row, headers, [
        'skill_category',
        'skill',
        'category',
      ]);
      if (!employeeName && !skillRaw) continue;

      const daysWorked = this.cellNumber(row, headers, [
        'days_worked',
        'worked_days',
        'days',
      ]);
      if (!employeeName)
        throw new BadRequestException(
          `Row ${rowNumber}: employee name is required`,
        );
      if (!Number.isFinite(daysWorked) || daysWorked <= 0) {
        throw new BadRequestException(
          `Row ${rowNumber}: days worked must be greater than zero`,
        );
      }

      const ot = this.cellNumber(row, headers, ['ot', 'overtime', 'ot_amount']);
      const arrears = this.cellNumber(row, headers, ['arrears', 'arrear']);
      const attendanceBonus = this.cellNumber(row, headers, [
        'attendance_bonus',
        'attn_bonus',
        'att_bonus',
      ]);
      const incentive = this.cellNumber(row, headers, [
        'incentive',
        'incentives',
      ]);
      const bonus = this.cellNumber(row, headers, ['bonus']);
      const other = this.cellNumber(row, headers, [
        'other_earnings',
        'allowance',
        'allowances',
      ]);

      rows.push({
        rowNumber,
        employeeCode:
          this.cellString(row, headers, [
            'employee_code',
            'code',
            'emp_code',
          ]) || null,
        employeeName,
        skillCategory: this.normalizeSkill(skillRaw),
        daysWorked,
        dailyWage: this.cellOptionalNumber(row, headers, [
          'daily_wage',
          'mcd_daily_wage',
          'wage_rate',
        ]),
        basicWage: this.cellOptionalNumber(row, headers, [
          'basic_wage',
          'basic',
          'earned_basic',
        ]),
        ot,
        arrears,
        attendanceBonus,
        incentive,
        bonus,
        otherEarnings: this.round(
          ot + arrears + attendanceBonus + incentive + bonus + other,
        ),
        reportedGross: this.cellOptionalNumber(row, headers, [
          'gross',
          'gross_wage',
          'gross_salary',
        ]),
        otherDeductions: this.cellNumber(row, headers, [
          'other_deductions',
          'deduction',
          'deductions',
        ]),
        rawData: this.rowToObject(row, headers),
      });
    }

    return rows;
  }

  private async notifyCrm(
    upload: ContractorMcdUploadEntity,
    rows: ContractorMcdRowEntity[],
  ) {
    const contractor = await this.userRepo.findOne({
      where: { id: upload.contractorUserId },
    });
    const badRows = rows
      .filter((r) => r.matchStatus !== 'MATCHED')
      .slice(0, 10);
    const details = badRows
      .map(
        (r) =>
          `Row ${r.rowNumber}: ${r.employeeName} (${r.skillCategory}) - ${r.mismatchReason}`,
      )
      .join('\n');
    return this.notifications.createSystemNotification({
      clientId: upload.clientId,
      branchId: upload.branchId ?? undefined,
      sourceKey: `mcd-wage-mismatch:${upload.id}`,
      queryType: 'COMPLIANCE',
      priority: 1,
      subject: `MCD wage mismatch - ${contractor?.name ?? 'Contractor'} - ${upload.periodMonth}`,
      message: `Contractor MCD computation found ${upload.mismatchRows || rows.length} row(s) requiring CRM review.\n\n${details}`,
    });
  }

  private computePf(basicWage: number): number {
    return this.round(Math.min(Math.max(basicWage, 0), 15000) * 0.12);
  }

  private computeEsi(gross: number): number {
    return gross > 0 && gross <= 21000 ? this.round(gross * 0.0075) : 0;
  }

  private computePt(gross: number): number {
    if (gross <= 15000) return 0;
    if (gross <= 20000) return 150;
    return 200;
  }

  private async resolveClient(
    user: ReqUser,
    clientId?: string,
  ): Promise<string> {
    const resolved =
      user.roleCode === 'CONTRACTOR'
        ? user.clientId
        : (clientId ?? user.clientId);
    if (!resolved) throw new BadRequestException('clientId is required');
    await this.scope.assertClientAllowed(user, resolved);
    return resolved;
  }

  private async resolveClientForCrm(
    user: ReqUser,
    clientId?: string,
  ): Promise<string> {
    if (!['ADMIN', 'CRM', 'CEO', 'CCO'].includes(user.roleCode)) {
      throw new ForbiddenException(
        'Only CRM/Admin roles can maintain quotation wages',
      );
    }
    return this.resolveClient(user, clientId);
  }

  private async assertUploadVisible(
    user: ReqUser,
    upload: ContractorMcdUploadEntity,
  ) {
    await this.scope.assertClientAllowed(user, upload.clientId);
    if (user.roleCode === 'CONTRACTOR' && upload.contractorUserId !== user.id) {
      throw new ForbiddenException('Upload belongs to another contractor');
    }
  }

  private async assertContractorLinked(
    clientId: string,
    contractorUserId: string,
    branchId?: string | null,
  ) {
    const where: any = { clientId, contractorUserId };
    if (branchId) where.branchId = branchId;
    const link = await this.branchContractorRepo.findOne({ where });
    if (!link)
      throw new BadRequestException(
        'Contractor is not linked to this client/branch',
      );
  }

  private normalizeSkill(value: string): ContractorWageSkill {
    const normalized = String(value || '')
      .trim()
      .toUpperCase()
      .replace(/[\s-]+/g, '_') as ContractorWageSkill;
    if (!SKILLS.includes(normalized)) {
      throw new BadRequestException(`Invalid skill category: ${value}`);
    }
    return normalized;
  }

  private normalizeHeader(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
  }

  private cellString(
    row: ExcelJS.Row,
    headers: Map<string, number>,
    names: string[],
  ): string {
    for (const name of names) {
      const col = headers.get(name);
      if (!col) continue;
      const text = this.cellValueToString(row.getCell(col).value);
      if (text.trim()) return text.trim();
    }
    return '';
  }

  private cellNumber(
    row: ExcelJS.Row,
    headers: Map<string, number>,
    names: string[],
  ): number {
    return this.cellOptionalNumber(row, headers, names) ?? 0;
  }

  private cellOptionalNumber(
    row: ExcelJS.Row,
    headers: Map<string, number>,
    names: string[],
  ): number | null {
    const text = this.cellString(row, headers, names).replace(/,/g, '');
    if (!text) return null;
    const n = Number(text);
    return Number.isFinite(n) ? n : null;
  }

  private rowToObject(
    row: ExcelJS.Row,
    headers: Map<string, number>,
  ): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [key, col] of headers.entries()) {
      out[key] = this.cellValueToString(row.getCell(col).value);
    }
    return out;
  }

  private cellValueToString(value: ExcelJS.CellValue): string {
    if (value == null) return '';
    if (typeof value === 'string' || typeof value === 'number') {
      return String(value);
    }
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'object') {
      if ('text' in value) return this.unknownToString(value.text);
      if ('result' in value)
        return this.cellValueToString(value.result as ExcelJS.CellValue);
      if ('richText' in value) {
        return value.richText.map((part) => part.text).join('');
      }
      if ('hyperlink' in value && 'text' in value)
        return this.unknownToString(value.text);
    }
    return '';
  }

  private unknownToString(value: unknown): string {
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

  private toNumber(value: unknown, field: string): number {
    const n = Number(value);
    if (!Number.isFinite(n))
      throw new BadRequestException(`${field} must be numeric`);
    return n;
  }

  private isDate(value: string): boolean {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
  }

  private round(n: number): number {
    return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  }
}
