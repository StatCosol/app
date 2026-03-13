import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import * as ExcelJS from 'exceljs';
import { EmployeeEntity } from './entities/employee.entity';
import { DepartmentEntity } from './entities/department.entity';
import { GradeEntity } from './entities/grade.entity';
import { DesignationEntity } from './entities/designation.entity';
import { EmployeesService } from './employees.service';

interface ImportRow {
  rowNum: number;
  firstName: string;
  lastName?: string;
  branchId?: string;
  dateOfBirth?: string;
  gender?: string;
  fatherName?: string;
  phone?: string;
  email?: string;
  aadhaar?: string;
  pan?: string;
  uan?: string;
  esic?: string;
  pfApplicable?: boolean;
  esiApplicable?: boolean;
  bankName?: string;
  bankAccount?: string;
  ifsc?: string;
  designation?: string;
  department?: string;
  dateOfJoining?: string;
  stateCode?: string;
}

@Injectable()
export class EmployeeBulkImportService {
  private readonly logger = new Logger(EmployeeBulkImportService.name);

  constructor(
    @InjectRepository(EmployeeEntity)
    private readonly empRepo: Repository<EmployeeEntity>,
    @InjectRepository(DepartmentEntity)
    private readonly deptRepo: Repository<DepartmentEntity>,
    @InjectRepository(GradeEntity)
    private readonly gradeRepo: Repository<GradeEntity>,
    @InjectRepository(DesignationEntity)
    private readonly desigRepo: Repository<DesignationEntity>,
    private readonly ds: DataSource,
    private readonly empService: EmployeesService,
  ) {}

  /** Import employees from an Excel file */
  async importFromExcel(
    clientId: string,
    filePath: string,
  ): Promise<{
    imported: number;
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
    if (!colMap.firstName) {
      throw new BadRequestException(
        'Column "First Name" or "Employee Name" is required',
      );
    }

    // Preload master data for matching
    const departments = await this.deptRepo.find({ where: { clientId } });
    const deptByName = new Map(
      departments.map((d) => [d.name.toLowerCase(), d]),
    );
    const grades = await this.gradeRepo.find({ where: { clientId } });
    const gradeByName = new Map(grades.map((g) => [g.name.toLowerCase(), g]));
    const designations = await this.desigRepo.find({ where: { clientId } });
    const desigByName = new Map(
      designations.map((d) => [d.name.toLowerCase(), d]),
    );

    const errors: string[] = [];
    const warnings: string[] = [];
    let imported = 0;
    let skipped = 0;

    for (let r = 2; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r);
      const firstName = this.cellStr(row, colMap.firstName);
      if (!firstName) continue; // skip empty rows

      try {
        const data: any = {
          clientId,
          firstName,
          lastName: colMap.lastName ? this.cellStr(row, colMap.lastName) : null,
          branchId: colMap.branchId ? this.cellStr(row, colMap.branchId) : null,
          dateOfBirth: colMap.dateOfBirth
            ? this.cellDate(row, colMap.dateOfBirth)
            : null,
          gender: colMap.gender ? this.cellStr(row, colMap.gender) : null,
          fatherName: colMap.fatherName
            ? this.cellStr(row, colMap.fatherName)
            : null,
          phone: colMap.phone ? this.cellStr(row, colMap.phone) : null,
          email: colMap.email ? this.cellStr(row, colMap.email) : null,
          aadhaar: colMap.aadhaar ? this.cellStr(row, colMap.aadhaar) : null,
          pan: colMap.pan ? this.cellStr(row, colMap.pan) : null,
          uan: colMap.uan ? this.cellStr(row, colMap.uan) : null,
          esic: colMap.esic ? this.cellStr(row, colMap.esic) : null,
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
        };

        // Link to master data if matched
        if (data.department) {
          const dept = deptByName.get(data.department.toLowerCase());
          if (dept) data.departmentId = dept.id;
          else
            warnings.push(
              `Row ${r}: Department "${data.department}" not found in master data`,
            );
        }
        if (data.designation) {
          const desig = desigByName.get(data.designation.toLowerCase());
          if (desig) data.designationId = desig.id;
          else
            warnings.push(
              `Row ${r}: Designation "${data.designation}" not found in master data`,
            );
        }

        // Check for duplicate (by name + DOB + client)
        const existing = await this.empRepo.findOne({
          where: {
            clientId,
            firstName: data.firstName,
            ...(data.lastName ? { lastName: data.lastName } : {}),
            ...(data.dateOfBirth ? { dateOfBirth: data.dateOfBirth } : {}),
          },
        });

        if (existing) {
          warnings.push(
            `Row ${r}: "${data.firstName} ${data.lastName || ''}" appears to already exist (ID: ${existing.id}). Skipping.`,
          );
          skipped++;
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
        await this.empService.create(clientId, data.branchId || null, data);
        imported++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Row ${r}: ${msg}`);
      }
    }

    return { imported, skipped, errors, warnings };
  }

  private buildColumnMap(
    headers: string[],
  ): Record<string, number | undefined> {
    const map: Record<string, number | undefined> = {};
    const mappings: Record<string, string[]> = {
      firstName: [
        'first name',
        'firstname',
        'employee name',
        'name',
        'emp name',
      ],
      lastName: ['last name', 'lastname', 'surname'],
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

  private normalizeHeader(value: any): string {
    if (value === null || value === undefined) return '';
    return String(value).replace(/\s+/g, ' ').trim().toLowerCase();
  }

  private stringFromCellValue(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    if (value instanceof Date) return value.toISOString();

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
    if (val instanceof Date) return val.toISOString().slice(0, 10);
    const str = this.stringFromCellValue(val);
    if (!str) return null;
    // Try parse common date formats
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }

  private cellBool(row: ExcelJS.Row, col: number | undefined): boolean {
    if (!col) return false;
    const val = row.getCell(col).value;
    if (typeof val === 'boolean') return val;
    const str = (this.stringFromCellValue(val) ?? '').toLowerCase().trim();
    return ['yes', 'true', '1', 'y'].includes(str);
  }
}
