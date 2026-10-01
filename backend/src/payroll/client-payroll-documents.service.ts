import * as fs from 'fs';
import archiver from 'archiver';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Response } from 'express';
import { In, Repository } from 'typeorm';
import { ReqUser } from '../access/access-scope.service';
import { EmployeeEntity } from '../employees/entities/employee.entity';
import {
  assembleEmployeePayrollRecords,
  employeeBranchAllowed,
  FnfDocumentSource,
  FnfSource,
  isFinalizedFnfStatus,
  isApprovedPayrollRun,
  isClientFnfDocType,
  PayslipArchiveSource,
  resolveAuthorizedBranches,
  RunEmployeeSource,
} from './client-payroll-document-access';
import { PayrollClientSettings } from './entities/payroll-client-settings.entity';
import { PayrollFnfDocumentEntity } from './entities/payroll-fnf-document.entity';
import { PayrollFnfEntity } from './entities/payroll-fnf.entity';
import { PayrollPayslipArchiveEntity } from './entities/payroll-payslip-archive.entity';
import { PayrollRunEmployeeEntity } from './entities/payroll-run-employee.entity';
import { PayrollRunEntity } from './entities/payroll-run.entity';
import { PayrollFnfService } from './payroll-fnf.service';

export interface ClientPayrollRecordQuery {
  periodYear?: string | number;
  periodMonth?: string | number;
  branchId?: string;
  search?: string;
}

@Injectable()
export class ClientPayrollDocumentsService {
  constructor(
    @InjectRepository(PayrollClientSettings)
    private readonly clientSettingsRepo: Repository<PayrollClientSettings>,
    @InjectRepository(PayrollRunEntity)
    private readonly runRepo: Repository<PayrollRunEntity>,
    @InjectRepository(PayrollRunEmployeeEntity)
    private readonly runEmployeeRepo: Repository<PayrollRunEmployeeEntity>,
    @InjectRepository(PayrollPayslipArchiveEntity)
    private readonly payslipArchiveRepo: Repository<PayrollPayslipArchiveEntity>,
    @InjectRepository(PayrollFnfEntity)
    private readonly fnfRepo: Repository<PayrollFnfEntity>,
    @InjectRepository(PayrollFnfDocumentEntity)
    private readonly fnfDocRepo: Repository<PayrollFnfDocumentEntity>,
    @InjectRepository(EmployeeEntity)
    private readonly employeeRepo: Repository<EmployeeEntity>,
    private readonly fnfService: PayrollFnfService,
  ) {}

  private fileExists = (filePath: string) =>
    !!filePath && fs.existsSync(filePath);

  async listEmployeeRecords(user: ReqUser, q: ClientPayrollRecordQuery) {
    const clientId = await this.assertClientPayrollUser(user);
    const periodYear = Number(q.periodYear);
    const periodMonth = Number(q.periodMonth);
    if (!periodYear || !periodMonth || periodMonth < 1 || periodMonth > 12) {
      return {
        periodYear: periodYear || null,
        periodMonth: periodMonth || null,
        records: [],
        bulkPayslipAvailable: false,
      };
    }

    const scope = await this.branchScope(user, q.branchId);
    const search = normalizeSearch(q.search);
    const [runEmployees, archives, fnfCases, fnfDocuments] = await Promise.all([
      this.loadRunEmployees(clientId, periodYear, periodMonth),
      this.loadArchives(clientId, periodYear, periodMonth),
      this.loadFnfCases(clientId, periodYear, periodMonth),
      this.loadFnfDocuments(clientId),
    ]);
    const employees = await this.loadEmployees(clientId, [
      ...runEmployees.map((row) => row.employeeId),
      ...fnfCases.map((row) => row.employeeId),
    ]);

    const assembled = assembleEmployeePayrollRecords({
      periodYear,
      periodMonth,
      branchIds: scope.branchIds,
      runEmployees,
      archives,
      fnfCases,
      fnfDocuments,
      employees,
      fileExists: this.fileExists,
    });
    const records = search
      ? assembled.records.filter((row) =>
          `${row.employeeName} ${row.employeeCode}`
            .toLowerCase()
            .includes(search),
        )
      : assembled.records;

    return {
      periodYear,
      periodMonth,
      records,
      bulkPayslipAvailable: records.some((row) => row.payslipAvailable),
    };
  }

  async downloadPayslip(user: ReqUser, runId: string, employeeCode: string) {
    const clientId = await this.assertClientPayrollUser(user);
    const code = String(employeeCode || '').trim();
    if (!runId || !code) {
      throw new BadRequestException('runId and employeeCode are required');
    }

    const run = await this.runRepo.findOne({ where: { id: runId } });
    if (
      !run ||
      run.clientId !== clientId ||
      !isApprovedPayrollRun(run.status)
    ) {
      throw new NotFoundException('Payslip is not available');
    }

    const emp = await this.runEmployeeRepo.findOne({
      where: { runId, employeeCode: code },
    });
    if (!emp || emp.clientId !== clientId) {
      throw new NotFoundException('Payslip is not available');
    }

    const branchId = await this.resolveEmployeeBranch(
      emp.branchId || run.branchId,
      emp.employeeId,
      clientId,
    );
    await this.assertEmployeeBranch(user, branchId);

    const archive = await this.payslipArchiveRepo.findOne({
      where: { runId, employeeCode: code, clientId },
    });
    if (!archive?.filePath || !this.fileExists(archive.filePath)) {
      throw new NotFoundException('Payslip is not available');
    }

    return {
      fileName: safeFileName(archive.fileName, `payslip_${code}.pdf`),
      fileType: archive.fileType || 'application/pdf',
      buffer: fs.readFileSync(archive.filePath),
    };
  }

  async streamPayslipPack(
    user: ReqUser,
    q: ClientPayrollRecordQuery,
    res: Response,
  ) {
    const listed = await this.listEmployeeRecords(user, q);
    const ready = listed.records.filter(
      (row) => row.payslipAvailable && row.runId,
    );
    if (!ready.length) {
      throw new NotFoundException(
        'No published payslips are available for this month',
      );
    }

    const files: { filePath: string; fileName: string }[] = [];
    const used = new Set<string>();
    for (const row of ready) {
      const archive = await this.payslipArchiveRepo.findOne({
        where: {
          runId: row.runId!,
          employeeCode: row.employeeCode,
          clientId: user.clientId!,
        },
      });
      if (!archive?.filePath || !this.fileExists(archive.filePath)) continue;
      const fileName = uniqueName(
        safeFileName(archive.fileName, `payslip_${row.employeeCode}.pdf`),
        used,
      );
      files.push({ filePath: archive.filePath, fileName });
    }
    if (!files.length) {
      throw new NotFoundException(
        'No published payslips are available for this month',
      );
    }

    const period = `${listed.periodYear}_${String(listed.periodMonth).padStart(2, '0')}`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="payslips_${period}.zip"`,
    );
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (err) => {
      res.destroy(err);
    });
    archive.pipe(res);
    for (const file of files) {
      archive.file(file.filePath, { name: file.fileName });
    }
    await archive.finalize();
  }

  async downloadFnfDocument(user: ReqUser, fnfId: string, docType: string) {
    const clientId = await this.assertClientPayrollUser(user);
    const type = String(docType || '').toUpperCase();
    if (!isClientFnfDocType(type)) {
      throw new BadRequestException(
        'Unsupported document. Allowed: SETTLEMENT_STATEMENT, RELIEVING_LETTER',
      );
    }

    const fnf = await this.fnfRepo.findOne({ where: { id: fnfId } });
    if (
      !fnf ||
      fnf.clientId !== clientId ||
      !isFinalizedFnfStatus(fnf.status)
    ) {
      throw new NotFoundException('Document is not available');
    }

    const employee = await this.employeeRepo.findOne({
      where: { id: fnf.employeeId, clientId },
    });
    if (!employee) throw new NotFoundException('Document is not available');
    await this.assertEmployeeBranch(user, employee.branchId);

    const stored = await this.fnfDocRepo.find({
      where: { fnfId, clientId, docType: type },
      order: { createdAt: 'DESC' },
    });
    const file = stored.find(
      (doc) => doc.filePath && this.fileExists(doc.filePath),
    );
    if (file) {
      return {
        fileName: safeFileName(file.fileName || file.docName, `${type}.pdf`),
        fileType: file.mimeType || 'application/pdf',
        buffer: fs.readFileSync(file.filePath),
      };
    }

    const rendered = await this.fnfService.renderFnfDocumentPdf(fnfId, type);
    return {
      fileName: safeFileName(rendered.filename, `${type}.pdf`),
      fileType: rendered.mimeType || 'application/pdf',
      buffer: rendered.buffer,
    };
  }

  private async assertClientPayrollUser(user: ReqUser): Promise<string> {
    if (!user?.id || user.roleCode !== 'CLIENT' || !user.clientId) {
      throw new ForbiddenException(
        'Only client users can access this resource',
      );
    }
    if (user.userType === 'BRANCH') {
      const toggles = await this.readSettings(user.clientId);
      if (!toggles.allowBranchPayrollAccess) {
        throw new ForbiddenException(
          'Payroll access has not been enabled for branch users',
        );
      }
    }
    return user.clientId;
  }

  private async branchScope(user: ReqUser, requestedBranchId?: string | null) {
    const toggles = user.clientId
      ? await this.readSettings(user.clientId)
      : {
          allowBranchPayrollAccess: false,
          payrollBranchScope: 'ALL' as const,
          payrollAllowedBranchIds: [] as string[],
        };
    const scope = resolveAuthorizedBranches({
      userType: user.userType,
      userBranchIds: user.branchIds,
      payrollBranchScope: toggles.payrollBranchScope,
      payrollAllowedBranchIds: toggles.payrollAllowedBranchIds,
      requestedBranchId: requestedBranchId || null,
    });
    if (scope.forbidden) {
      throw new ForbiddenException(
        'You can only download documents for employees in your authorized branches',
      );
    }
    return scope;
  }

  private async assertEmployeeBranch(
    user: ReqUser,
    employeeBranchId: string | null | undefined,
  ) {
    const scope = await this.branchScope(user);
    if (!employeeBranchAllowed(scope.branchIds, employeeBranchId)) {
      throw new ForbiddenException(
        'You can only download documents for employees in your authorized branches',
      );
    }
  }

  private async readSettings(clientId: string) {
    const row = await this.clientSettingsRepo.findOne({ where: { clientId } });
    const settings = row?.settings || {};
    return {
      allowBranchPayrollAccess: settings.allowBranchPayrollAccess === true,
      payrollBranchScope:
        settings.payrollBranchScope === 'SELECTED' ? 'SELECTED' : 'ALL',
      payrollAllowedBranchIds: Array.isArray(settings.payrollAllowedBranchIds)
        ? settings.payrollAllowedBranchIds.map(String)
        : [],
    };
  }

  private async resolveEmployeeBranch(
    knownBranchId: string | null | undefined,
    employeeId: string | null | undefined,
    clientId: string,
  ): Promise<string | null> {
    if (knownBranchId) return knownBranchId;
    if (!employeeId) return null;
    const employee = await this.employeeRepo.findOne({
      where: { id: employeeId, clientId },
    });
    return employee?.branchId ?? null;
  }

  private async loadRunEmployees(
    clientId: string,
    periodYear: number,
    periodMonth: number,
  ): Promise<RunEmployeeSource[]> {
    const rows = await this.runEmployeeRepo
      .createQueryBuilder('e')
      .innerJoin(PayrollRunEntity, 'r', 'r.id = e.run_id')
      .select('e.employee_id', 'employeeId')
      .addSelect('e.employee_code', 'employeeCode')
      .addSelect('e.employee_name', 'employeeName')
      .addSelect('e.branch_id', 'branchId')
      .addSelect('e.run_id', 'runId')
      .addSelect('r.status', 'runStatus')
      .addSelect('r.branch_id', 'runBranchId')
      .where('e.client_id = :clientId', { clientId })
      .andWhere('r.period_year = :periodYear', { periodYear })
      .andWhere('r.period_month = :periodMonth', { periodMonth })
      .getRawMany<Record<string, unknown>>();
    return rows.map((row) => ({
      employeeId: text(row, 'employeeId'),
      employeeCode: text(row, 'employeeCode') || '',
      employeeName: text(row, 'employeeName') || '',
      branchId: text(row, 'branchId'),
      runId: text(row, 'runId') || '',
      runStatus: text(row, 'runStatus'),
      runBranchId: text(row, 'runBranchId'),
    }));
  }

  private async loadArchives(
    clientId: string,
    periodYear: number,
    periodMonth: number,
  ): Promise<PayslipArchiveSource[]> {
    const rows = await this.payslipArchiveRepo.find({
      where: { clientId, periodYear, periodMonth },
    });
    return rows.map((row) => ({
      runId: row.runId,
      employeeCode: row.employeeCode,
      fileName: row.fileName,
      filePath: row.filePath,
    }));
  }

  private async loadFnfCases(
    clientId: string,
    periodYear: number,
    periodMonth: number,
  ): Promise<FnfSource[]> {
    const start = `${periodYear}-${String(periodMonth).padStart(2, '0')}-01`;
    const rows = await this.fnfRepo
      .createQueryBuilder('f')
      .where('f.client_id = :clientId', { clientId })
      .andWhere(
        `COALESCE(f.last_working_day, f.separation_date) >= CAST(:start AS date)
         AND COALESCE(f.last_working_day, f.separation_date) < CAST(:start AS date) + INTERVAL '1 month'`,
        { start },
      )
      .getMany();
    return rows.map((row) => ({
      id: row.id,
      employeeId: row.employeeId,
      status: row.status,
      updatedAt: row.updatedAt,
      separationDate: row.separationDate,
      lastWorkingDay: row.lastWorkingDay,
    }));
  }

  private async loadFnfDocuments(
    clientId: string,
  ): Promise<FnfDocumentSource[]> {
    const rows = await this.fnfDocRepo.find({
      where: {
        clientId,
        docType: In(['SETTLEMENT_STATEMENT', 'RELIEVING_LETTER']),
      },
    });
    return rows.map((row) => ({
      fnfId: row.fnfId,
      employeeId: row.employeeId,
      docType: row.docType,
      fileName: row.fileName,
      filePath: row.filePath,
      createdAt: row.createdAt,
    }));
  }

  private async loadEmployees(
    clientId: string,
    employeeIds: Array<string | null>,
  ) {
    const ids = [...new Set(employeeIds.filter((id): id is string => !!id))];
    if (!ids.length) return [];
    return this.employeeRepo.find({
      where: { clientId, id: In(ids) },
      select: ['id', 'branchId', 'name', 'employeeCode'],
    });
  }
}

function text(row: Record<string, unknown>, key: string): string | null {
  const value = row[key] ?? row[key.toLowerCase()];
  if (typeof value === 'string') return value || null;
  if (typeof value === 'number' || typeof value === 'bigint') {
    return String(value);
  }
  return null;
}

function normalizeSearch(search?: string): string {
  return String(search || '')
    .replace(/[%_\\]/g, '')
    .trim()
    .toLowerCase()
    .slice(0, 80);
}

function safeFileName(
  name: string | null | undefined,
  fallback: string,
): string {
  const cleaned = String(name || fallback)
    .replace(/[\r\n"]/g, '_')
    .replace(/[\\/:*?<>|]+/g, '_')
    .trim();
  return cleaned || fallback;
}

function uniqueName(name: string, used: Set<string>): string {
  let next = name;
  let index = 2;
  while (used.has(next.toLowerCase())) {
    const dot = name.lastIndexOf('.');
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : '';
    next = `${stem}_${index}${ext}`;
    index += 1;
  }
  used.add(next.toLowerCase());
  return next;
}
