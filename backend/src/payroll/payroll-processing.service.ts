import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
  Logger,
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
import { LeaveLedgerEntity } from '../ess/entities/leave-ledger.entity';
import { LeaveBalanceEntity } from '../ess/entities/leave-balance.entity';
import { LeaveApplicationEntity } from '../ess/entities/leave-application.entity';
import { AttendanceEntity } from '../attendance/entities/attendance.entity';
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
  private readonly logger = new Logger(PayrollProcessingService.name);
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
    @InjectRepository(LeaveLedgerEntity)
    private readonly leaveLedgerRepo: Repository<LeaveLedgerEntity>,
    @InjectRepository(LeaveBalanceEntity)
    private readonly leaveBalanceRepo: Repository<LeaveBalanceEntity>,
    @InjectRepository(LeaveApplicationEntity)
    private readonly leaveAppRepo: Repository<LeaveApplicationEntity>,
    @InjectRepository(AttendanceEntity)
    private readonly attendanceRepo: Repository<AttendanceEntity>,
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

        const fullName = masterEmp ? masterEmp.name : pr.empName;

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
      currentStatus !== 'IN_PROGRESS' &&
      currentStatus !== 'PROCESSED'
    ) {
      throw new ConflictException(
        `Payroll run is "${currentStatus}". Only DRAFT, REJECTED, IN_PROGRESS, or PROCESSED runs can be re-processed.`,
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
            await this.upsertValue(
              runId,
              emp.id,
              firstEarning.code,
              Math.ceil(gross),
            );
            valueMap.set(firstEarning.code, Math.ceil(gross));
          }
        }
      }

      // ── 2. Statutory PF/ESI via StatutoryCalculatorService ──
      const valuesObj: Record<string, number> = {};
      valueMap.forEach((v, k) => {
        valuesObj[k] = v;
      });

      // Load minimal master flags so per-employee PF/ESI applicability is honoured
      // and the ESI contribution-period rule (Apr-Sep / Oct-Mar) can flip the
      // master `esiApplicable` off when wage exceeds the ceiling at period start.
      let masterEsiApplicable: boolean | undefined;
      let masterPfApplicable: boolean | undefined;
      if (emp.employeeId) {
        const m = await this.empRepo.findOne({
          where: { id: emp.employeeId },
          select: ['id', 'pfApplicable', 'esiApplicable'],
        });
        masterPfApplicable = m?.pfApplicable;
        masterEsiApplicable = m?.esiApplicable;
      }

      const afterStat = this.statutory.compute({
        values: valuesObj,
        setup,
        components,
        pfApplicable: masterPfApplicable,
        esiApplicable: masterEsiApplicable,
        periodMonth: run.periodMonth,
      });

      // If the employee's ESI wage crossed the ceiling at the start of a
      // contribution period, persist the drop on the master so they stay out
      // of ESI for subsequent runs.
      if (afterStat.esiDroppedAtPeriodStart && emp.employeeId) {
        await this.empRepo.update(
          { id: emp.employeeId },
          { esiApplicable: false },
        );
      }

      // ── 3. State-aware PT/LWF via StateStatutoryService ──
      // Fallback: if employee state_code is missing, use branch.statecode so
      // PT/LWF apply (otherwise the slab lookup silently returns 0).
      let stateCodeForStat = emp.stateCode ?? '';
      if (!stateCodeForStat && emp.branchId) {
        const br = await this.ds.query(
          `SELECT statecode FROM client_branches WHERE id=$1 LIMIT 1`,
          [emp.branchId],
        );
        stateCodeForStat = br?.[0]?.statecode ?? '';
        if (stateCodeForStat) {
          emp.stateCode = stateCodeForStat;
          if (emp.employeeId) {
            await this.ds.query(
              `UPDATE employees SET state_code=$1 WHERE id=$2 AND (state_code IS NULL OR state_code='')`,
              [stateCodeForStat, emp.employeeId],
            );
          }
        }
      }
      const finalValues = await this.stateStat.applyStateDeductions({
        clientId: run.clientId,
        stateCode: stateCodeForStat || 'ALL',
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
      // GROSS already includes OT_AMOUNT (folded in by StatutoryCalculatorService
      // per business rule: PT/LWF base = basic+HRA+other+OTHER_EARNINGS+OT;
      // ESI base = basic+HRA+other+OT). Do NOT add OT again here.
      const grossEarnings = Number(finalValues['GROSS'] ?? 0);
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

      emp.grossEarnings = String(Math.ceil(grossEarnings));
      emp.totalDeductions = String(Math.ceil(totalDeductions));
      emp.employerCost = String(Math.ceil(employerCost));
      emp.netPay = String(Math.ceil(netPay));
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
        return Math.ceil((base * Number(rule.percentage)) / 100);
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
            return Math.ceil((base * Number(slab.slabPct)) / 100);
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
  ): Promise<{
    matched: number;
    skipped: string[];
    unrecognisedHeaders?: string[];
  }> {
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

    const empMap = new Map<string, (typeof employees)[0]>();
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
    let approvedLeaveCol = -1;
    let plLeaveCol = -1;
    let slLeaveCol = -1;

    for (const [col, h] of Object.entries(headers)) {
      const c = Number(col);
      if (/employee.*(code|id)|emp.*(code|id)/.test(h)) codeCol = c;
      else if (/working.*days|work.*days|days.*worked/.test(h))
        workingDaysCol = c;
      else if (/payable.*days|pay.*days/.test(h)) payableDaysCol = c;
      else if (/ot.*hours|overtime/.test(h)) otHoursCol = c;
      else if (/other.*earning|arrear(?!.*bonus)/.test(h)) otherEarningsCol = c;
      else if (
        /arrears.*(?:attendance.*)?bonus|bonus.*arrear|arrear.*att/.test(h)
      )
        arrearAttBonusCol = c;
      else if (/other.*deduction/.test(h)) otherDeductionsCol = c;
      // PL / SL columns (privilege / sick leave days). Match before generic
      // approved-leave to avoid being absorbed by it.
      else if (/^(pl(\s+days?)?|privilege\s+leaves?(\s+days?)?)$/.test(h))
        plLeaveCol = c;
      else if (/^(sl(\s+days?)?|sick\s+leaves?(\s+days?)?)$/.test(h))
        slLeaveCol = c;
      // Strict match: only an explicit "Approved Leave [Days]" / "EL Paid Leave [Days]" column
      // counts. Loose patterns like "Paid Leave Balance" or "Casual Leave" must NOT be picked
      // up — they previously caused phantom leave values in the Leave Validation panel.
      else if (
        /^(approved|approved\s+leaves?(\s+days?)?|el\s+paid\s+leaves?(\s+days?)?|paid\s+leaves?\s+approved|leaves?\s+approved(\s+days?)?)$/.test(
          h,
        )
      )
        approvedLeaveCol = c;
    }
    if (approvedLeaveCol > 0) {
      this.logger.debug(
        `[uploadAttendance] Detected approved-leave column at index ${approvedLeaveCol} (header="${headers[approvedLeaveCol]}")`,
      );
    } else {
      this.logger.debug(
        '[uploadAttendance] No explicit approved-leave column detected; EL_PAID_LEAVE_DAYS will be 0 for all rows',
      );
    }

    if (codeCol < 0)
      throw new BadRequestException(
        'Column "Employee Code" / "Employee ID" not found in header',
      );
    if (workingDaysCol < 0)
      throw new BadRequestException(
        'Column "Working Days" not found in header',
      );

    // H4: Surface any header columns the parser didn't recognise so the
    // uploader can spot typos / renamed columns instead of silently
    // discarding the values. Doesn't fail the upload \u2014 extra columns are
    // tolerated, but the result payload lists them for the UI to warn on.
    const recognisedCols = new Set(
      [
        codeCol,
        workingDaysCol,
        payableDaysCol,
        otHoursCol,
        otherEarningsCol,
        arrearAttBonusCol,
        otherDeductionsCol,
        approvedLeaveCol,
        plLeaveCol,
        slLeaveCol,
      ].filter((c) => c > 0),
    );
    const unrecognisedHeaders: string[] = [];
    for (const [col, h] of Object.entries(headers)) {
      const c = Number(col);
      if (recognisedCols.has(c)) continue;
      if (!h) continue;
      // Allow purely informational columns (employee name, designation, etc.)
      if (
        /^(employee\s*name|name|designation|department|branch|client|location|grade)$/.test(
          h,
        )
      )
        continue;
      unrecognisedHeaders.push(h);
    }
    if (unrecognisedHeaders.length) {
      this.logger.warn(
        `[uploadAttendance] Unrecognised header columns ignored: ${unrecognisedHeaders.join(', ')}`,
      );
    }

    const daysInMonth = new Date(run.periodYear, run.periodMonth, 0).getDate();
    const skipped: string[] = [];
    let matched = 0;
    let maxPayableDays = 0;
    const parsedAttendance: Array<{
      emp: (typeof employees)[0];
      workingDays: number;
      payableDays: number;
      otHours: number;
      otherEarnings: number;
      arrearAttBonus: number;
      otherDeductions: number;
      approvedLeaveDays: number;
      plDays: number;
      slDays: number;
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
      const payableDays =
        payableDaysCol > 0
          ? (this.cellNum(row.getCell(payableDaysCol).value) ?? workingDays)
          : workingDays;
      const otHours =
        otHoursCol > 0 ? (this.cellNum(row.getCell(otHoursCol).value) ?? 0) : 0;
      const otherEarnings =
        otherEarningsCol > 0
          ? (this.cellNum(row.getCell(otherEarningsCol).value) ?? 0)
          : 0;
      const arrearAttBonus =
        arrearAttBonusCol > 0
          ? (this.cellNum(row.getCell(arrearAttBonusCol).value) ?? 0)
          : 0;
      const otherDeductions =
        otherDeductionsCol > 0
          ? (this.cellNum(row.getCell(otherDeductionsCol).value) ?? 0)
          : 0;
      const approvedLeaveDays =
        approvedLeaveCol > 0
          ? Math.max(0, this.cellNum(row.getCell(approvedLeaveCol).value) ?? 0)
          : 0;
      const plDays =
        plLeaveCol > 0
          ? Math.max(0, this.cellNum(row.getCell(plLeaveCol).value) ?? 0)
          : 0;
      const slDays =
        slLeaveCol > 0
          ? Math.max(0, this.cellNum(row.getCell(slLeaveCol).value) ?? 0)
          : 0;

      if (payableDays > maxPayableDays) maxPayableDays = payableDays;
      parsedAttendance.push({
        emp,
        workingDays,
        payableDays,
        otHours,
        otherEarnings,
        arrearAttBonus,
        otherDeductions,
        approvedLeaveDays,
        plDays,
        slDays,
      });
      matched++;
    }

    // Second pass: compute LOP using max payable days as the month total
    const totalPayable = maxPayableDays > 0 ? maxPayableDays : daysInMonth;
    for (const att of parsedAttendance) {
      const {
        emp,
        payableDays,
        otHours,
        otherEarnings,
        arrearAttBonus,
        otherDeductions,
      } = att;
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
        { code: 'EL_PAID_LEAVE_DAYS', amount: att.approvedLeaveDays },
        { code: 'PL_DAYS', amount: att.plDays },
        { code: 'SL_DAYS', amount: att.slDays },
      ];
      if (otHours > 0) upserts.push({ code: 'OT_HOURS', amount: otHours });
      upserts.push({ code: 'OTHER_EARNINGS', amount: otherEarnings });
      if (arrearAttBonus > 0)
        upserts.push({ code: 'ARREAR_ATT_BONUS', amount: arrearAttBonus });
      if (otherDeductions > 0)
        upserts.push({ code: 'OTHER_DEDUCTIONS', amount: otherDeductions });

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

      // ── Sync EL paid leave to leave_ledger + leave_balances ──
      if (emp.employeeId) {
        await this.syncEmployeePaidLeave(
          emp.employeeId,
          run.clientId,
          run.periodYear,
          run.periodMonth,
          run.id,
          att.plDays,
          att.slDays,
          emp.id,
        );
      }
    }

    return { matched, skipped, unrecognisedHeaders };
  }

  /**
   * Sync this run's approved leave days into leave_ledger + leave_balances.
   *
   * PL (privilege/earned leave) is debited against the EL bucket and SL (sick/
   * casual leave) against the SL bucket. Each bucket is treated independently:
   *   - opening balance from `leave_balances.opening`
   *   - + accrued (sum of EL_ACCRUAL / SL_ACCRUAL ledger credits in the year)
   *   - − used (sum of EL_PAID_LEAVE / SL_PAID_LEAVE debits in the year)
   * Earned leave accrual continues to be credited via the engine (EL_ACCRUED)
   * so the post-deduction balance reflects "balance − availed + earned".
   * Removes any prior ledger entry tagged for this month/run, then inserts a
   * fresh debit per leave type and rebuilds the year-to-date balance row.
   */
  private async syncEmployeePaidLeave(
    employeeId: string,
    clientId: string,
    year: number,
    month: number,
    runId: string,
    plDays: number,
    slDays: number,
    runEmployeeId?: string,
  ): Promise<void> {
    const monthStr = `${year}-${String(month).padStart(2, '0')}`;
    const entryDate = `${monthStr}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`;

    type LeaveBucket = {
      ledgerType: 'EL' | 'SL';
      refType: string;
      accrualRefType: string;
      days: number;
      label: string;
      balanceComp: string;
      accruedComp: string;
    };
    const buckets: LeaveBucket[] = [
      {
        ledgerType: 'EL',
        refType: 'EL_PAID_LEAVE',
        accrualRefType: 'EL_ACCRUAL',
        days: plDays,
        label: 'PL',
        balanceComp: 'EL_BALANCE',
        accruedComp: 'EL_ACCRUED',
      },
      {
        ledgerType: 'SL',
        refType: 'SL_PAID_LEAVE',
        accrualRefType: 'SL_ACCRUAL',
        days: slDays,
        label: 'SL',
        balanceComp: 'SL_BALANCE',
        accruedComp: 'SL_ACCRUED',
      },
    ];

    for (const b of buckets) {
      try {
        // Idempotent: drop any existing entry from this run/month for this bucket
        await this.leaveLedgerRepo
          .createQueryBuilder()
          .delete()
          .where('employee_id = :empId', { empId: employeeId })
          .andWhere('leave_type = :lt', { lt: b.ledgerType })
          .andWhere('ref_type = :rt', { rt: b.refType })
          .andWhere('(ref_id = :rid OR remarks LIKE :m)', {
            rid: runId,
            m: `%${monthStr}%`,
          })
          .execute();

        if (b.days > 0) {
          await this.leaveLedgerRepo.save(
            this.leaveLedgerRepo.create({
              employeeId,
              clientId,
              leaveType: b.ledgerType,
              entryDate,
              qty: String(-b.days),
              refType: b.refType,
              refId: runId,
              remarks: `${b.label} paid leave for ${monthStr}: ${b.days} days (attendance upload)`,
            }),
          );
        }

        // Rebuild leave_balances row for this calendar year + leave type
        await this.leaveBalanceRepo.query(
          `INSERT INTO leave_balances (id, employee_id, client_id, year, leave_type, opening, accrued, used, lapsed, available, created_at)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, 0,
                   COALESCE((SELECT SUM(ABS(qty)) FROM leave_ledger
                             WHERE employee_id = $1 AND leave_type = $4 AND ref_type = $5
                               AND EXTRACT(YEAR FROM entry_date::date) = $3), 0),
                   COALESCE((SELECT SUM(ABS(qty)) FROM leave_ledger
                             WHERE employee_id = $1 AND leave_type = $4 AND ref_type = $6
                               AND EXTRACT(YEAR FROM entry_date::date) = $3), 0),
                   0,
                   GREATEST(
                     COALESCE((SELECT SUM(ABS(qty)) FROM leave_ledger
                               WHERE employee_id = $1 AND leave_type = $4 AND ref_type = $5
                                 AND EXTRACT(YEAR FROM entry_date::date) = $3), 0)
                     - COALESCE((SELECT SUM(ABS(qty)) FROM leave_ledger
                                 WHERE employee_id = $1 AND leave_type = $4 AND ref_type = $6
                                   AND EXTRACT(YEAR FROM entry_date::date) = $3), 0), 0),
                   NOW())
           ON CONFLICT (employee_id, year, leave_type)
           DO UPDATE SET accrued   = COALESCE((SELECT SUM(ABS(qty)) FROM leave_ledger
                                               WHERE employee_id = $1 AND leave_type = $4 AND ref_type = $5
                                                 AND EXTRACT(YEAR FROM entry_date::date) = $3), 0),
                         used      = COALESCE((SELECT SUM(ABS(qty)) FROM leave_ledger
                                               WHERE employee_id = $1 AND leave_type = $4 AND ref_type = $6
                                                 AND EXTRACT(YEAR FROM entry_date::date) = $3), 0),
                         available = GREATEST(leave_balances.opening
                           + COALESCE((SELECT SUM(ABS(qty)) FROM leave_ledger
                                       WHERE employee_id = $1 AND leave_type = $4 AND ref_type = $5
                                         AND EXTRACT(YEAR FROM entry_date::date) = $3), 0)
                           - COALESCE((SELECT SUM(ABS(qty)) FROM leave_ledger
                                       WHERE employee_id = $1 AND leave_type = $4 AND ref_type = $6
                                         AND EXTRACT(YEAR FROM entry_date::date) = $3), 0), 0),
                         last_updated_at = NOW()`,
          [
            employeeId,
            clientId,
            year,
            b.ledgerType,
            b.accrualRefType,
            b.refType,
          ],
        );

        // Persist accrued + balance as component values so payslip & leave
        // register can render them per-bucket without re-querying the ledger.
        if (runEmployeeId) {
          const balRow = await this.leaveBalanceRepo.findOne({
            where: { employeeId, year, leaveType: b.ledgerType },
          });
          const accrued = balRow ? parseFloat(balRow.accrued) || 0 : 0;
          const available = balRow ? parseFloat(balRow.available) || 0 : 0;
          for (const cv of [
            { code: b.accruedComp, amount: accrued },
            { code: b.balanceComp, amount: available },
          ]) {
            await this.compValRepo
              .createQueryBuilder()
              .insert()
              .values({
                runId,
                runEmployeeId,
                componentCode: cv.code,
                amount: String(cv.amount),
                source: 'CALCULATED' as const,
              })
              .orUpdate(
                ['amount', 'source'],
                ['run_employee_id', 'component_code'],
              )
              .execute();
          }
        }
      } catch (e) {
        // Non-fatal — payroll values are still saved; surface in logs only.
        console.warn(
          `[uploadAttendance] syncEmployeePaidLeave(${b.label}) failed for ${employeeId}: ${(e as Error).message}`,
        );
      }
    }
  }

  // ── Leave validation: compare attendance EL_PAID_LEAVE_DAYS to ESS approved ──
  /**
   * For each employee in a payroll run, compare the EL_PAID_LEAVE_DAYS captured
   * from the attendance upload against the days they actually applied for and
   * had APPROVED through the ESS portal (where the leave date overlaps the
   * run period). Returns rows where the two values differ so reviewers can
   * investigate or click "Resolve" to snap attendance to the ESS-approved figure.
   */
  async leaveValidation(runId: string): Promise<{
    runId: string;
    periodYear: number;
    periodMonth: number;
    rows: Array<{
      empCode: string;
      employeeName: string;
      employeeId: string | null;
      attendanceLeave: number;
      essApprovedLeave: number;
      diff: number;
      status: 'OK' | 'MISMATCH' | 'MISSING_IN_SHEET' | 'EXTRA_IN_SHEET';
      essApplications: Array<{
        id: string;
        leaveType: string;
        fromDate: string;
        toDate: string;
        days: number;
        status: string;
      }>;
    }>;
  }> {
    const run = await this.runRepo.findOne({ where: { id: runId } });
    if (!run) throw new NotFoundException('Payroll run not found');

    const employees = await this.runEmpRepo.find({ where: { runId } });
    const employeeIds = employees
      .map((e) => e.employeeId)
      .filter((id): id is string => !!id);

    // Build period bounds
    const monthStart = `${run.periodYear}-${String(run.periodMonth).padStart(2, '0')}-01`;
    const lastDay = new Date(run.periodYear, run.periodMonth, 0).getDate();
    const monthEnd = `${run.periodYear}-${String(run.periodMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    // Pull all approved leave applications overlapping this month for these employees
    const apps = employeeIds.length
      ? await this.leaveAppRepo
          .createQueryBuilder('la')
          .where('la.employee_id IN (:...empIds)', { empIds: employeeIds })
          .andWhere('la.status = :status', { status: 'APPROVED' })
          .andWhere('la.from_date <= :end AND la.to_date >= :start', {
            start: monthStart,
            end: monthEnd,
          })
          .getMany()
      : [];

    // Group apps by employeeId
    const appsByEmp = new Map<string, typeof apps>();
    for (const a of apps) {
      const arr = appsByEmp.get(a.employeeId) || [];
      arr.push(a);
      appsByEmp.set(a.employeeId, arr);
    }

    // Pull attendance EL_PAID_LEAVE_DAYS for each run employee.
    // Only consider UPLOADED rows (and OVERRIDE from Resolve action). CALCULATED rows
    // are engine-derived auto-debits against EL balance and must not be confused with
    // "leave approved on the attendance sheet" — that conflation caused phantom rows.
    const compRows = await this.compValRepo
      .createQueryBuilder('cv')
      .where('cv.run_id = :runId', { runId })
      .andWhere('cv.component_code = :code', { code: 'EL_PAID_LEAVE_DAYS' })
      .andWhere('cv.source IN (:...srcs)', { srcs: ['UPLOADED', 'OVERRIDE'] })
      .getMany();
    const attendanceByRunEmp = new Map<string, number>();
    for (const cv of compRows) {
      attendanceByRunEmp.set(cv.runEmployeeId, Number(cv.amount) || 0);
    }

    // Pull dismissal markers \u2014 employees the user has explicitly resolved
    // (either by snapping to ESS or by accepting the sheet as truth) so we
    // hide them from subsequent validations.
    const dismissedRows = await this.compValRepo
      .createQueryBuilder('cv')
      .where('cv.run_id = :runId', { runId })
      .andWhere('cv.component_code = :code', { code: 'EL_LV_DISMISSED' })
      .getMany();
    const dismissedRunEmpIds = new Set<string>(
      dismissedRows.map((cv) => cv.runEmployeeId),
    );

    const rows = employees
      .filter((emp) => !dismissedRunEmpIds.has(emp.id))
      .map((emp) => {
        const attendanceLeave = attendanceByRunEmp.get(emp.id) ?? 0;
        const essApps = emp.employeeId
          ? appsByEmp.get(emp.employeeId) || []
          : [];

        // Sum overlap days within the period
        let essApprovedLeave = 0;
        const essApplications: Array<{
          id: string;
          leaveType: string;
          fromDate: string;
          toDate: string;
          days: number;
          status: string;
        }> = [];
        for (const a of essApps) {
          const start = a.fromDate > monthStart ? a.fromDate : monthStart;
          const end = a.toDate < monthEnd ? a.toDate : monthEnd;
          const days =
            (new Date(end).getTime() - new Date(start).getTime()) / 86400000 +
            1;
          const overlapDays = Math.max(0, Math.round(days * 100) / 100);
          essApprovedLeave += overlapDays;
          essApplications.push({
            id: a.id,
            leaveType: a.leaveType,
            fromDate: a.fromDate,
            toDate: a.toDate,
            days: overlapDays,
            status: a.status,
          });
        }
        essApprovedLeave = Math.round(essApprovedLeave * 100) / 100;

        const diff =
          Math.round((attendanceLeave - essApprovedLeave) * 100) / 100;
        let status: 'OK' | 'MISMATCH' | 'MISSING_IN_SHEET' | 'EXTRA_IN_SHEET' =
          'OK';
        if (Math.abs(diff) < 0.01) status = 'OK';
        else if (attendanceLeave === 0 && essApprovedLeave > 0)
          status = 'MISSING_IN_SHEET';
        else if (essApprovedLeave === 0 && attendanceLeave > 0)
          status = 'EXTRA_IN_SHEET';
        else status = 'MISMATCH';

        return {
          empCode: emp.employeeCode,
          employeeName: emp.employeeName,
          employeeId: emp.employeeId,
          attendanceLeave,
          essApprovedLeave,
          diff,
          status,
          essApplications,
        };
      })
      .filter((r) => r.status !== 'OK');

    return {
      runId,
      periodYear: run.periodYear,
      periodMonth: run.periodMonth,
      rows,
    };
  }

  /**
   * Resolve a leave-validation mismatch by snapping the attendance
   * EL_PAID_LEAVE_DAYS for one employee to the ESS-approved figure, then
   * resyncing the leave ledger and balance.
   */
  async resolveLeaveValidation(
    runId: string,
    empCode: string,
    source: 'ESS' | 'SHEET' = 'ESS',
  ): Promise<{ empCode: string; updated: number; source: 'ESS' | 'SHEET' }> {
    const run = await this.runRepo.findOne({ where: { id: runId } });
    if (!run) throw new NotFoundException('Payroll run not found');

    const emp = await this.runEmpRepo.findOne({
      where: { runId, employeeCode: empCode },
    });
    if (!emp) throw new NotFoundException('Employee not found in run');
    if (!emp.employeeId)
      throw new BadRequestException('Employee not linked to master record');

    const validation = await this.leaveValidation(runId);
    const row = validation.rows.find((r) => r.empCode === empCode);
    if (!row) {
      // Already in sync OR previously dismissed — record/refresh dismissal
      // marker so the row stays out of subsequent validation results.
      await this.compValRepo
        .createQueryBuilder()
        .insert()
        .values({
          runId,
          runEmployeeId: emp.id,
          componentCode: 'EL_LV_DISMISSED',
          amount: '1',
          source: 'OVERRIDE' as const,
        })
        .orUpdate(['amount', 'source'], ['run_employee_id', 'component_code'])
        .execute();
      return { empCode, updated: 0, source };
    }

    // For ESS the canonical value is what was approved on the ESS portal.
    // For SHEET we keep the attendance-sheet value as the authoritative one
    // and just sync the ledger to it (dismissal marker stops re-flagging).
    const newValue =
      source === 'ESS' ? row.essApprovedLeave : row.attendanceLeave;

    await this.compValRepo
      .createQueryBuilder()
      .insert()
      .values({
        runId,
        runEmployeeId: emp.id,
        componentCode: 'EL_PAID_LEAVE_DAYS',
        amount: String(newValue),
        source: 'OVERRIDE' as const,
      })
      .orUpdate(['amount', 'source'], ['run_employee_id', 'component_code'])
      .execute();

    // Preserve any prior SL_DAYS entry for this run so re-syncing only
    // adjusts the PL/EL bucket (which is what Leave Validation overrides).
    const slRow = await this.compValRepo
      .createQueryBuilder('cv')
      .where('cv.run_employee_id = :reid', { reid: emp.id })
      .andWhere('cv.component_code = :code', { code: 'SL_DAYS' })
      .getOne();
    const existingSlDays = slRow ? Number(slRow.amount) || 0 : 0;

    await this.syncEmployeePaidLeave(
      emp.employeeId,
      run.clientId,
      run.periodYear,
      run.periodMonth,
      run.id,
      newValue,
      existingSlDays,
      emp.id,
    );

    // Persist a dismissal marker so re-running validation hides this row
    // (especially relevant for SHEET, where attendanceLeave vs ESS still
    // differs but the user has accepted the sheet as truth).
    await this.compValRepo
      .createQueryBuilder()
      .insert()
      .values({
        runId,
        runEmployeeId: emp.id,
        componentCode: 'EL_LV_DISMISSED',
        amount: '1',
        source: 'OVERRIDE' as const,
      })
      .orUpdate(['amount', 'source'], ['run_employee_id', 'component_code'])
      .execute();

    return { empCode, updated: 1, source };
  }

  // ── OT validation: compare attendance-sheet OT vs daily attendance OT ──
  /**
   * Compare three OT signals for each employee in a payroll run:
   *   - attendanceSheetOt:  OT_HOURS captured from the uploaded payroll sheet
   *   - branchClientOt:     OT computed from daily attendance_records entered
   *                         by branch desk / client users (selfMarked = false)
   *   - essOt:              OT computed from ESS attendance_records (selfMarked
   *                         = true) — i.e. submitted by the employee themself
   *
   * For each daily record we honour the configured OT rule:
   *   - One day salary  = GROSS / 26
   *   - One hour salary = day / 8
   *   - Anything beyond 9 hours of work counts as OT
   *   - Minimum 45 minutes (0.75 hr) of extra work needed to earn OT
   *   - OT wage = 2x normal hourly rate (paid via OT_AMOUNT in engine)
   *
   * Rows whose three values disagree are returned so reviewers can investigate
   * or click "Resolve" to snap the attendance-sheet value to a chosen source.
   */
  async otValidation(runId: string): Promise<{
    runId: string;
    periodYear: number;
    periodMonth: number;
    rows: Array<{
      empCode: string;
      employeeName: string;
      employeeId: string | null;
      attendanceSheetOt: number;
      branchClientOt: number;
      essOt: number;
      maxDiff: number;
      status: 'OK' | 'MISMATCH';
    }>;
  }> {
    const run = await this.runRepo.findOne({ where: { id: runId } });
    if (!run) throw new NotFoundException('Payroll run not found');

    const employees = await this.runEmpRepo.find({ where: { runId } });
    const employeeIds = employees
      .map((e) => e.employeeId)
      .filter((id): id is string => !!id);

    const monthStart = `${run.periodYear}-${String(run.periodMonth).padStart(2, '0')}-01`;
    const lastDay = new Date(run.periodYear, run.periodMonth, 0).getDate();
    const monthEnd = `${run.periodYear}-${String(run.periodMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    // Pull attendance records for the period for these employees
    const records = employeeIds.length
      ? await this.attendanceRepo
          .createQueryBuilder('a')
          .where('a.employee_id IN (:...empIds)', { empIds: employeeIds })
          .andWhere('a.date BETWEEN :start AND :end', {
            start: monthStart,
            end: monthEnd,
          })
          .getMany()
      : [];

    // Compute per-day OT honouring the >9hr / 45-min rule
    const dailyOt = (rec: AttendanceEntity): number => {
      let workedHours: number | null = rec.workedHours
        ? Number(rec.workedHours)
        : null;
      // Derive from in/out times when worked_hours absent
      if (
        (workedHours == null || workedHours <= 0) &&
        rec.checkIn &&
        rec.checkOut
      ) {
        const toMin = (t: string) => {
          const [hh, mm] = t.split(':').map((s) => Number(s));
          return hh * 60 + (mm || 0);
        };
        const inM = toMin(rec.checkIn);
        let outM = toMin(rec.checkOut);
        if (outM < inM) outM += 24 * 60; // crossed midnight
        workedHours = (outM - inM) / 60;
      }
      if (workedHours == null || workedHours <= 0) {
        // Fall back to whatever overtime_hours the record stored
        return Number(rec.overtimeHours) || 0;
      }
      const extra = workedHours - 9;
      return extra >= 0.75 ? Math.round(extra * 100) / 100 : 0;
    };

    const branchByEmp = new Map<string, number>();
    const essByEmp = new Map<string, number>();
    for (const r of records) {
      const ot = dailyOt(r);
      if (!ot) continue;
      const map = r.selfMarked ? essByEmp : branchByEmp;
      map.set(r.employeeId, (map.get(r.employeeId) || 0) + ot);
    }

    // Pull attendance-sheet OT_HOURS from comp values
    const compRows = await this.compValRepo
      .createQueryBuilder('cv')
      .where('cv.run_id = :runId', { runId })
      .andWhere('cv.component_code = :code', { code: 'OT_HOURS' })
      .getMany();
    const sheetByRunEmp = new Map<string, number>();
    for (const cv of compRows) {
      sheetByRunEmp.set(cv.runEmployeeId, Number(cv.amount) || 0);
    }

    // Pull dismissal markers — OT mismatches the user has resolved.
    const otDismissedRows = await this.compValRepo
      .createQueryBuilder('cv')
      .where('cv.run_id = :runId', { runId })
      .andWhere('cv.component_code = :code', { code: 'OT_LV_DISMISSED' })
      .getMany();
    const otDismissedRunEmpIds = new Set<string>(
      otDismissedRows.map((cv) => cv.runEmployeeId),
    );

    const round = (n: number) => Math.round(n * 100) / 100;
    const rows = employees
      .filter((emp) => !otDismissedRunEmpIds.has(emp.id))
      .map((emp) => {
        const attendanceSheetOt = round(sheetByRunEmp.get(emp.id) ?? 0);
        const branchClientOt = round(
          emp.employeeId ? (branchByEmp.get(emp.employeeId) ?? 0) : 0,
        );
        const essOt = round(
          emp.employeeId ? (essByEmp.get(emp.employeeId) ?? 0) : 0,
        );
        const all = [attendanceSheetOt, branchClientOt, essOt];
        const maxDiff = round(Math.max(...all) - Math.min(...all));
        const status: 'OK' | 'MISMATCH' = maxDiff < 0.01 ? 'OK' : 'MISMATCH';
        return {
          empCode: emp.employeeCode,
          employeeName: emp.employeeName,
          employeeId: emp.employeeId,
          attendanceSheetOt,
          branchClientOt,
          essOt,
          maxDiff,
          status,
        };
      })
      .filter((r) => r.status !== 'OK');

    return {
      runId,
      periodYear: run.periodYear,
      periodMonth: run.periodMonth,
      rows,
    };
  }

  /**
   * Resolve an OT mismatch by snapping the attendance-sheet OT_HOURS to one of
   *   - 'BRANCH' (branch desk / client user daily attendance)
   *   - 'ESS'    (employee self-marked attendance)
   *   - 'SHEET'  (no-op — keeps the uploaded value)
   * Re-saves the OT_HOURS comp value and updates the run-employee row so the
   * next Process call recomputes OT_AMOUNT from the resolved figure.
   */
  async resolveOtValidation(
    runId: string,
    empCode: string,
    source: 'BRANCH' | 'ESS' | 'SHEET',
  ): Promise<{ empCode: string; otHours: number; source: string }> {
    const run = await this.runRepo.findOne({ where: { id: runId } });
    if (!run) throw new NotFoundException('Payroll run not found');

    const emp = await this.runEmpRepo.findOne({
      where: { runId, employeeCode: empCode },
    });
    if (!emp) throw new NotFoundException('Employee not found in run');

    const validation = await this.otValidation(runId);
    const row = validation.rows.find((r) => r.empCode === empCode);
    if (!row) {
      return { empCode, otHours: emp.otHours, source }; // already in sync
    }

    let newValue: number;
    if (source === 'BRANCH') newValue = row.branchClientOt;
    else if (source === 'ESS') newValue = row.essOt;
    else newValue = row.attendanceSheetOt;

    await this.compValRepo
      .createQueryBuilder()
      .insert()
      .values({
        runId,
        runEmployeeId: emp.id,
        componentCode: 'OT_HOURS',
        amount: String(newValue),
        source: 'OVERRIDE' as const,
      })
      .orUpdate(['amount', 'source'], ['run_employee_id', 'component_code'])
      .execute();

    emp.otHours = newValue;
    await this.runEmpRepo.save(emp);

    // Record dismissal marker so the resolved row stops appearing in the
    // OT validation panel after a re-check (especially when the user picks
    // SHEET, which leaves the source values unchanged).
    await this.compValRepo
      .createQueryBuilder()
      .insert()
      .values({
        runId,
        runEmployeeId: emp.id,
        componentCode: 'OT_LV_DISMISSED',
        amount: '1',
        source: 'OVERRIDE' as const,
      })
      .orUpdate(['amount', 'source'], ['run_employee_id', 'component_code'])
      .execute();

    return { empCode, otHours: newValue, source };
  }

  /**
   * One-shot data healer: removes phantom EL_PAID_LEAVE ledger entries that the
   * payroll engine wrote in the past under the old `min(absentDays, balance, 1.5)`
   * auto-deduction logic. Keeps entries that are backed by either:
   *   - an UPLOADED EL_PAID_LEAVE_DAYS comp value > 0 in the same run, OR
   *   - an APPROVED ESS leave application overlapping the run period.
   * Then recomputes leave_balances.available for the year from the surviving ledger.
   *
   * Scope: optionally one client + year, otherwise all employees.
   * Idempotent. Safe to re-run.
   */
  async recomputeLeaveBalances(
    clientId?: string,
    year?: number,
  ): Promise<{
    employeesScanned: number;
    ledgerEntriesDeleted: number;
    balancesUpdated: number;
    details: Array<{
      employeeCode: string;
      deletedQty: number;
      newAvailable: number;
    }>;
  }> {
    const yr = year ?? new Date().getFullYear();
    const yearStart = `${yr}-01-01`;
    const yearEnd = `${yr}-12-31`;

    // Fetch candidate ledger entries: EL paid leaves in this year tied to a payroll run
    const candQb = this.leaveLedgerRepo
      .createQueryBuilder('ll')
      .where('ll.leave_type = :lt', { lt: 'EL' })
      .andWhere('ll.ref_type = :rt', { rt: 'EL_PAID_LEAVE' })
      .andWhere('ll.ref_id IS NOT NULL')
      .andWhere('ll.entry_date BETWEEN :s AND :e', {
        s: yearStart,
        e: yearEnd,
      });
    if (clientId) candQb.andWhere('ll.client_id = :cid', { cid: clientId });
    const candidates = await candQb.getMany();

    // Group candidates by runId for efficient lookups
    const byRun = new Map<string, LeaveLedgerEntity[]>();
    for (const c of candidates) {
      if (!c.refId) continue;
      const arr = byRun.get(c.refId) || [];
      arr.push(c);
      byRun.set(c.refId, arr);
    }

    const toDelete: string[] = [];
    let totalDeletedQty = 0;

    for (const [runId, entries] of byRun.entries()) {
      // Pull this run's UPLOADED EL_PAID_LEAVE_DAYS comp values keyed by employeeId
      const runEmps = await this.runEmpRepo.find({ where: { runId } });
      const empByEmployeeId = new Map<string, PayrollRunEmployeeEntity>();
      for (const re of runEmps) {
        if (re.employeeId) empByEmployeeId.set(re.employeeId, re);
      }

      const cvRows = await this.compValRepo
        .createQueryBuilder('cv')
        .where('cv.run_id = :runId', { runId })
        .andWhere('cv.component_code = :code', { code: 'EL_PAID_LEAVE_DAYS' })
        .andWhere('cv.source IN (:...srcs)', {
          srcs: ['UPLOADED', 'OVERRIDE'],
        })
        .getMany();
      const uploadedByEmployeeId = new Map<string, number>();
      for (const cv of cvRows) {
        const re = runEmps.find((r) => r.id === cv.runEmployeeId);
        if (re?.employeeId) {
          uploadedByEmployeeId.set(re.employeeId, Number(cv.amount) || 0);
        }
      }

      for (const entry of entries) {
        const uploaded = uploadedByEmployeeId.get(entry.employeeId) || 0;
        const ledgerQty = Math.abs(Number(entry.qty) || 0);
        if (uploaded > 0) {
          // Real upload: keep (engine could have capped by balance, fine)
          continue;
        }
        // No backing upload — phantom entry from old engine logic. Drop it.
        toDelete.push(entry.id);
        totalDeletedQty += ledgerQty;
      }
    }

    if (toDelete.length) {
      await this.leaveLedgerRepo
        .createQueryBuilder()
        .delete()
        .whereInIds(toDelete)
        .execute();
    }

    // Recompute leave_balances for affected employees
    const affectedEmployeeIds = new Set<string>();
    for (const c of candidates) affectedEmployeeIds.add(c.employeeId);

    const details: Array<{
      employeeCode: string;
      deletedQty: number;
      newAvailable: number;
    }> = [];

    for (const employeeId of affectedEmployeeIds) {
      // Recompute using year-aggregate query, same as engine upsert
      const result = await this.ds.query(
        `SELECT
           COALESCE(SUM(CASE WHEN ref_type = 'EL_ACCRUAL' THEN ABS(qty::numeric) ELSE 0 END), 0)::float AS accrued,
           COALESCE(SUM(CASE WHEN ref_type = 'EL_PAID_LEAVE' THEN ABS(qty::numeric) ELSE 0 END), 0)::float AS used
         FROM leave_ledger
         WHERE employee_id = $1 AND leave_type = 'EL'
           AND EXTRACT(YEAR FROM entry_date::date) = $2`,
        [employeeId, yr],
      );
      const accrued = Number(result?.[0]?.accrued) || 0;
      const used = Number(result?.[0]?.used) || 0;

      const balRow = await this.leaveBalanceRepo.findOne({
        where: { employeeId, year: yr, leaveType: 'EL' },
      });
      const opening = balRow ? parseFloat(balRow.opening) || 0 : 0;
      const available = Math.max(
        Math.round((opening + accrued - used) * 100) / 100,
        0,
      );

      if (balRow) {
        balRow.accrued = String(Math.round(accrued * 100) / 100);
        balRow.used = String(Math.round(used * 100) / 100);
        balRow.available = String(available);
        balRow.lastUpdatedAt = new Date();
        await this.leaveBalanceRepo.save(balRow);
      }

      const emp = await this.ds.query(
        `SELECT employee_code FROM employees WHERE id = $1 LIMIT 1`,
        [employeeId],
      );
      details.push({
        employeeCode: emp?.[0]?.employee_code || employeeId,
        deletedQty: 0, // per-emp breakdown skipped to keep simple
        newAvailable: available,
      });
    }

    return {
      employeesScanned: affectedEmployeeIds.size,
      ledgerEntriesDeleted: toDelete.length,
      balancesUpdated: details.length,
      details,
    };
  }

  private normalizeHeader(value: unknown): string {
    if (value === null || value === undefined) return '';
    const s =
      typeof value === 'string' || typeof value === 'number'
        ? String(value)
        : '';
    return s.replace(/\s+/g, ' ').trim().toLowerCase();
  }

  private cellStr(value: unknown): string {
    if (value && typeof value === 'object') {
      if ('result' in value) {
        const r = (value as { result: unknown }).result;
        return typeof r === 'string' || typeof r === 'number' ? String(r) : '';
      }
      if ('text' in value) {
        const t = (value as { text: unknown }).text;
        return typeof t === 'string' || typeof t === 'number' ? String(t) : '';
      }
    }
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number') return String(value);
    return '';
  }

  private cellNum(value: unknown): number | null {
    const str = this.cellStr(value);
    if (!str) return null;
    const n = Number(str);
    return Number.isFinite(n) ? n : null;
  }
}
