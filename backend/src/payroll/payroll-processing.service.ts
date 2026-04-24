import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import * as ExcelJS from 'exceljs';
import { PayrollRunEntity } from './entities/payroll-run.entity';
import { PayrollRunEmployeeEntity } from './entities/payroll-run-employee.entity';
import { PayrollRunItemEntity } from './entities/payroll-run-item.entity';
import { PayrollRunComponentValueEntity } from './entities/payroll-run-component-value.entity';
import { PayrollClientSetupEntity } from './entities/payroll-client-setup.entity';
import { PayrollComponentEntity } from './entities/payroll-component.entity';
import { PayrollComponentRuleEntity } from './entities/payroll-component-rule.entity';
import { PayrollComponentSlabEntity } from './entities/payroll-component-slab.entity';
import { EmployeeEntity } from '../employees/entities/employee.entity';
import { StatutoryCalculatorService } from './services/statutory-calculator.service';
import { StateStatutoryService } from './services/state-statutory.service';
import { evaluateFormula } from './engine/expression';

/** Component codes that are system-generated — skip during upload validation */
const SYSTEM_CODES = new Set([
  'PF_WAGES',
  'PF_EMP',
  'PF_ER',
  'PF_EPS',
  'PF_DIFF',
  'ESI_WAGES',
  'ESI_EMP',
  'ESI_ER',
  'PT',
  'LWF_EMP',
  'LWF_ER',
  'GROSS',
  'NET_PAY',
  'LOP_DAYS',
  'NCP_DAYS',
  'OT_HOURS',
  'OTHER_EARNINGS',
  'OTHER_DEDUCTIONS',
]);

@Injectable()
export class PayrollProcessingService {
  constructor(
    @InjectRepository(PayrollRunEntity)
    private readonly runRepo: Repository<PayrollRunEntity>,
    @InjectRepository(PayrollRunEmployeeEntity)
    private readonly runEmpRepo: Repository<PayrollRunEmployeeEntity>,
    @InjectRepository(PayrollRunItemEntity)
    private readonly _runItemRepo: Repository<PayrollRunItemEntity>,
    @InjectRepository(PayrollRunComponentValueEntity)
    private readonly compValRepo: Repository<PayrollRunComponentValueEntity>,
    @InjectRepository(PayrollClientSetupEntity)
    private readonly setupRepo: Repository<PayrollClientSetupEntity>,
    @InjectRepository(PayrollComponentEntity)
    private readonly compRepo: Repository<PayrollComponentEntity>,
    @InjectRepository(PayrollComponentRuleEntity)
    private readonly ruleRepo: Repository<PayrollComponentRuleEntity>,
    @InjectRepository(PayrollComponentSlabEntity)
    private readonly slabRepo: Repository<PayrollComponentSlabEntity>,
    @InjectRepository(EmployeeEntity)
    private readonly empRepo: Repository<EmployeeEntity>,
    private readonly ds: DataSource,
    private readonly statutory: StatutoryCalculatorService,
    private readonly stateStat: StateStatutoryService,
  ) {}

  // ── Upload Breakup Excel ────────────────────────────────
  async uploadBreakup(runId: string, file: Express.Multer.File) {
    const run = await this.runRepo.findOne({ where: { id: runId } });
    if (!run) throw new NotFoundException('Payroll run not found');

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(file.path);
    const sheet = workbook.worksheets[0];
    if (!sheet) throw new BadRequestException('No worksheet found');

    const headers: string[] = [];
    sheet.getRow(1).eachCell((cell, colNum) => {
      headers[colNum] = this.normalizeHeader(cell.value);
    });

    // Identify employee_code and employee_name columns
    const codeCol = headers.findIndex((h) =>
      ['employee code', 'employeecode', 'emp code', 'empcode'].includes(h),
    );
    const nameCol = headers.findIndex((h) =>
      ['employee name', 'employeename', 'emp name', 'name'].includes(h),
    );
    if (codeCol < 0)
      throw new BadRequestException('Column "Employee Code" not found');

    // Component columns: all remaining columns after code/name
    const componentCols: { col: number; code: string }[] = [];
    headers.forEach((h, i) => {
      if (i !== codeCol && i !== nameCol && h) {
        componentCols.push({
          col: i,
          code: h.replace(/\s/g, '_').toUpperCase(),
        });
      }
    });

    // ── Validation: check component columns against configured + system codes ──
    const knownComponents = await this.compRepo.find({
      where: { clientId: run.clientId, isActive: true },
    });
    const knownCodes = new Set(knownComponents.map((c) => c.code));

    // Allow system codes in upload without error, but don't require them
    const allowedCodes = new Set([...knownCodes, ...SYSTEM_CODES]);

    const unknownCols = componentCols.filter((c) => !allowedCodes.has(c.code));
    const warnings: string[] = [];
    if (unknownCols.length > 0) {
      warnings.push(
        `Unknown columns (ignored): ${unknownCols.map((c) => c.code).join(', ')}`,
      );
    }

    // Check required components — exclude system codes from required check
    const requiredCodes = knownComponents
      .filter((c) => c.isRequired && !SYSTEM_CODES.has(c.code))
      .map((c) => c.code);
    const uploadedCodes = new Set(componentCols.map((c) => c.code));
    const missingRequired = requiredCodes.filter((c) => !uploadedCodes.has(c));
    if (missingRequired.length > 0) {
      warnings.push(`Missing required columns: ${missingRequired.join(', ')}`);
    }

    // ── Preload: bulk-fetch all master employees and existing run employees ──
    const masterEmployees = await this.empRepo.find({
      where: { clientId: run.clientId },
    });
    const masterByCode = new Map(
      masterEmployees.map((e) => [e.employeeCode, e]),
    );

    const existingRunEmps = await this.runEmpRepo.find({ where: { runId } });
    const runEmpByCode = new Map(
      existingRunEmps.map((e) => [e.employeeCode, e]),
    );

    // ── Parse rows with validation ──
    const errors: string[] = [];
    const seenCodes = new Set<string>();

    // Collect parsed rows first (validation pass)
    type ParsedRow = {
      rowNum: number;
      empCode: string;
      empName: string;
      values: { code: string; amount: number }[];
    };
    const parsedRows: ParsedRow[] = [];

    for (let r = 2; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r);
      const empCode = this.cellStr(row.getCell(codeCol + 1).value);
      if (!empCode) continue;

      if (seenCodes.has(empCode)) {
        errors.push(`Row ${r}: Duplicate employee code "${empCode}"`);
        continue;
      }
      seenCodes.add(empCode);

      // Negative amount check (only for known non-system components)
      for (const cc of componentCols) {
        if (!knownCodes.has(cc.code)) continue;
        const amt = this.cellNum(row.getCell(cc.col + 1).value);
        if (amt !== null && amt < 0) {
          errors.push(
            `Row ${r}: Negative amount (${amt}) for component "${cc.code}"`,
          );
        }
      }

      const empName =
        nameCol >= 0
          ? this.cellStr(row.getCell(nameCol + 1).value) || empCode
          : empCode;

      // Collect component values for this row
      const rowValues: { code: string; amount: number }[] = [];
      for (const cc of componentCols) {
        if (!knownCodes.has(cc.code)) continue;
        const amount = this.cellNum(row.getCell(cc.col + 1).value);
        if (amount !== null) {
          rowValues.push({ code: cc.code, amount });
        }
      }

      parsedRows.push({ rowNum: r, empCode, empName, values: rowValues });
    }

    // ── Bulk insert/update within a transaction ──
    let imported = 0;

    await this.ds.transaction(async (mgr) => {
      const runEmpRepo = mgr.getRepository(PayrollRunEmployeeEntity);
      const compValRepo = mgr.getRepository(PayrollRunComponentValueEntity);

      // Phase 1: Upsert all run employees in batches
      const newRunEmps: Partial<PayrollRunEmployeeEntity>[] = [];
      const updateRunEmps: PayrollRunEmployeeEntity[] = [];

      for (const pr of parsedRows) {
        const masterEmp = masterByCode.get(pr.empCode);
        const existingRunEmp = runEmpByCode.get(pr.empCode);

        if (!masterEmp) {
          warnings.push(
            `Row ${pr.rowNum}: Employee code "${pr.empCode}" not found in master`,
          );
        }

        const fullName = masterEmp
          ? masterEmp.name
          : pr.empName;

        if (!existingRunEmp) {
          newRunEmps.push({
            runId,
            clientId: run.clientId,
            branchId: masterEmp?.branchId || run.branchId,
            employeeCode: pr.empCode,
            employeeName: fullName,
            designation: masterEmp?.designation || null,
            uan: masterEmp?.uan || null,
            esic: masterEmp?.esic || null,
            employeeId: masterEmp?.id || null,
            stateCode: masterEmp?.stateCode || null,
          });
        } else if (masterEmp) {
          existingRunEmp.uan = masterEmp.uan || existingRunEmp.uan;
          existingRunEmp.esic = masterEmp.esic || existingRunEmp.esic;
          existingRunEmp.stateCode =
            masterEmp.stateCode || existingRunEmp.stateCode;
          existingRunEmp.designation =
            masterEmp.designation || existingRunEmp.designation;
          existingRunEmp.employeeId = masterEmp.id || existingRunEmp.employeeId;
          existingRunEmp.branchId =
            masterEmp.branchId || existingRunEmp.branchId;
          existingRunEmp.employeeName = fullName;
          updateRunEmps.push(existingRunEmp);
        }
      }

      // Batch save new run employees (chunks of 500)
      const BATCH = 500;
      if (newRunEmps.length > 0) {
        for (let i = 0; i < newRunEmps.length; i += BATCH) {
          const batch = newRunEmps.slice(i, i + BATCH);
          const saved = await runEmpRepo.save(
            batch.map((e) => runEmpRepo.create(e)),
          );
          // Update runEmpByCode map with newly saved entities
          for (const s of saved) {
            runEmpByCode.set(s.employeeCode, s);
          }
        }
      }

      // Batch save updated run employees
      if (updateRunEmps.length > 0) {
        for (let i = 0; i < updateRunEmps.length; i += BATCH) {
          await runEmpRepo.save(updateRunEmps.slice(i, i + BATCH));
        }
      }

      // Phase 2: Bulk upsert component values
      const allCompValues: Partial<PayrollRunComponentValueEntity>[] = [];
      for (const pr of parsedRows) {
        const runEmp = runEmpByCode.get(pr.empCode);
        if (!runEmp) continue;

        for (const v of pr.values) {
          allCompValues.push({
            runId,
            runEmployeeId: runEmp.id,
            componentCode: v.code,
            amount: String(v.amount),
            source: 'UPLOADED' as const,
          });
        }
        imported++;
      }

      // Batch upsert component values (chunks of 1000)
      const CV_BATCH = 1000;
      for (let i = 0; i < allCompValues.length; i += CV_BATCH) {
        const batch = allCompValues.slice(i, i + CV_BATCH);
        await compValRepo
          .createQueryBuilder()
          .insert()
          .values(batch)
          .orUpdate(['amount', 'source'], ['run_employee_id', 'component_code'])
          .execute();
      }
    });

    return {
      imported,
      componentColumns: componentCols
        .filter((c) => knownCodes.has(c.code))
        .map((c) => c.code),
      warnings,
      errors,
    };
  }

  // ── Process Payroll Run ─────────────────────────────────
  async processRun(runId: string) {
    const run = await this.runRepo.findOne({ where: { id: runId } });
    if (!run) throw new NotFoundException('Payroll run not found');

    const currentStatus = String(run.status || '').toUpperCase();
    if (
      currentStatus !== 'DRAFT' &&
      currentStatus !== 'REJECTED' &&
      currentStatus !== 'IN_PROGRESS'
    ) {
      throw new ConflictException(
        `Payroll run is "${currentStatus}". Only DRAFT, REJECTED, or IN_PROGRESS runs can be processed.`,
      );
    }

    // ── Setup validation ──
    const setup = await this.setupRepo.findOne({
      where: { clientId: run.clientId },
    });
    if (!setup) {
      throw new BadRequestException(
        'Payroll setup not configured for this client. Complete setup before processing.',
      );
    }

    const components = await this.compRepo.find({
      where: { clientId: run.clientId, isActive: true },
      order: { displayOrder: 'ASC' },
    });
    if (components.length === 0) {
      throw new BadRequestException(
        'No payroll components configured. Add at least one earning component before processing.',
      );
    }

    const hasEarning = components.some((c) => c.componentType === 'EARNING');
    if (!hasEarning) {
      throw new BadRequestException(
        'At least one EARNING component must be configured.',
      );
    }

    const employees = await this.runEmpRepo.find({ where: { runId } });
    if (employees.length === 0) {
      throw new BadRequestException(
        'No employees in this payroll run. Upload a breakup file first.',
      );
    }

    for (const emp of employees) {
      const existingValues = await this.compValRepo.find({
        where: { runEmployeeId: emp.id },
      });
      const valueMap = new Map<string, number>();
      existingValues.forEach((v) =>
        valueMap.set(v.componentCode, Number(v.amount)),
      );

      // Track which codes were uploaded (so we don't override them)
      const uploadedCodes = new Set(
        existingValues
          .filter((v) => v.source === 'UPLOADED')
          .map((v) => v.componentCode),
      );

      // ── 1. Apply rules for components that have no uploaded value ──
      for (const comp of components) {
        if (valueMap.has(comp.code)) continue;

        const rules = await this.ruleRepo.find({
          where: { componentId: comp.id, isActive: true },
          order: { priority: 'ASC' },
        });

        let computed: number | null = null;
        for (const rule of rules) {
          computed = await this.applyRule(rule, valueMap);
          if (computed !== null) break;
        }

        if (computed !== null) {
          await this.upsertValue(runId, emp.id, comp.code, computed);
          valueMap.set(comp.code, computed);
        }
      }

      // ── 1b. Fallback: use employee monthlyGross if no earning values ──
      const hasAnyEarning = components.some(
        (c) => c.componentType === 'EARNING' && (valueMap.get(c.code) ?? 0) > 0,
      );
      if (!hasAnyEarning && emp.employeeId) {
        const masterEmp = await this.empRepo.findOne({
          where: { id: emp.employeeId },
          select: ['id', 'monthlyGross', 'ctc'],
        });
        const gross =
          Number(masterEmp?.monthlyGross) ||
          (Number(masterEmp?.ctc) ? Number(masterEmp!.ctc) / 12 : 0);
        if (gross > 0) {
          // Find the first EARNING component (typically BASIC) to assign the gross
          const firstEarning = components.find(
            (c) => c.componentType === 'EARNING',
          );
          if (firstEarning) {
            await this.upsertValue(runId, emp.id, firstEarning.code, Math.round(gross));
            valueMap.set(firstEarning.code, Math.round(gross));
          }
        }
      }

      // ── 2. Statutory PF/ESI via StatutoryCalculatorService ──
      const valuesObj: Record<string, number> = {};
      valueMap.forEach((v, k) => {
        valuesObj[k] = v;
      });

      const afterStat = this.statutory.compute({
        values: valuesObj,
        setup,
        components,
      });

      // ── 3. State-aware PT/LWF via StateStatutoryService ──
      const finalValues = await this.stateStat.applyStateDeductions({
        clientId: run.clientId,
        stateCode: emp.stateCode ?? 'ALL',
        values: afterStat.values,
        ptEnabled: setup.ptEnabled,
        lwfEnabled: setup.lwfEnabled,
      });

      // ── 4. Save all computed/statutory values (without overriding UPLOADED) ──
      for (const [code, amount] of Object.entries(finalValues)) {
        if (uploadedCodes.has(code)) continue; // don't override uploaded
        await this.upsertValue(runId, emp.id, code, amount);
      }

      // ── 5. Compute totals ──
      const grossEarnings = finalValues['GROSS'] ?? 0;
      let totalDeductions = 0;
      let employerCost = 0;

      for (const comp of components) {
        const val = finalValues[comp.code] ?? 0;
        if (comp.componentType === 'DEDUCTION') totalDeductions += val;
        else if (comp.componentType === 'EMPLOYER') employerCost += val;
      }

      // Statutory employee deductions
      totalDeductions +=
        (finalValues['PF_EMP'] || 0) +
        (finalValues['ESI_EMP'] || 0) +
        (finalValues['PT'] || 0) +
        (finalValues['LWF_EMP'] || 0);

      // Statutory employer costs
      employerCost +=
        (finalValues['PF_ER'] || 0) +
        (finalValues['ESI_ER'] || 0) +
        (finalValues['LWF_ER'] || 0);

      const netPay = grossEarnings - totalDeductions;

      // Save NET_PAY as component value
      await this.upsertValue(runId, emp.id, 'NET_PAY', netPay);

      emp.grossEarnings = String(Math.round(grossEarnings));
      emp.totalDeductions = String(Math.round(totalDeductions));
      emp.employerCost = String(Math.round(employerCost));
      emp.netPay = String(Math.round(netPay));
      await this.runEmpRepo.save(emp);
    }

    run.status = 'PROCESSED';
    // Reset approval metadata when run enters a new processing cycle.
    run.submittedByUserId = null;
    run.submittedAt = null;
    run.approvedByUserId = null;
    run.approvedAt = null;
    run.approvalComments = null;
    run.rejectedByUserId = null;
    run.rejectedAt = null;
    run.rejectionReason = null;
    await this.runRepo.save(run);

    return { processed: employees.length, status: 'PROCESSED' };
  }

  // ── Helpers ─────────────────────────────────────────────

  private async applyRule(
    rule: PayrollComponentRuleEntity,
    valueMap: Map<string, number>,
  ): Promise<number | null> {
    if (rule.ruleType === 'FIXED') {
      return rule.fixedAmount ? Number(rule.fixedAmount) : null;
    }
    if (rule.ruleType === 'PERCENTAGE' && rule.baseComponent) {
      const base = valueMap.get(rule.baseComponent);
      if (base !== undefined && rule.percentage) {
        return Math.round((base * Number(rule.percentage)) / 100);
      }
    }
    if (rule.ruleType === 'SLAB' && rule.baseComponent) {
      const base = valueMap.get(rule.baseComponent);
      if (base === undefined) return null;
      const slabs = await this.slabRepo.find({
        where: { ruleId: rule.id },
        order: { fromAmount: 'ASC' },
      });
      for (const slab of slabs) {
        const from = Number(slab.fromAmount);
        const to = slab.toAmount ? Number(slab.toAmount) : Infinity;
        if (base >= from && base <= to) {
          if (slab.slabPct)
            return Math.round((base * Number(slab.slabPct)) / 100);
          if (slab.slabFixed) return Number(slab.slabFixed);
        }
      }
    }
    if (rule.ruleType === 'FORMULA' && rule.formula) {
      try {
        const vars: Record<string, number> = {};
        valueMap.forEach((v, k) => {
          vars[k] = v;
        });
        return evaluateFormula(rule.formula, {
          vars,
          param: () => 0,
          earningsSum: () => {
            let sum = 0;
            valueMap.forEach((v) => {
              sum += v;
            });
            return sum;
          },
        });
      } catch {
        return null;
      }
    }
    return null;
  }

  private async upsertValue(
    runId: string,
    runEmployeeId: string,
    code: string,
    amount: number,
  ) {
    await this.compValRepo
      .createQueryBuilder()
      .insert()
      .values({
        runId,
        runEmployeeId,
        componentCode: code,
        amount: String(amount),
        source: 'CALCULATED' as const,
      })
      .orUpdate(['amount', 'source'], ['run_employee_id', 'component_code'])
      .execute();
  }

  // ─── Attendance Excel Upload ─────────────────────────────────────────
  async uploadAttendance(
    runId: string,
    file: Express.Multer.File,
  ): Promise<{ matched: number; skipped: string[] }> {
    const run = await this.runRepo.findOne({ where: { id: runId } });
    if (!run) throw new NotFoundException('Run not found');

    let employees = await this.runEmpRepo.find({ where: { runId } });

    // Auto-seed from master employee list if run has no employees yet
    if (!employees.length) {
      const whereClause: Record<string, any> = {
        clientId: run.clientId,
        isActive: true,
      };
      if (run.branchId) whereClause.branchId = run.branchId;
      const masterEmps = await this.empRepo.find({
        where: whereClause,
        order: { employeeCode: 'ASC' },
      });
      if (!masterEmps.length) {
        throw new BadRequestException(
          'No active employees found for this client',
        );
      }
      const seedEntities = masterEmps.map((emp) =>
        this.runEmpRepo.create({
          runId,
          clientId: run.clientId,
          branchId: emp.branchId ?? run.branchId ?? null,
          employeeId: emp.id,
          employeeCode: emp.employeeCode,
          employeeName: emp.name,
          designation: emp.designation ?? null,
          uan: emp.uan ?? null,
          esic: emp.esic ?? null,
          stateCode: emp.stateCode ?? null,
        }),
      );
      await this.runEmpRepo.save(seedEntities);
      employees = await this.runEmpRepo.find({ where: { runId } });
    }

    const empMap = new Map<string, typeof employees[0]>();
    for (const e of employees) {
      empMap.set(e.employeeCode.toLowerCase(), e);
    }

    const wb = new ExcelJS.Workbook();
    const ext = (file.originalname || '').split('.').pop()?.toLowerCase();
    if (ext === 'csv') {
      await wb.csv.readFile(file.path);
    } else {
      await wb.xlsx.readFile(file.path);
    }
    const ws = wb.worksheets[0];
    if (!ws) throw new BadRequestException('Empty workbook');

    // Parse header row
    const headerRow = ws.getRow(1);
    const headers: Record<number, string> = {};
    headerRow.eachCell((cell, colNum) => {
      headers[colNum] = this.normalizeHeader(cell.value);
    });

    // Find required columns
    let codeCol = -1;
    let workingDaysCol = -1;
  let payableDaysCol = -1;
  let otHoursCol = -1;
  let otherEarningsCol = -1;
  let arrearAttBonusCol = -1;
  let otherDeductionsCol = -1;

  for (const [col, h] of Object.entries(headers)) {
    const c = Number(col);
    if (/employee.*(code|id)|emp.*(code|id)/.test(h)) codeCol = c;
    else if (/working.*days|work.*days|days.*worked/.test(h)) workingDaysCol = c;
    else if (/payable.*days|pay.*days/.test(h)) payableDaysCol = c;
    else if (/ot.*hours|overtime/.test(h)) otHoursCol = c;
    else if (/other.*earning|arrear(?!.*bonus)/.test(h)) otherEarningsCol = c;
    else if (/arrears.*(?:attendance.*)?bonus|bonus.*arrear|arrear.*att/.test(h)) arrearAttBonusCol = c;
    else if (/other.*deduction/.test(h)) otherDeductionsCol = c;
    }

    if (codeCol < 0) throw new BadRequestException('Column "Employee Code" / "Employee ID" not found in header');
    if (workingDaysCol < 0) throw new BadRequestException('Column "Working Days" not found in header');

    const daysInMonth = new Date(run.periodYear, run.periodMonth, 0).getDate();
    const skipped: string[] = [];
    let matched = 0;
    let maxPayableDays = 0;
    const parsedAttendance: Array<{
      emp: typeof employees[0];
      workingDays: number;
      payableDays: number;
      otHours: number;
      otherEarnings: number;
      arrearAttBonus: number;
      otherDeductions: number;
    }> = [];

    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const empCode = this.cellStr(row.getCell(codeCol).value);
      if (!empCode) continue;

      const emp = empMap.get(empCode.toLowerCase());
      if (!emp) {
        skipped.push(empCode);
        continue;
      }

      const workingDays = this.cellNum(row.getCell(workingDaysCol).value) ?? 0;
      const payableDays = payableDaysCol > 0 ? (this.cellNum(row.getCell(payableDaysCol).value) ?? workingDays) : workingDays;
      const otHours = otHoursCol > 0 ? (this.cellNum(row.getCell(otHoursCol).value) ?? 0) : 0;
      const otherEarnings = otherEarningsCol > 0 ? (this.cellNum(row.getCell(otherEarningsCol).value) ?? 0) : 0;
      const arrearAttBonus = arrearAttBonusCol > 0 ? (this.cellNum(row.getCell(arrearAttBonusCol).value) ?? 0) : 0;
      const otherDeductions = otherDeductionsCol > 0 ? (this.cellNum(row.getCell(otherDeductionsCol).value) ?? 0) : 0;

      if (payableDays > maxPayableDays) maxPayableDays = payableDays;
      parsedAttendance.push({ emp, workingDays, payableDays, otHours, otherEarnings, arrearAttBonus, otherDeductions });
      matched++;
    }

    // Second pass: compute LOP using max payable days as the month total
    const totalPayable = maxPayableDays > 0 ? maxPayableDays : daysInMonth;
    for (const att of parsedAttendance) {
      const { emp, payableDays, otHours, otherEarnings, arrearAttBonus, otherDeductions } = att;
      const lopDays = Math.max(0, totalPayable - payableDays);

      emp.totalDays = totalPayable;
      emp.daysPresent = payableDays;
      emp.lopDays = lopDays;
      emp.ncpDays = lopDays;
      emp.otHours = otHours;
      await this.runEmpRepo.save(emp);

      const upserts: Array<{ code: string; amount: number }> = [
        { code: 'LOP_DAYS', amount: lopDays },
        { code: 'WORKED_DAYS', amount: att.workingDays },
        { code: 'PAYABLE_DAYS', amount: payableDays },
      ];
      if (otHours > 0) upserts.push({ code: 'OT_HOURS', amount: otHours });
      upserts.push({ code: 'OTHER_EARNINGS', amount: otherEarnings });
      if (arrearAttBonus > 0) upserts.push({ code: 'ARREAR_ATT_BONUS', amount: arrearAttBonus });
      if (otherDeductions > 0) upserts.push({ code: 'OTHER_DEDUCTIONS', amount: otherDeductions });

      for (const { code, amount } of upserts) {
        await this.compValRepo
          .createQueryBuilder()
          .insert()
          .values({
            runId,
            runEmployeeId: emp.id,
            componentCode: code,
            amount: String(amount),
            source: 'UPLOADED' as const,
          })
          .orUpdate(['amount', 'source'], ['run_employee_id', 'component_code'])
          .execute();
      }
    }

    return { matched, skipped };
  }

  private normalizeHeader(value: unknown): string {
    if (value === null || value === undefined) return '';
    return String(value).replace(/\s+/g, ' ').trim().toLowerCase();
  }

  private cellStr(value: unknown): string {
    if (value && typeof value === 'object') {
      if ('result' in value) return String(value.result);
      if ('text' in value) return String(value.text);
    }
    return value ? String(value).trim() : '';
  }

  private cellNum(value: unknown): number | null {
    const str = this.cellStr(value);
    if (!str) return null;
    const n = Number(str);
    return Number.isFinite(n) ? n : null;
  }
}
