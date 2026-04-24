import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import * as ExcelJS from 'exceljs';
import { EmployeeEntity } from './entities/employee.entity';

type EmployeeImportRow = {
  clientId: string;
  employeeCode: string | null;
  name: string;
  branchId: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  fatherName: string | null;
  phone: string | null;
  email: string | null;
  aadhaar: string | null;
  pan: string | null;
  uan: string | null;
  esic: string | null;
  pfApplicable: boolean;
  esiApplicable: boolean;
  bankName: string | null;
  bankAccount: string | null;
  ifsc: string | null;
  designation: string | null;
  department: string | null;
  dateOfJoining: string | null;
  stateCode: string | null;
  ctc: number | null;
  monthlyGross: number | null;
  pfRegistered: boolean;
  pfApplicableFrom: string | null;
  esiRegistered: boolean;
  esiApplicableFrom: string | null;
  dateOfExit: string | null;
  exitReason: string | null;
  departmentId?: string;
  designationId?: string;
};
import { DepartmentEntity } from './entities/department.entity';
import { GradeEntity } from './entities/grade.entity';
import { DesignationEntity } from './entities/designation.entity';
import { EmployeesService } from './employees.service';

@Injectable()
export class EmployeeBulkImportService {

  constructor(
    @InjectRepository(EmployeeEntity)
    private readonly empRepo: Repository<EmployeeEntity>,
    @InjectRepository(DepartmentEntity)
    private readonly deptRepo: Repository<DepartmentEntity>,
    @InjectRepository(GradeEntity)
    private readonly gradeRepo: Repository<GradeEntity>,
    @InjectRepository(DesignationEntity)
    private readonly desigRepo: Repository<DesignationEntity>,
    private readonly _ds: DataSource,
    private readonly empService: EmployeesService,
  ) {}

  /** Import employees from an Excel file */
  async importFromExcel(
    clientId: string,
    filePath: string,
    defaultBranchId?: string,
  ): Promise<{
    imported: number;
    updated: number;
    skipped: number;
    errors: string[];
    warnings: string[];
  }> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const sheet = workbook.worksheets[0];
    if (!sheet) throw new BadRequestException('No worksheet found');

    // Parse headers
    const headers: string[] = [];
    sheet.getRow(1).eachCell((cell, colNum) => {
      headers[colNum] = this.normalizeHeader(cell.value);
    });

    // Map headers to columns
    const colMap = this.buildColumnMap(headers);
    if (!colMap.name) {
      throw new BadRequestException(
        'Column "Name" or "Employee Name" is required',
      );
    }

    // Warn about unmapped columns so users know which data was ignored
    const mappedCols = new Set(Object.values(colMap).filter(Boolean));
    const unmapped: string[] = [];
    for (let i = 1; i < headers.length; i++) {
      if (headers[i] && !mappedCols.has(i)) unmapped.push(headers[i]);
    }

    const errors: string[] = [];
    const warnings: string[] = [];
    if (unmapped.length) {
      warnings.push(`Unrecognised columns (ignored): ${unmapped.join(', ')}`);
    }

    // Preload master data for matching
    const departments = await this.deptRepo.find({ where: { clientId } });
    const deptByName = new Map(
      departments.map((d) => [d.name.toLowerCase(), d]),
    );
    const designations = await this.desigRepo.find({ where: { clientId } });
    const desigByName = new Map(
      designations.map((d) => [d.name.toLowerCase(), d]),
    );

    let imported = 0;
    let updated = 0;
    let skipped = 0;

    for (let r = 2; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r);
      const name = this.cellStr(row, colMap.name);
      if (!name) continue; // skip empty rows

      try {
        const empCode = colMap.employeeCode ? this.cellStr(row, colMap.employeeCode) : null;
        const data: EmployeeImportRow = {
          clientId,
          employeeCode: empCode,
          name,
          branchId: colMap.branchId ? this.cellStr(row, colMap.branchId) : null,
          dateOfBirth: colMap.dateOfBirth
            ? this.cellDate(row, colMap.dateOfBirth)
            : null,
          gender: colMap.gender ? this.normalizeGender(this.cellStr(row, colMap.gender)) : null,
          fatherName: colMap.fatherName
            ? this.cellStr(row, colMap.fatherName)
            : null,
          phone: colMap.phone ? this.cellStr(row, colMap.phone) : null,
          email: colMap.email ? this.cellStr(row, colMap.email) : null,
          aadhaar: colMap.aadhaar ? this.cellStr(row, colMap.aadhaar) : null,
          pan: colMap.pan ? this.cellStr(row, colMap.pan) : null,
          uan: EmployeesService.sanitizeRegNumber(colMap.uan ? this.cellStr(row, colMap.uan) : null),
          esic: EmployeesService.sanitizeRegNumber(colMap.esic ? this.cellStr(row, colMap.esic) : null),
          pfApplicable: colMap.pfApplicable
            ? this.cellBool(row, colMap.pfApplicable)
            : false,
          esiApplicable: colMap.esiApplicable
            ? this.cellBool(row, colMap.esiApplicable)
            : false,
          bankName: colMap.bankName ? this.cellStr(row, colMap.bankName) : null,
          bankAccount: colMap.bankAccount
            ? this.cellStr(row, colMap.bankAccount)
            : null,
          ifsc: colMap.ifsc ? this.cellStr(row, colMap.ifsc) : null,
          designation: colMap.designation
            ? this.cellStr(row, colMap.designation)
            : null,
          department: colMap.department
            ? this.cellStr(row, colMap.department)
            : null,
          dateOfJoining: colMap.dateOfJoining
            ? this.cellDate(row, colMap.dateOfJoining)
            : null,
          stateCode: colMap.stateCode
            ? this.cellStr(row, colMap.stateCode)
            : null,
          ctc: colMap.ctc
            ? this.cellNum(row, colMap.ctc)
            : null,
          monthlyGross: colMap.monthlyGross
            ? this.cellNum(row, colMap.monthlyGross)
            : null,
          pfRegistered: colMap.pfRegistered
            ? this.cellBool(row, colMap.pfRegistered)
            : false,
          pfApplicableFrom: colMap.pfApplicableFrom
            ? this.cellDate(row, colMap.pfApplicableFrom)
            : null,
          esiRegistered: colMap.esiRegistered
            ? this.cellBool(row, colMap.esiRegistered)
            : false,
          esiApplicableFrom: colMap.esiApplicableFrom
            ? this.cellDate(row, colMap.esiApplicableFrom)
            : null,
          dateOfExit: colMap.dateOfExit
            ? this.cellDate(row, colMap.dateOfExit)
            : null,
          exitReason: colMap.exitReason
            ? this.cellStr(row, colMap.exitReason)
            : null,
        };

        // Link to master data — auto-create if not found
        if (data.department) {
          let dept = deptByName.get(data.department.toLowerCase());
          if (!dept) {
            const code = data.department.toUpperCase().replace(/[^A-Z0-9]/g, '_').substring(0, 50);
            dept = this.deptRepo.create({ clientId, code, name: data.department, isActive: true });
            dept = await this.deptRepo.save(dept);
            deptByName.set(data.department.toLowerCase(), dept);
          }
          data.departmentId = dept.id;
        }
        if (data.designation) {
          let desig = desigByName.get(data.designation.toLowerCase());
          if (!desig) {
            const code = data.designation.toUpperCase().replace(/[^A-Z0-9]/g, '_').substring(0, 50);
            desig = this.desigRepo.create({ clientId, code, name: data.designation, isActive: true });
            desig = await this.desigRepo.save(desig);
            desigByName.set(data.designation.toLowerCase(), desig);
          }
          data.designationId = desig.id;
        }

        // Check for existing employee — try multiple matching strategies
        let existing: EmployeeEntity | null = null;

        // 1. Match by employee code (most reliable)
        if (data.employeeCode) {
          existing = await this.empRepo.findOne({
            where: { clientId, employeeCode: data.employeeCode },
          });
        }

        // 2. Match by Aadhaar
        if (!existing && data.aadhaar) {
          const aadhNorm = data.aadhaar.replace(/\s+/g, '');
          existing = await this.empRepo.findOne({
            where: { clientId, aadhaar: aadhNorm },
          });
        }

        // 3. Match by phone
        if (!existing && data.phone) {
          const phoneNorm = data.phone.replace(/\s+/g, '');
          existing = await this.empRepo.findOne({
            where: { clientId, phone: phoneNorm },
          });
        }

        // 4. Match by name (case-insensitive) + DOB
        if (!existing) {
          const qb = this.empRepo.createQueryBuilder('e')
            .where('e.clientId = :clientId', { clientId })
            .andWhere('LOWER(e.name) = LOWER(:name)', { name: data.name });
          if (data.dateOfBirth) qb.andWhere('e.dateOfBirth = :dob', { dob: data.dateOfBirth });
          existing = await qb.getOne();
        }

        if (existing) {
          // Update existing employee with new data, preserving employee code
          const updateFields: Partial<EmployeeEntity> = {};
          if (data.gender) updateFields.gender = data.gender;
          if (data.fatherName) updateFields.fatherName = data.fatherName;
          if (data.phone) updateFields.phone = data.phone.replace(/\s+/g, '');
          if (data.email) updateFields.email = data.email;
          if (data.aadhaar) updateFields.aadhaar = data.aadhaar.replace(/\s+/g, '');
          if (data.pan) updateFields.pan = data.pan;
          if (data.uan) updateFields.uan = data.uan;
          if (data.esic) updateFields.esic = data.esic;
          if (data.pfApplicable) updateFields.pfApplicable = data.pfApplicable;
          if (data.esiApplicable) updateFields.esiApplicable = data.esiApplicable;
          if (data.bankName) updateFields.bankName = data.bankName;
          if (data.bankAccount) updateFields.bankAccount = data.bankAccount;
          if (data.ifsc) updateFields.ifsc = data.ifsc;
          if (data.dateOfJoining) updateFields.dateOfJoining = data.dateOfJoining;
          if (data.designation) updateFields.designation = data.designation;
          if (data.department) updateFields.department = data.department;
          if (data.departmentId) updateFields.departmentId = data.departmentId;
          if (data.designationId) updateFields.designationId = data.designationId;
          if (data.dateOfBirth) updateFields.dateOfBirth = data.dateOfBirth;
          if (data.ctc != null) updateFields.ctc = data.ctc;
          if (data.monthlyGross != null) updateFields.monthlyGross = data.monthlyGross;
          if (data.pfRegistered) updateFields.pfRegistered = data.pfRegistered;
          if (data.pfApplicableFrom) updateFields.pfApplicableFrom = data.pfApplicableFrom as any;
          if (data.esiRegistered) updateFields.esiRegistered = data.esiRegistered;
          if (data.esiApplicableFrom) updateFields.esiApplicableFrom = data.esiApplicableFrom as any;
          if (data.dateOfExit) updateFields.dateOfExit = data.dateOfExit as any;
          if (data.exitReason) updateFields.exitReason = data.exitReason;

          // Auto-set registration flags when numbers are present
          if (EmployeesService.isValidRegistrationNumber(updateFields.uan)) { updateFields.pfApplicable = true; updateFields.pfRegistered = true; }
          if (EmployeesService.isValidRegistrationNumber(updateFields.esic)) { updateFields.esiApplicable = true; updateFields.esiRegistered = true; }

          if (Object.keys(updateFields).length > 0) {
            Object.assign(existing, updateFields);
            await this.empRepo.save(existing);
            warnings.push(
              `Row ${r}: "${data.name}" updated (code: ${existing.employeeCode}).`,
            );
            updated++;
          } else {
            warnings.push(
              `Row ${r}: "${data.name}" already exists, no new data to update (code: ${existing.employeeCode}).`,
            );
            skipped++;
          }
          continue;
        }

        // Age validation: must be 18 or older
        if (data.dateOfBirth) {
          const dob = new Date(data.dateOfBirth);
          const today = new Date();
          let age = today.getFullYear() - dob.getFullYear();
          const monthDiff = today.getMonth() - dob.getMonth();
          if (
            monthDiff < 0 ||
            (monthDiff === 0 && today.getDate() < dob.getDate())
          )
            age--;
          if (age < 18) {
            errors.push(
              `Row ${r}: Employee must be at least 18 years old. DOB ${data.dateOfBirth} indicates age ${age}.`,
            );
            skipped++;
            continue;
          }
        }

        // Use the service's create method (auto-generates employee code)
        const { employeeCode: _ec, ...rest } = data;
        const createDto = {
          ...rest,
          branchId: data.branchId ?? undefined,
          dateOfBirth: data.dateOfBirth ?? undefined,
          gender: data.gender ?? undefined,
          fatherName: data.fatherName ?? undefined,
          phone: data.phone ?? undefined,
          email: data.email ?? undefined,
          aadhaar: data.aadhaar ?? undefined,
          pan: data.pan ?? undefined,
          uan: data.uan ?? undefined,
          esic: data.esic ?? undefined,
          bankName: data.bankName ?? undefined,
          bankAccount: data.bankAccount ?? undefined,
          ifsc: data.ifsc ?? undefined,
          designation: data.designation ?? undefined,
          department: data.department ?? undefined,
          dateOfJoining: data.dateOfJoining ?? undefined,
          stateCode: data.stateCode ?? undefined,
          ctc: data.ctc ?? undefined,
          monthlyGross: data.monthlyGross ?? undefined,
          pfRegistered: data.pfRegistered || undefined,
          pfApplicableFrom: data.pfApplicableFrom ?? undefined,
          esiRegistered: data.esiRegistered || undefined,
          esiApplicableFrom: data.esiApplicableFrom ?? undefined,
          dateOfExit: data.dateOfExit ?? undefined,
          exitReason: data.exitReason ?? undefined,
        };
        await this.empService.create(clientId, data.branchId || defaultBranchId || null, createDto, false, true);
        imported++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Row ${r}: ${msg}`);
      }
    }

    return { imported, updated, skipped, errors, warnings };
  }

  private buildColumnMap(
    headers: string[],
  ): Record<string, number | undefined> {
    const map: Record<string, number | undefined> = {};
    const mappings: Record<string, string[]> = {
      employeeCode: [
        'employee code',
        'employeecode',
        'emp code',
        'empcode',
        'emp_code',
        'employee_code',
        'code',
        'id',
        'employee id',
        'emp id',
      ],
      name: [
        'name',
        'employee name',
        'emp name',
        'first name',
        'firstname',
        'full name',
        'name as per aadhaar',
        'name (as per aadhaar)',
        'aadhaar name',
      ],
      branchId: ['branch id', 'branchid', 'branch_id'],
      dateOfBirth: ['date of birth', 'dob', 'dateofbirth', 'birth date'],
      gender: ['gender', 'sex'],
      fatherName: ['father name', 'fathername', "father's name"],
      phone: ['phone', 'mobile', 'contact', 'phone number'],
      email: ['email', 'email address', 'e-mail'],
      aadhaar: ['aadhaar', 'aadhar', 'aadhaar number', 'uid'],
      pan: ['pan', 'pan number', 'pan no'],
      uan: ['uan', 'uan number'],
      esic: ['esic', 'esic number', 'esi number', 'esi'],
      pfApplicable: ['pf applicable', 'pf', 'pf_applicable'],
      esiApplicable: ['esi applicable', 'esi', 'esi_applicable'],
      bankName: ['bank name', 'bankname', 'bank'],
      bankAccount: [
        'bank account',
        'bankaccount',
        'account number',
        'account no',
      ],
      ifsc: ['ifsc', 'ifsc code'],
      designation: ['designation', 'position', 'title'],
      department: ['department', 'dept'],
      dateOfJoining: [
        'date of joining',
        'doj',
        'joining date',
        'dateofjoining',
      ],
      stateCode: ['state code', 'statecode', 'state'],
      ctc: ['ctc', 'cost to company', 'annual ctc', 'ctc amount'],
      monthlyGross: ['monthly gross', 'monthlygross', 'gross salary', 'gross', 'monthly_gross', 'gross wages', 'gross wage', 'gross pay', 'monthly salary', 'salary', 'wages', 'monthly pay', 'gross amount'],
      pfRegistered: ['pf registered', 'pfregistered', 'pf_registered', 'pf reg'],
      pfApplicableFrom: ['pf applicable from', 'pfapplicablefrom', 'pf_applicable_from', 'pf from', 'pf date', 'pf start date'],
      esiRegistered: ['esi registered', 'esiregistered', 'esi_registered', 'esi reg'],
      esiApplicableFrom: ['esi applicable from', 'esiapplicablefrom', 'esi_applicable_from', 'esi from', 'esi date', 'esi start date'],
      dateOfExit: ['date of exit', 'dateofexit', 'exit date', 'doe', 'date_of_exit', 'leaving date', 'last working date'],
      exitReason: ['exit reason', 'exitreason', 'exit_reason', 'reason for exit', 'reason', 'leaving reason'],
    };

    for (const [key, aliases] of Object.entries(mappings)) {
      for (let i = 1; i < headers.length; i++) {
        if (headers[i] && aliases.includes(headers[i])) {
          map[key] = i;
          break;
        }
      }
    }
    return map;
  }

  /** Normalize gender values to title case to match frontend dropdown (Male/Female/Other) */
  private normalizeGender(raw: string | null): string | null {
    if (!raw) return null;
    const lower = raw.trim().toLowerCase();
    if (lower === 'male' || lower === 'm') return 'Male';
    if (lower === 'female' || lower === 'f') return 'Female';
    if (lower === 'other') return 'Other';
    return raw.trim(); // return as-is if unrecognized
  }

  private normalizeHeader(value: unknown): string {
    if (value === null || value === undefined) return '';
    // Handle ExcelJS rich text objects
    if (typeof value === 'object' && value !== null) {
      if ('richText' in (value as Record<string, unknown>)) {
        const rt = (value as { richText: Array<{ text: string }> }).richText;
        return rt.map((r) => r.text || '').join('').replace(/\s+/g, ' ').trim().toLowerCase();
      }
      if ('text' in (value as Record<string, unknown>)) {
        return String((value as { text: unknown }).text).replace(/\s+/g, ' ').trim().toLowerCase();
      }
      if ('result' in (value as Record<string, unknown>)) {
        return String((value as { result: unknown }).result).replace(/\s+/g, ' ').trim().toLowerCase();
      }
    }
    return String(value).replace(/\s+/g, ' ').trim().toLowerCase();
  }

  private stringFromCellValue(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    if (value instanceof Date) return value.toISOString();
    // Handle ExcelJS rich text objects
    if (typeof value === 'object' && value !== null) {
      if ('richText' in (value as Record<string, unknown>)) {
        const rt = (value as { richText: Array<{ text: string }> }).richText;
        return rt.map((r) => r.text || '').join('').trim() || null;
      }
    }

    switch (typeof value) {
      case 'string':
      case 'number':
      case 'boolean':
      case 'bigint':
        return String(value).trim() || null;
      default:
        return null;
    }
  }

  private cellStr(row: ExcelJS.Row, col: number | undefined): string | null {
    if (!col) return null;
    const val = row.getCell(col).value;
    if (val === null || val === undefined) return null;
    if (typeof val === 'object' && val && 'text' in val) {
      return this.stringFromCellValue((val as { text: unknown }).text);
    }
    if (typeof val === 'object' && val && 'result' in val) {
      return this.stringFromCellValue((val as { result: unknown }).result);
    }
    return this.stringFromCellValue(val);
  }

  private cellDate(row: ExcelJS.Row, col: number | undefined): string | null {
    if (!col) return null;
    const val = row.getCell(col).value;
    if (!val) return null;
    if (val instanceof Date) return this.dateToYmd(val);
    const str = this.stringFromCellValue(val);
    if (!str) return null;
    // Try parse common date formats
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : this.dateToYmd(d);
  }

  /** Extract YYYY-MM-DD using UTC components to avoid timezone shift */
  private dateToYmd(d: Date): string {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private cellBool(row: ExcelJS.Row, col: number | undefined): boolean {
    if (!col) return false;
    const val = row.getCell(col).value;
    if (typeof val === 'boolean') return val;
    const str = (this.stringFromCellValue(val) ?? '').toLowerCase().trim();
    return ['yes', 'true', '1', 'y'].includes(str);
  }

  private cellNum(row: ExcelJS.Row, col: number | undefined): number | null {
    if (!col) return null;
    const val = row.getCell(col).value;
    if (val === null || val === undefined) return null;
    if (typeof val === 'number') return val;
    const str = this.stringFromCellValue(val);
    if (!str) return null;
    const num = parseFloat(str.replace(/,/g, ''));
    return isNaN(num) ? null : num;
  }
}
