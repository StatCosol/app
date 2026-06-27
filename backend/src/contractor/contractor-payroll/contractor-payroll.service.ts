import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import * as ExcelJS from 'exceljs';
import { ContractorEmployeeEntity } from '../contractor-employees/entities/contractor-employee.entity';
import { ContractorAttendanceUploadEntity } from './entities/contractor-attendance-upload.entity';
import { ContractorAttendanceRecordEntity } from './entities/contractor-attendance-record.entity';
import { ContractorPayrollSheetEntity } from './entities/contractor-payroll-sheet.entity';
import { ContractorPayrollSheetRowEntity } from './entities/contractor-payroll-sheet-row.entity';

const DAYS_IN_MONTH = 26; // statutory working days denominator (India standard)
const PF_CAP = 15_000;
const PF_EMPLOYEE_RATE = 0.12;
const PF_EMPLOYER_RATE = 0.1367; // 12% PF + 1% EDLI + 0.5% admin (rounded)
const ESI_GROSS_LIMIT = 21_000;
const ESI_EMPLOYEE_RATE = 0.0075;
const ESI_EMPLOYER_RATE = 0.0325;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function daysInMonth(month: number, year: number): number {
  return new Date(year, month, 0).getDate();
}

function dateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

@Injectable()
export class ContractorPayrollService {
  constructor(
    @InjectRepository(ContractorEmployeeEntity)
    private readonly empRepo: Repository<ContractorEmployeeEntity>,
    @InjectRepository(ContractorAttendanceUploadEntity)
    private readonly uploadRepo: Repository<ContractorAttendanceUploadEntity>,
    @InjectRepository(ContractorAttendanceRecordEntity)
    private readonly recordRepo: Repository<ContractorAttendanceRecordEntity>,
    @InjectRepository(ContractorPayrollSheetEntity)
    private readonly sheetRepo: Repository<ContractorPayrollSheetEntity>,
    @InjectRepository(ContractorPayrollSheetRowEntity)
    private readonly rowRepo: Repository<ContractorPayrollSheetRowEntity>,
    private readonly dataSource: DataSource,
  ) {}

  // ─── Attendance Template ───────────────────────────────────────────────────

  async generateAttendanceTemplate(
    clientId: string,
    branchId: string | null,
    month: number,
    year: number,
  ): Promise<Buffer> {
    const employees = await this.getActiveEmployees(clientId, branchId);
    const totalDays = daysInMonth(month, year);

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Attendance');
    ws.properties.defaultColWidth = 10;

    // Build header row
    const dayHeaders = Array.from({ length: totalDays }, (_, i) =>
      new Date(year, month - 1, i + 1).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit' }),
    );
    ws.addRow(['Employee Name', 'Employee ID', ...dayHeaders, 'Total Present']);

    // Style header
    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.alignment = { horizontal: 'center', wrapText: true };

    // Freeze first 2 columns
    ws.views = [{ state: 'frozen', xSplit: 2, ySplit: 1 }];
    ws.getColumn(1).width = 30;
    ws.getColumn(2).width = 20;

    // Data rows
    employees.forEach((emp, i) => {
      const rowNum = i + 2;
      const totalCol = 2 + totalDays + 1; // column index for Total Present
      const dayStartCol = 3;
      const dayEndCol = 2 + totalDays;

      // Add employee name + id
      const row = ws.addRow([emp.name, emp.id, ...Array(totalDays).fill('')]);

      // Data validation on day cells: P, A, H only
      for (let d = 1; d <= totalDays; d++) {
        const cell = ws.getCell(rowNum, dayStartCol + d - 1);
        cell.dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: ['"P,A,H"'],
          showErrorMessage: true,
          errorTitle: 'Invalid',
          error: 'Enter P (Present), A (Absent), or H (Half-Day)',
        };
        // Shade Sundays grey
        const dow = new Date(year, month - 1, d).getDay();
        if (dow === 0) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEEEEE' } };
        }
      }

      // Total Present formula: count "P" + 0.5 × count "H"
      const startAddr = `${colLetter(dayStartCol)}${rowNum}`;
      const endAddr = `${colLetter(dayEndCol)}${rowNum}`;
      const totalCell = ws.getCell(rowNum, totalCol);
      totalCell.value = {
        formula: `COUNTIF(${startAddr}:${endAddr},"P")+COUNTIF(${startAddr}:${endAddr},"H")*0.5`,
      };
      totalCell.font = { bold: true };
    });

    // Lock Name & ID columns (protect sheet except day columns)
    ws.getColumn(1).protection = { locked: true };
    ws.getColumn(2).protection = { locked: true };

    return wb.xlsx.writeBuffer() as unknown as Promise<Buffer>;
  }

  // ─── Upload Attendance ─────────────────────────────────────────────────────

  async processAttendanceUpload(
    file: Express.Multer.File,
    clientId: string,
    branchId: string | null,
    contractorUserId: string,
    month: number,
    year: number,
  ): Promise<{ uploadId: string; rowsProcessed: number }> {
    const wb = new ExcelJS.Workbook();
    await (wb.xlsx as any).load(file.buffer);
    const ws = wb.getWorksheet('Attendance') ?? wb.worksheets[0];
    if (!ws) throw new BadRequestException('Could not find Attendance sheet in uploaded file');

    const totalDays = daysInMonth(month, year);
    const errors: string[] = [];
    const records: Array<{
      contractorEmployeeId: string;
      date: string;
      status: 'PRESENT' | 'ABSENT' | 'HALF_DAY';
    }> = [];

    ws.eachRow((row, rowNum) => {
      if (rowNum === 1) return; // skip header
      const empId = String(row.getCell(2).value ?? '').trim();
      if (!empId || empId === 'Employee ID') return;

      for (let d = 1; d <= totalDays; d++) {
        const raw = String(row.getCell(2 + d).value ?? '').trim().toUpperCase();
        if (!raw || raw === 'WO' || raw === '') continue; // week-off / blank
        if (!['P', 'A', 'H'].includes(raw)) {
          errors.push(`Row ${rowNum}, Day ${d}: invalid value "${raw}"`);
          continue;
        }
        records.push({
          contractorEmployeeId: empId,
          date: dateStr(year, month, d),
          status: raw === 'P' ? 'PRESENT' : raw === 'A' ? 'ABSENT' : 'HALF_DAY',
        });
      }
    });

    if (errors.length > 10) {
      throw new BadRequestException(
        `Upload contains too many errors (${errors.length}). First 10: ${errors.slice(0, 10).join('; ')}`,
      );
    }

    return this.dataSource.transaction(async (em) => {
      const upload = em.create(ContractorAttendanceUploadEntity, {
        clientId,
        branchId,
        contractorUserId,
        month,
        year,
        status: 'DONE',
        rowsProcessed: records.length,
        errorSummary: errors.length ? errors.join('\n') : null,
      });
      const saved = await em.save(ContractorAttendanceUploadEntity, upload);

      // Delete previous UPLOAD records for this month before inserting fresh ones
      await em
        .createQueryBuilder()
        .delete()
        .from(ContractorAttendanceRecordEntity)
        .where('client_id = :clientId', { clientId })
        .andWhere("source = 'UPLOAD'")
        .andWhere(
          `date_trunc('month', attendance_date::timestamptz) = :m`,
          { m: dateStr(year, month, 1) },
        )
        .execute();

      for (const r of records) {
        await em.upsert(
          ContractorAttendanceRecordEntity,
          {
            uploadId: saved.id,
            contractorEmployeeId: r.contractorEmployeeId,
            clientId,
            branchId,
            attendanceDate: r.date,
            status: r.status,
            source: 'UPLOAD' as const,
          },
          ['contractorEmployeeId', 'attendanceDate', 'source'],
        );
      }

      return { uploadId: saved.id, rowsProcessed: records.length };
    });
  }

  // ─── Generate / Refresh Wage Sheet ────────────────────────────────────────

  async generateSheet(
    clientId: string,
    branchId: string | null,
    month: number,
    year: number,
    generatedBy: string,
  ): Promise<ContractorPayrollSheetEntity> {
    const existing = await this.sheetRepo.findOne({
      where: { clientId, branchId: branchId ?? undefined, month, year },
    });
    if (existing?.status === 'APPROVED') {
      throw new ConflictException('Wage sheet is already approved and cannot be regenerated');
    }

    const employees = await this.getActiveEmployees(clientId, branchId);
    if (employees.length === 0) {
      throw new BadRequestException('No active contractor employees found for this branch/client');
    }

    const sheet = existing ?? this.sheetRepo.create({ clientId, branchId, month, year });
    sheet.status = existing?.status === 'SUBMITTED' ? 'SUBMITTED' : 'DRAFT';
    const savedSheet = await this.sheetRepo.save(sheet);

    await this.dataSource.transaction(async (em) => {
      for (const emp of employees) {
        const { workedDays, source } = await this.computeWorkedDays(
          em,
          emp.id,
          clientId,
          month,
          year,
        );

        const monthlyGross = emp.monthlySalary ?? 0;
        const basicDaPct = emp.basicDaPct ?? 50;
        const dailyRate = monthlyGross / DAYS_IN_MONTH;
        const earnedGross = round2(dailyRate * workedDays);

        const basicDa = round2(monthlyGross * basicDaPct / 100);
        const pfBasis = emp.pfApplicable ? round2(Math.min(basicDa, PF_CAP)) : 0;
        const pfEmployee = emp.pfApplicable ? round2(pfBasis * PF_EMPLOYEE_RATE) : 0;
        const pfEmployer = emp.pfApplicable ? round2(pfBasis * PF_EMPLOYER_RATE) : 0;

        const esiApplicable = emp.esiApplicable && monthlyGross <= ESI_GROSS_LIMIT;
        const esiEmployee = esiApplicable ? round2(earnedGross * ESI_EMPLOYEE_RATE) : 0;
        const esiEmployer = esiApplicable ? round2(earnedGross * ESI_EMPLOYER_RATE) : 0;

        const netPay = round2(earnedGross - pfEmployee - esiEmployee);
        const ctc = round2(earnedGross + pfEmployer + esiEmployer);

        await em.upsert(
          ContractorPayrollSheetRowEntity,
          {
            sheetId: savedSheet.id,
            contractorEmployeeId: emp.id,
            employeeName: emp.name,
            designation: emp.designation ?? null,
            monthlyGross,
            basicDaPct,
            workedDays,
            dailyRate: round2(dailyRate),
            earnedGross,
            pfBasis,
            pfEmployee,
            pfEmployer,
            esiEmployee,
            esiEmployer,
            netPay,
            ctc,
            attendanceSource: source,
          },
          ['sheetId', 'contractorEmployeeId'],
        );
      }
    });

    return savedSheet;
  }

  // ─── Get Sheet with Rows ──────────────────────────────────────────────────

  async getSheet(
    clientId: string,
    branchId: string | null,
    month: number,
    year: number,
  ): Promise<{ sheet: ContractorPayrollSheetEntity | null; rows: ContractorPayrollSheetRowEntity[] }> {
    const sheet = await this.sheetRepo.findOne({
      where: { clientId, branchId: branchId ?? undefined, month, year },
    });
    if (!sheet) return { sheet: null, rows: [] };
    const rows = await this.rowRepo.find({
      where: { sheetId: sheet.id },
      order: { employeeName: 'ASC' },
    });
    return { sheet, rows };
  }

  // ─── Submit (Branch Desk) ─────────────────────────────────────────────────

  async submitSheet(
    clientId: string,
    sheetId: string,
    submittedBy: string,
  ): Promise<ContractorPayrollSheetEntity> {
    const sheet = await this.sheetRepo.findOne({ where: { id: sheetId, clientId } });
    if (!sheet) throw new NotFoundException('Wage sheet not found');
    if (sheet.status !== 'DRAFT') {
      throw new ConflictException(`Sheet is already ${sheet.status} — only DRAFT sheets can be submitted`);
    }
    sheet.status = 'SUBMITTED';
    sheet.submittedBy = submittedBy;
    sheet.submittedAt = new Date();
    return this.sheetRepo.save(sheet);
  }

  // ─── Approve / Reject (Client User) ──────────────────────────────────────

  async reviewSheet(
    clientId: string,
    sheetId: string,
    action: 'APPROVE' | 'REJECT',
    note: string | null,
    reviewedBy: string,
  ): Promise<ContractorPayrollSheetEntity> {
    const sheet = await this.sheetRepo.findOne({ where: { id: sheetId, clientId } });
    if (!sheet) throw new NotFoundException('Wage sheet not found');
    if (sheet.status !== 'SUBMITTED') {
      throw new ConflictException(`Only SUBMITTED sheets can be reviewed (current: ${sheet.status})`);
    }
    if (action === 'REJECT' && !note) {
      throw new BadRequestException('Rejection reason is required');
    }
    sheet.status = action === 'APPROVE' ? 'APPROVED' : 'REJECTED';
    sheet.reviewedBy = reviewedBy;
    sheet.reviewedAt = new Date();
    sheet.reviewNote = note ?? null;
    return this.sheetRepo.save(sheet);
  }

  // ─── Export Sheet to Excel ────────────────────────────────────────────────

  async exportSheet(
    clientId: string,
    sheetId: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const sheet = await this.sheetRepo.findOne({ where: { id: sheetId, clientId } });
    if (!sheet) throw new NotFoundException('Wage sheet not found');
    const rows = await this.rowRepo.find({
      where: { sheetId: sheet.id },
      order: { employeeName: 'ASC' },
    });

    const monthName = new Date(sheet.year, sheet.month - 1).toLocaleString('en-IN', { month: 'long' });
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(`${monthName} ${sheet.year}`);

    const headers = [
      'Employee Name', 'Designation', 'Monthly Gross', 'Worked Days',
      'Daily Rate', 'Earned Gross', 'PF Basis', 'PF (Employee)', 'PF (Employer)',
      'ESI (Employee)', 'ESI (Employer)', 'Net Pay', 'CTC', 'Attendance Source',
    ];
    ws.addRow(headers);
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

    for (const r of rows) {
      ws.addRow([
        r.employeeName, r.designation ?? '', r.monthlyGross, r.workedDays,
        r.dailyRate, r.earnedGross, r.pfBasis, r.pfEmployee, r.pfEmployer,
        r.esiEmployee, r.esiEmployer, r.netPay, r.ctc, r.attendanceSource,
      ]);
    }

    // Totals row
    const totalRow = ws.addRow([
      'TOTAL', '', '', '',
      '', rows.reduce((s, r) => s + r.earnedGross, 0),
      '', rows.reduce((s, r) => s + r.pfEmployee, 0), rows.reduce((s, r) => s + r.pfEmployer, 0),
      rows.reduce((s, r) => s + r.esiEmployee, 0), rows.reduce((s, r) => s + r.esiEmployer, 0),
      rows.reduce((s, r) => s + r.netPay, 0), rows.reduce((s, r) => s + r.ctc, 0), '',
    ]);
    totalRow.font = { bold: true };

    ws.columns.forEach((col) => { col.width = 18; });
    ws.getColumn(1).width = 30;

    const buffer = (await wb.xlsx.writeBuffer()) as unknown as Buffer;
    return {
      buffer,
      filename: `contractor-wage-sheet-${monthName}-${sheet.year}.xlsx`,
    };
  }

  // ─── List Sheets (for admin/auditor list view) ────────────────────────────

  async listSheets(
    clientId: string,
    branchIds: string[],
    year?: number,
  ): Promise<ContractorPayrollSheetEntity[]> {
    const qb = this.sheetRepo
      .createQueryBuilder('s')
      .where('s.clientId = :clientId', { clientId })
      .orderBy('s.year', 'DESC')
      .addOrderBy('s.month', 'DESC');

    if (branchIds.length > 0) {
      qb.andWhere('s.branchId IN (:...branchIds)', { branchIds });
    }
    if (year) {
      qb.andWhere('s.year = :year', { year });
    }
    return qb.getMany();
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  private async getActiveEmployees(
    clientId: string,
    branchId: string | null,
  ): Promise<ContractorEmployeeEntity[]> {
    const where: Record<string, unknown> = { clientId, isActive: true };
    if (branchId) where['branchId'] = branchId;
    return this.empRepo.find({ where: where as any });
  }

  private async computeWorkedDays(
    em: any,
    contractorEmployeeId: string,
    clientId: string,
    month: number,
    year: number,
  ): Promise<{ workedDays: number; source: 'UPLOAD' | 'KIOSK' | 'MIXED' | 'NONE' }> {
    const monthStart = dateStr(year, month, 1);
    const monthEnd = dateStr(year, month, daysInMonth(month, year));

    // Check if there's an upload-based record for this month
    const uploadRecords = await em.getRepository(ContractorAttendanceRecordEntity).find({
      where: {
        contractorEmployeeId,
        clientId,
        source: 'UPLOAD',
      },
      select: ['attendanceDate', 'status'],
    });

    const uploadForMonth = uploadRecords.filter(
      (r: ContractorAttendanceRecordEntity) => r.attendanceDate >= monthStart && r.attendanceDate <= monthEnd,
    );

    if (uploadForMonth.length > 0) {
      // Upload takes precedence
      const days = uploadForMonth.reduce((sum: number, r: ContractorAttendanceRecordEntity) => {
        if (r.status === 'PRESENT') return sum + 1;
        if (r.status === 'HALF_DAY') return sum + 0.5;
        return sum;
      }, 0);
      return { workedDays: days, source: 'UPLOAD' };
    }

    // Fall back to kiosk punches — count distinct dates with at least one punch
    const rows: Array<{ cnt: string }> = await em.query(
      `SELECT COUNT(DISTINCT DATE(punch_time AT TIME ZONE 'Asia/Kolkata')) AS cnt
         FROM contractor_biometric_punches
        WHERE contractor_employee_id = $1::uuid
          AND client_id = $2::uuid
          AND punch_time >= $3::date
          AND punch_time < ($3::date + INTERVAL '1 month')`,
      [contractorEmployeeId, clientId, monthStart],
    );
    const kioskDays = Number(rows[0]?.cnt ?? 0);
    if (kioskDays > 0) return { workedDays: kioskDays, source: 'KIOSK' };

    return { workedDays: 0, source: 'NONE' };
  }
}

// ─── Utility ─────────────────────────────────────────────────────────────────

function colLetter(colIndex: number): string {
  let letter = '';
  while (colIndex > 0) {
    const rem = (colIndex - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    colIndex = Math.floor((colIndex - 1) / 26);
  }
  return letter;
}
