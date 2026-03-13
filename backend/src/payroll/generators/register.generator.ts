import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as ExcelJS from 'exceljs';
import * as path from 'path';
import * as fs from 'fs';
import { RegisterTemplateEntity } from '../entities/register-template.entity';
import { PayrollRunEntity } from '../entities/payroll-run.entity';
import { PayrollRunEmployeeEntity } from '../entities/payroll-run-employee.entity';
import { PayrollRunComponentValueEntity } from '../entities/payroll-run-component-value.entity';
import { RegistersRecordEntity } from '../entities/registers-record.entity';

/**
 * State-wise Register Generator
 *
 * Uses register_templates matched by (state_code, establishment_type, register_type)
 * to generate Excel-based registers from payroll run data.
 *
 * Column source mapping:
 *   "COMP:<code>"   → component value (e.g., COMP:BASIC, COMP:HRA)
 *   "STAT:<code>"   → statutory value (PF_EMPLOYEE, ESI_EMPLOYEE, PT, etc.)
 *   "FIELD:<name>"  → built-in employee field (employee_code, uan, esic, etc.)
 *   "CALC:<expr>"   → computed: gross_earnings, total_deductions, net_pay, employer_cost
 */
@Injectable()
export class RegisterGenerator {
  constructor(
    @InjectRepository(RegisterTemplateEntity)
    private readonly templateRepo: Repository<RegisterTemplateEntity>,
    @InjectRepository(PayrollRunEntity)
    private readonly runRepo: Repository<PayrollRunEntity>,
    @InjectRepository(PayrollRunEmployeeEntity)
    private readonly runEmpRepo: Repository<PayrollRunEmployeeEntity>,
    @InjectRepository(PayrollRunComponentValueEntity)
    private readonly compValRepo: Repository<PayrollRunComponentValueEntity>,
    @InjectRepository(RegistersRecordEntity)
    private readonly rrRepo: Repository<RegistersRecordEntity>,
  ) {}

  async generate(
    runId: string,
    stateCode: string,
    registerType: string,
    userId: string,
  ): Promise<RegistersRecordEntity> {
    const run = await this.runRepo.findOne({ where: { id: runId } });
    if (!run) throw new NotFoundException('Payroll run not found');

    const template = await this.templateRepo.findOne({
      where: { stateCode, registerType, isActive: true },
    });
    if (!template) {
      throw new NotFoundException(
        `No active template for state=${stateCode}, type=${registerType}`,
      );
    }

    // Get employees for this state
    const employees = await this.runEmpRepo.find({
      where: { runId, stateCode },
      order: { employeeName: 'ASC' },
    });

    if (employees.length === 0) {
      throw new NotFoundException(
        `No employees found in state ${stateCode} for this run`,
      );
    }

    // Build Excel workbook from template column definitions
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(template.title);

    const columnDefs: {
      key: string;
      header: string;
      source?: string;
      width?: number;
    }[] = template.columnDefinitions || [];

    // Set columns
    sheet.columns = columnDefs.map((col) => ({
      header: col.header,
      key: col.key,
      width: col.width || 18,
    }));

    // Style header row
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, size: 11 };
    headerRow.alignment = { horizontal: 'center', wrapText: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    };

    // Track totals for numeric columns
    const totals: Record<string, number> = {};
    const numericKeys = new Set<string>();

    // Fill data
    let serial = 1;
    for (const emp of employees) {
      const values = await this.compValRepo.find({
        where: { runEmployeeId: emp.id },
      });
      const valMap = new Map<string, number>();
      values.forEach((v) => valMap.set(v.componentCode, Number(v.amount)));

      // Built-in field map
      const fieldMap: Record<string, any> = {
        serial,
        employee_code: emp.employeeCode,
        employee_name: emp.employeeName,
        designation: emp.designation || '',
        uan: emp.uan || '',
        esic: emp.esic || '',
        gross_earnings: Number(emp.grossEarnings) || 0,
        total_deductions: Number(emp.totalDeductions) || 0,
        net_pay: Number(emp.netPay) || 0,
        employer_cost: Number(emp.employerCost) || 0,
      };

      const rowData: Record<string, any> = {};

      for (const col of columnDefs) {
        let val: any = '';
        const src = col.source || '';

        if (src.startsWith('COMP:')) {
          val = valMap.get(src.replace('COMP:', '')) || 0;
          numericKeys.add(col.key);
        } else if (src.startsWith('STAT:')) {
          val = valMap.get(src.replace('STAT:', '')) || 0;
          numericKeys.add(col.key);
        } else if (src.startsWith('FIELD:')) {
          val = fieldMap[src.replace('FIELD:', '')] ?? '';
        } else if (src.startsWith('CALC:')) {
          val = fieldMap[src.replace('CALC:', '')] ?? 0;
          numericKeys.add(col.key);
        } else if (fieldMap[col.key] !== undefined) {
          // Direct key match (backwards-compatible)
          val = fieldMap[col.key];
          if (typeof val === 'number') numericKeys.add(col.key);
        }

        rowData[col.key] = val;

        // Accumulate totals for numeric columns
        if (numericKeys.has(col.key) && typeof val === 'number') {
          totals[col.key] = (totals[col.key] || 0) + val;
        }
      }

      sheet.addRow(rowData);
      serial++;
    }

    // Add footer totals row
    const totalRow: Record<string, any> = {};
    for (const col of columnDefs) {
      if (col.key === 'serial') {
        totalRow[col.key] = '';
      } else if (col.key === 'employee_name' || col.key === 'employee_code') {
        totalRow[col.key] = col.key === 'employee_name' ? 'TOTAL' : '';
      } else if (numericKeys.has(col.key)) {
        totalRow[col.key] = totals[col.key] || 0;
      } else {
        totalRow[col.key] = '';
      }
    }
    const footerExcelRow = sheet.addRow(totalRow);
    footerExcelRow.font = { bold: true };

    // Save file
    const period = `${run.periodYear}-${String(run.periodMonth).padStart(2, '0')}`;
    const fileName = `${registerType}_${stateCode}_${period}.xlsx`;
    const dir = path.join(process.cwd(), 'uploads', 'registers', run.clientId);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, fileName);

    await workbook.xlsx.writeFile(filePath);

    const stats = fs.statSync(filePath);

    // Save register record
    const record = this.rrRepo.create({
      clientId: run.clientId,
      branchId: run.branchId,
      payrollInputId: run.sourcePayrollInputId,
      category: 'REGISTER',
      title: `${template.title} - ${period}`,
      periodYear: run.periodYear,
      periodMonth: run.periodMonth,
      preparedByUserId: userId,
      fileName,
      filePath,
      fileType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      fileSize: String(stats.size),
      registerType,
      stateCode,
      approvalStatus: 'PENDING',
    });

    return this.rrRepo.save(record);
  }

  async listTemplates(stateCode?: string) {
    const where: any = { isActive: true };
    if (stateCode) where.stateCode = stateCode;
    return this.templateRepo.find({
      where,
      order: { stateCode: 'ASC', registerType: 'ASC' },
    });
  }
}
