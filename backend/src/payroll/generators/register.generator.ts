import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import * as ExcelJS from 'exceljs';
import * as path from 'path';
import * as fs from 'fs';
import { RegisterTemplateEntity } from '../entities/register-template.entity';
import { PayrollRunEntity } from '../entities/payroll-run.entity';
import { PayrollRunEmployeeEntity } from '../entities/payroll-run-employee.entity';
import { PayrollRunComponentValueEntity } from '../entities/payroll-run-component-value.entity';
import { RegistersRecordEntity } from '../entities/registers-record.entity';

/**
 * Registers linked to payroll data - generated automatically in Payroll Portal
 * All others (event/manual) route to Branch/Client/CRM Portal for upload
 */
const PAYROLL_LINKED_REGISTERS = new Set([
  // Code on Wages
  'WAGE_REGISTER',
  'MUSTER_ROLL',
  'OVERTIME_REGISTER',
  'LEAVE_REGISTER',
  'DEDUCTION_REGISTER',
  'FINE_REGISTER',
  'ADVANCE_REGISTER',
  'DAMAGE_LOSS_REGISTER',
  'WAGE_SLIP_REGISTER',
  'ANNUAL_RETURN_WAGES',
  'MINIMUM_WAGE_ABSTRACT',
  'COMB_EMPLOYEE_REGISTER',
  'COMB_MUSTER_ROLL',
  'COMB_FINE_DED_ADV_OT',
  // Factories Act (payroll-linked)
  'ADULT_WORKER_REGISTER',
  'LEAVE_BOOK',
  // Shops & Establishments (payroll-linked)
  'SHOPS_WAGE_REGISTER',
  'SHOPS_LEAVE_REGISTER',
  'SHOPS_WORK_HOURS_REGISTER',
  // Social Security (payroll-linked)
  'PF_REGISTER',
  'ESI_REGISTER',
  'GRATUITY_REGISTER',
  'ECR',
  'ESI',
  'PF_CHALLAN_REGISTER',
  'ESI_CHALLAN_REGISTER',
  // Gratuity (payroll-linked)
  'GRAT_COMPUTATION_REGISTER',
  'GRAT_PAYMENT_REGISTER',
  // Professional Tax
  'PT_REGISTER',
  'PT_RETURN_REGISTER',
  // Bonus Act
  'BONUS_REGISTER',
  'BONUS_COMPUTATION_SHEET',
  'BONUS_SET_ON_OFF',
  'BONUS_ANNUAL_RETURN',
  // Contract Labour (payroll-linked)
  'CONTRACT_MUSTER_ROLL',
  'CONTRACT_WAGE_REGISTER',
  'CONTRACT_DEDUCTION_REGISTER',
  'CONTRACT_OVERTIME_REGISTER',
  'CLRA_WAGE_CUM_MUSTER',
  'CLRA_WAGE_SLIP',
  // Labour Welfare Fund
  'LWF_REGISTER',
  'LWF_CONTRIBUTION_REGISTER',
]);

/**
 * Branch-type-aware Register Generator
 *
 * Uses register_templates matched by (state_code, establishment_type, register_type)
 * to generate Excel-based registers from payroll run data.
 *
 * Establishment type mapping:
 *   FACTORY branch type  → templates with establishment_type = FACTORY + COMMON
 *   All other types      → templates with establishment_type = ESTABLISHMENT + COMMON
 *
 * Template state fallback: tries branch's state_code first, then 'ALL' (national default).
 *
 * Column source mapping:
 *   "COMP:<code>"   → component value (e.g., COMP:BASIC, COMP:HRA)
 *   "STAT:<code>"   → statutory value (PF_EMP, ESI_EMP, PT, etc.)
 *   "FIELD:<name>"  → built-in employee field (employee_code, uan, esic, total_days, etc.)
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

  /* ───── helpers ───── */

  private getEstablishmentCategory(branchType: string): string {
    const bt = (branchType || '').toUpperCase();
    // Factory branches → FACTORY templates; everything else → ESTABLISHMENT (S&E)
    if (bt === 'FACTORY') return 'FACTORY';
    // OFFICE, SHOP, COMMERCIAL_ESTABLISHMENT, WAREHOUSE, DEPOT, OTHER
    return 'ESTABLISHMENT';
  }

  private async getBranchInfo(branchId: string) {
    const rows: {
      branchType: string;
      stateCode: string;
      branchName: string;
      branchCode: string;
      employeeCount: number;
      contractorCount: number;
    }[] = await this.runRepo.manager.query(
      `SELECT branchtype AS "branchType", statecode AS "stateCode",
              branchname AS "branchName", branch_code AS "branchCode",
              COALESCE(employeecount, 0) AS "employeeCount",
              COALESCE(contractorcount, 0) AS "contractorCount"
       FROM client_branches WHERE id = $1`,
      [branchId],
    );
    if (!rows.length) throw new NotFoundException('Branch not found');
    return rows[0];
  }

  /** Check PF/ESI applicability from master employees table */
  private async getBranchApplicability(branchId: string): Promise<{ hasPf: boolean; hasEsi: boolean }> {
    const rows: { hasPf: boolean; hasEsi: boolean }[] = await this.runRepo.manager.query(
      `SELECT
         EXISTS(SELECT 1 FROM employees WHERE branch_id = $1 AND pf_applicable = true AND is_active = true) AS "hasPf",
         EXISTS(SELECT 1 FROM employees WHERE branch_id = $1 AND esi_applicable = true AND is_active = true) AS "hasEsi"`,
      [branchId],
    );
    return rows[0] || { hasPf: false, hasEsi: false };
  }

  /** Filter templates by applicability conditions */
  private filterByApplicability(
    templates: RegisterTemplateEntity[],
    meta: { employeeCount: number; contractorCount: number; hasPf: boolean; hasEsi: boolean },
  ): RegisterTemplateEntity[] {
    return templates.filter((t) => {
      const cond = t.appliesWhen as Record<string, any> | null;
      if (!cond || Object.keys(cond).length === 0) return true;
      if (cond.requires_pf && !meta.hasPf) return false;
      if (cond.requires_esi && !meta.hasEsi) return false;
      if (cond.min_contractors && meta.contractorCount < cond.min_contractors) return false;
      if (cond.min_employees && meta.employeeCount < cond.min_employees) return false;
      return true;
    });
  }

  private async findApplicableTemplates(
    stateCode: string | null,
    estCategory: string,
  ): Promise<RegisterTemplateEntity[]> {
    const whereConditions: any[] = [
      { stateCode: 'ALL', establishmentType: estCategory, isActive: true },
      { stateCode: 'ALL', establishmentType: 'COMMON', isActive: true },
    ];
    if (stateCode) {
      whereConditions.push(
        { stateCode, establishmentType: estCategory, isActive: true },
        { stateCode, establishmentType: 'COMMON', isActive: true },
      );
    }
    const allTemplates = await this.templateRepo.find({
      where: whereConditions,
      order: { registerType: 'ASC' },
    });

    // Deduplicate: prefer state-specific over ALL
    const map = new Map<string, RegisterTemplateEntity>();
    for (const t of allTemplates) {
      const key = `${t.establishmentType}:${t.registerType}`;
      const existing = map.get(key);
      if (!existing || (existing.stateCode === 'ALL' && t.stateCode !== 'ALL')) {
        map.set(key, t);
      }
    }
    return Array.from(map.values());
  }

  /* ───── build Excel from template + employee data ───── */

  private buildFieldMap(
    emp: PayrollRunEmployeeEntity,
    valMap: Map<string, number>,
    serial: number,
    extraFields?: Record<string, string>,
  ): Record<string, string | number> {
    return {
      serial,
      employee_code: emp.employeeCode,
      employee_name: emp.employeeName,
      father_name: extraFields?.father_name || '',
      gender: extraFields?.gender || '',
      date_of_birth: extraFields?.date_of_birth || '',
      date_of_joining: extraFields?.date_of_joining || '',
      aadhaar: extraFields?.aadhaar || '',
      pan: extraFields?.pan || '',
      phone: extraFields?.phone || '',
      email: extraFields?.email || '',
      bank_name: extraFields?.bank_name || '',
      bank_account: extraFields?.bank_account || '',
      ifsc: extraFields?.ifsc || '',
      department: extraFields?.department || '',
      designation: emp.designation || '',
      uan: emp.uan || '',
      esic: emp.esic || '',
      total_days: Number(emp.totalDays) || 0,
      days_present: Number(emp.daysPresent) || 0,
      lop_days: Number(emp.lopDays) || 0,
      ncp_days: Number(emp.ncpDays) || 0,
      ot_hours: Number(emp.otHours) || 0,
      gross_earnings: Number(emp.grossEarnings) || 0,
      total_deductions: Number(emp.totalDeductions) || 0,
      net_pay: Number(emp.netPay) || 0,
      employer_cost: Number(emp.employerCost) || 0,
      // Computed from component values
      total_pf: (valMap.get('PF_EMP') || 0) + (valMap.get('PF_ER') || 0),
      total_esi: (valMap.get('ESI_EMP') || 0) + (valMap.get('ESI_ER') || 0),
    };
  }

  private buildExcel(
    template: RegisterTemplateEntity,
    employees: PayrollRunEmployeeEntity[],
    valuesByEmp: Map<string, Map<string, number>>,
    extraFieldsByEmp?: Map<string, Record<string, string>>,
  ): { workbook: ExcelJS.Workbook } {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(template.title);

    const columnDefs: {
      key: string;
      header: string;
      source?: string;
      width?: number;
    }[] = template.columnDefinitions || [];

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

    const totals: Record<string, number> = {};
    const numericKeys = new Set<string>();

    let serial = 1;
    for (const emp of employees) {
      const valMap = valuesByEmp.get(emp.id) || new Map();
      const extra = extraFieldsByEmp?.get(emp.id) || {};
      const fieldMap = this.buildFieldMap(emp, valMap, serial, extra);

      const rowData: Record<string, string | number> = {};

      for (const col of columnDefs) {
        let val: string | number = '';
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
          val = fieldMap[col.key];
          if (typeof val === 'number') numericKeys.add(col.key);
        }

        rowData[col.key] = val;
        if (numericKeys.has(col.key) && typeof val === 'number') {
          totals[col.key] = (totals[col.key] || 0) + val;
        }
      }

      sheet.addRow(rowData);
      serial++;
    }

    // Totals row
    const totalRow: Record<string, string | number> = {};
    for (const col of columnDefs) {
      if (col.key === 'serial') totalRow[col.key] = '';
      else if (col.key === 'employee_name' || col.key === 'employee_code')
        totalRow[col.key] = col.key === 'employee_name' ? 'TOTAL' : '';
      else if (numericKeys.has(col.key)) totalRow[col.key] = totals[col.key] || 0;
      else totalRow[col.key] = '';
    }
    const footerExcelRow = sheet.addRow(totalRow);
    footerExcelRow.font = { bold: true };

    return { workbook };
  }

  /* ───── public: generate single register (backward-compat) ───── */

  async generate(
    runId: string,
    stateCode: string,
    registerType: string,
    userId: string,
  ): Promise<RegistersRecordEntity> {
    const run = await this.runRepo.findOne({ where: { id: runId } });
    if (!run) throw new NotFoundException('Payroll run not found');

    // Try state-specific, then 'ALL'
    let template = await this.templateRepo.findOne({
      where: { stateCode, registerType, isActive: true },
    });
    if (!template) {
      template = await this.templateRepo.findOne({
        where: { stateCode: 'ALL', registerType, isActive: true },
      });
    }
    if (!template) {
      throw new NotFoundException(
        `No active template for state=${stateCode}, type=${registerType}`,
      );
    }

    const employees = await this.runEmpRepo.find({
      where: { runId, stateCode },
      order: { employeeName: 'ASC' },
    });
    if (employees.length === 0) {
      throw new NotFoundException(
        `No employees found in state ${stateCode} for this run`,
      );
    }

    // Load component values
    const empIds = employees.map((e) => e.id);
    const allValues = await this.compValRepo.find({
      where: { runEmployeeId: In(empIds) },
    });
    const valuesByEmp = new Map<string, Map<string, number>>();
    for (const v of allValues) {
      if (!valuesByEmp.has(v.runEmployeeId))
        valuesByEmp.set(v.runEmployeeId, new Map());
      valuesByEmp.get(v.runEmployeeId)!.set(v.componentCode, Number(v.amount));
    }

    const { workbook } = this.buildExcel(template, employees, valuesByEmp);

    // Save file
    const period = `${run.periodYear}-${String(run.periodMonth).padStart(2, '0')}`;
    const fileName = `${registerType}_${stateCode}_${period}.xlsx`;
    const dir = path.join(process.cwd(), 'uploads', 'registers', run.clientId);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, fileName);

    await workbook.xlsx.writeFile(filePath);
    const stats = fs.statSync(filePath);

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

  /* ───── public: generate all registers for a branch ───── */

  async generateAllForBranch(
    runId: string,
    branchId: string,
    userId: string,
  ): Promise<{ generated: RegistersRecordEntity[]; skipped: string[] }> {
    const run = await this.runRepo.findOne({ where: { id: runId } });
    if (!run) throw new NotFoundException('Payroll run not found');

    const branch = await this.getBranchInfo(branchId);
    const estCategory = this.getEstablishmentCategory(branch.branchType);

    const allTemplates = await this.findApplicableTemplates(
      branch.stateCode,
      estCategory,
    );

    // Apply applicability filtering based on branch conditions
    const branchApplicability = await this.getBranchApplicability(branchId);
    let templates = this.filterByApplicability(allTemplates, {
      employeeCount: branch.employeeCount,
      contractorCount: branch.contractorCount,
      hasPf: branchApplicability.hasPf,
      hasEsi: branchApplicability.hasEsi,
    });

    // Filter to only payroll-linked registers (non-payroll registers route to Branch/Client/CRM)
    const skipped: string[] = [];
    for (const template of templates) {
      if (!PAYROLL_LINKED_REGISTERS.has(template.registerType)) {
        skipped.push(
          `${template.title} - Event-based register, upload via Branch/Client/CRM Portal`,
        );
      }
    }
    templates = templates.filter((t) => PAYROLL_LINKED_REGISTERS.has(t.registerType));

    if (templates.length === 0) {
      throw new NotFoundException(
        `No payroll-linked register templates found for branch type=${branch.branchType}, state=${branch.stateCode}`,
      );
    }

    // Get employees for this branch in this run
    const employees = await this.runEmpRepo.find({
      where: { runId, branchId },
      order: { employeeName: 'ASC' },
    });
    if (employees.length === 0) {
      throw new NotFoundException(
        'No employees found for this branch in the payroll run',
      );
    }

    // Bulk-load component values
    const empIds = employees.map((e) => e.id);
    const allValues = await this.compValRepo.find({
      where: { runEmployeeId: In(empIds) },
    });
    const valuesByEmp = new Map<string, Map<string, number>>();
    for (const v of allValues) {
      if (!valuesByEmp.has(v.runEmployeeId))
        valuesByEmp.set(v.runEmployeeId, new Map());
      valuesByEmp.get(v.runEmployeeId)!.set(v.componentCode, Number(v.amount));
    }

    // Load extra fields from the master employees table
    const employeeIds = employees
      .filter((e) => e.employeeId)
      .map((e) => e.employeeId);
    const extraFieldsByEmp = new Map<string, Record<string, string>>();
    if (employeeIds.length > 0) {
      const masterRows: Record<string, string>[] =
        await this.runRepo.manager.query(
          `SELECT id,
             COALESCE(father_name, '') AS father_name,
             COALESCE(gender, '') AS gender,
             COALESCE(date_of_birth::text, '') AS date_of_birth,
             COALESCE(date_of_joining::text, '') AS date_of_joining,
             COALESCE(aadhaar, '') AS aadhaar,
             COALESCE(pan, '') AS pan,
             COALESCE(phone, '') AS phone,
             COALESCE(email, '') AS email,
             COALESCE(bank_name, '') AS bank_name,
             COALESCE(bank_account, '') AS bank_account,
             COALESCE(ifsc, '') AS ifsc,
             COALESCE(department, '') AS department
           FROM employees WHERE id = ANY($1)`,
          [employeeIds],
        );
      const masterMap = new Map(masterRows.map((r) => [r.id, r]));
      for (const emp of employees) {
        if (emp.employeeId && masterMap.has(emp.employeeId)) {
          const m = masterMap.get(emp.employeeId)!;
          extraFieldsByEmp.set(emp.id, {
            father_name: m.father_name || '',
            gender: m.gender || '',
            date_of_birth: m.date_of_birth || '',
            date_of_joining: m.date_of_joining || '',
            aadhaar: m.aadhaar || '',
            pan: m.pan || '',
            phone: m.phone || '',
            email: m.email || '',
            bank_name: m.bank_name || '',
            bank_account: m.bank_account || '',
            ifsc: m.ifsc || '',
            department: m.department || '',
          });
        }
      }
    }

    const period = `${run.periodYear}-${String(run.periodMonth).padStart(2, '0')}`;
    const branchCode = branch.branchCode || branchId.substring(0, 8);
    const dir = path.join(process.cwd(), 'uploads', 'registers', run.clientId);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const generated: RegistersRecordEntity[] = [];

    for (const template of templates) {
      // Skip if already generated for this branch + period + type
      const existing = await this.rrRepo.findOne({
        where: {
          clientId: run.clientId,
          branchId,
          registerType: template.registerType,
          periodYear: run.periodYear,
          periodMonth: run.periodMonth,
        },
      });
      if (existing) {
        skipped.push(template.title);
        continue;
      }

      const { workbook } = this.buildExcel(template, employees, valuesByEmp, extraFieldsByEmp);

      const stCode = branch.stateCode || 'XX';
      const fileName = `${template.registerType}_${stCode}_${branchCode}_${period}.xlsx`;
      const filePath = path.join(dir, fileName);
      await workbook.xlsx.writeFile(filePath);
      const stats = fs.statSync(filePath);

      const record = this.rrRepo.create({
        clientId: run.clientId,
        branchId,
        payrollInputId: run.sourcePayrollInputId,
        category: 'REGISTER',
        title: `${template.title} - ${branch.branchName || branchCode} - ${period}`,
        periodYear: run.periodYear,
        periodMonth: run.periodMonth,
        preparedByUserId: userId,
        fileName,
        filePath,
        fileType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        fileSize: String(stats.size),
        registerType: template.registerType,
        stateCode: stCode,
        approvalStatus: 'PENDING',
      });

      generated.push(await this.rrRepo.save(record));
    }

    return { generated, skipped };
  }

  /* ───── public: list applicable templates for a branch ───── */

  async listTemplatesForBranch(branchId: string) {
    const branch = await this.getBranchInfo(branchId);
    const estCategory = this.getEstablishmentCategory(branch.branchType);
    const allTemplates = await this.findApplicableTemplates(
      branch.stateCode,
      estCategory,
    );

    // Apply applicability filtering
    const branchApplicability = await this.getBranchApplicability(branchId);
    const templates = this.filterByApplicability(allTemplates, {
      employeeCount: branch.employeeCount,
      contractorCount: branch.contractorCount,
      hasPf: branchApplicability.hasPf,
      hasEsi: branchApplicability.hasEsi,
    });

    return {
      branchId,
      branchName: branch.branchName,
      branchType: branch.branchType,
      establishmentCategory: estCategory,
      stateCode: branch.stateCode,
      employeeCount: branch.employeeCount,
      contractorCount: branch.contractorCount,
      hasPf: branchApplicability.hasPf,
      hasEsi: branchApplicability.hasEsi,
      templates: templates.map((t) => ({
        id: t.id,
        registerType: t.registerType,
        title: t.title,
        description: t.description,
        establishmentType: t.establishmentType,
        stateCode: t.stateCode,
        lawFamily: t.lawFamily,
        formCode: t.formCode,
        registerMode: t.registerMode,
        frequency: t.frequency,
      })),
    };
  }

  async listTemplates(stateCode?: string) {
    const where: { isActive: true; stateCode?: string } = { isActive: true };
    if (stateCode) where.stateCode = stateCode;
    return this.templateRepo.find({
      where,
      order: { stateCode: 'ASC', registerType: 'ASC' },
    });
  }
}
