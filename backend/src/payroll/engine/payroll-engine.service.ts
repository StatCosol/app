import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { PayrollRunEntity } from '../entities/payroll-run.entity';
import { PayrollRunEmployeeEntity } from '../entities/payroll-run-employee.entity';
import { PayrollRunItemEntity } from '../entities/payroll-run-item.entity';
import { PayrollRunComponentValueEntity } from '../entities/payroll-run-component-value.entity';
import { PayrollComponentEntity } from '../entities/payroll-component.entity';
import { PayrollClientSetupEntity } from '../entities/payroll-client-setup.entity';
import { PayCalcTraceEntity } from '../entities/pay-calc-trace.entity';
import { PaySalaryStructureItemEntity } from '../entities/pay-salary-structure-item.entity';
import { EmployeeEntity } from '../../employees/entities/employee.entity';

import { StructureResolverService } from './structure-resolver.service';
import { RulesetResolverService } from './ruleset-resolver.service';
import { RoundingService } from './rounding.service';
import { WageBaseService } from './wage-base.service';
import { evaluateFormula, FormulaError } from './expression';

import { StatutoryCalculatorService } from '../services/statutory-calculator.service';
import { StateStatutoryService } from '../services/state-statutory.service';
import { AttendanceService } from '../../attendance/attendance.service';
import { LeaveLedgerEntity } from '../../ess/entities/leave-ledger.entity';
import { LeaveBalanceEntity } from '../../ess/entities/leave-balance.entity';

interface SlabEntry {
  from: number;
  to: number;
  amount?: number;
  percent?: number;
}

interface SlabRef {
  slabs: SlabEntry[];
}

interface BalancingConfig {
  grossSource?: string;
}

export interface ProcessResult {
  processed: number;
  status: string;
  errors: string[];
}

@Injectable()
export class PayrollEngineService {
  private readonly logger = new Logger(PayrollEngineService.name);

  constructor(
    @InjectRepository(PayrollRunEntity)
    private readonly runRepo: Repository<PayrollRunEntity>,
    @InjectRepository(PayrollRunEmployeeEntity)
    private readonly runEmpRepo: Repository<PayrollRunEmployeeEntity>,
    @InjectRepository(PayrollRunItemEntity)
    private readonly _runItemRepo: Repository<PayrollRunItemEntity>,
    @InjectRepository(PayrollRunComponentValueEntity)
    private readonly compValRepo: Repository<PayrollRunComponentValueEntity>,
    @InjectRepository(PayrollComponentEntity)
    private readonly compRepo: Repository<PayrollComponentEntity>,
    @InjectRepository(PayrollClientSetupEntity)
    private readonly setupRepo: Repository<PayrollClientSetupEntity>,
    @InjectRepository(PayCalcTraceEntity)
    private readonly _traceRepo: Repository<PayCalcTraceEntity>,
    @InjectRepository(EmployeeEntity)
    private readonly empRepo: Repository<EmployeeEntity>,
    private readonly ds: DataSource,
    private readonly structureResolver: StructureResolverService,
    private readonly rulesetResolver: RulesetResolverService,
    private readonly statutory: StatutoryCalculatorService,
    private readonly stateStat: StateStatutoryService,
    private readonly rounding: RoundingService,
    private readonly wageBase: WageBaseService,
    private readonly attendanceService: AttendanceService,
    @InjectRepository(LeaveLedgerEntity)
    private readonly _leaveLedgerRepo: Repository<LeaveLedgerEntity>,
    @InjectRepository(LeaveBalanceEntity)
    private readonly leaveBalanceRepo: Repository<LeaveBalanceEntity>,
  ) {}

  async processWithEngine(runId: string): Promise<ProcessResult> {
    const run = await this.runRepo.findOne({ where: { id: runId } });
    if (!run) {
      throw new BadRequestException(`Payroll run ${runId} not found`);
    }
    if (run.status === 'APPROVED') {
      throw new ConflictException(
        `Run ${runId} is already APPROVED. Cannot re-process.`,
      );
    }

    const setup = await this.setupRepo.findOne({
      where: { clientId: run.clientId },
    });
    if (!setup) {
      throw new BadRequestException(
        `Payroll setup not found for client ${run.clientId}`,
      );
    }

    const components = await this.compRepo.find({
      where: { clientId: run.clientId, isActive: true },
      order: { displayOrder: 'ASC' },
    });
    if (!components.length) {
      throw new BadRequestException(
        `No payroll components configured for client ${run.clientId}`,
      );
    }

    const runEmployees = await this.runEmpRepo.find({
      where: { runId: run.id },
    });

    const asOfDate = `${run.periodYear}-${String(run.periodMonth).padStart(2, '0')}-01`;

    // ── Fetch attendance summaries (LOP/working days) ────────────────────────
    const attendanceMap = new Map<
      string,
      {
        totalDays: number;
        effectivePresent: number;
        lopDays: number;
        holidays: number;
        weekOffs: number;
        daysOnLeave: number;
      }
    >();
    try {
      const summaries = await this.attendanceService.getMonthlySummary({
        clientId: run.clientId,
        year: run.periodYear,
        month: run.periodMonth,
        approvedOnly: true,
      });
      for (const s of summaries) {
        if (s.employeeCode) {
          attendanceMap.set(s.employeeCode, s);
        }
      }
      this.logger.log(`Attendance loaded for ${attendanceMap.size} employees`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Attendance fetch skipped: ${msg}`);
    }

    const errors: string[] = [];
    let processed = 0;

    for (const emp of runEmployees) {
      try {
        const att = attendanceMap.get(emp.employeeCode);
        await this.processEmployee(
          run,
          emp,
          setup,
          components,
          asOfDate,
          errors,
          att,
        );
        processed++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const label = emp.employeeName || emp.employeeCode || emp.id;
        errors.push(`Employee ${label}: ${msg}`);
        this.logger.error(`Error processing employee ${label}`, msg);
      }
    }

    run.status = 'PROCESSED' as PayrollRunEntity['status'];
    await this.runRepo.save(run);

    return { processed, status: 'PROCESSED', errors };
  }

  /**
   * Process specific employees in an existing run without changing run status.
   * Used for late-adding employees to an already-approved run.
   */
  async processSpecificEmployees(
    runId: string,
    employeeCodes: string[],
  ): Promise<ProcessResult> {
    const run = await this.runRepo.findOne({ where: { id: runId } });
    if (!run) throw new BadRequestException(`Payroll run ${runId} not found`);

    const setup = await this.setupRepo.findOne({
      where: { clientId: run.clientId },
    });
    if (!setup) {
      throw new BadRequestException(
        `Payroll setup not found for client ${run.clientId}`,
      );
    }

    const components = await this.compRepo.find({
      where: { clientId: run.clientId, isActive: true },
      order: { displayOrder: 'ASC' },
    });
    if (!components.length) {
      throw new BadRequestException(
        `No payroll components configured for client ${run.clientId}`,
      );
    }

    const runEmployees = await this.runEmpRepo.find({ where: { runId } });
    const targets = runEmployees.filter((e) =>
      employeeCodes.includes(e.employeeCode),
    );

    const asOfDate = `${run.periodYear}-${String(run.periodMonth).padStart(2, '0')}-01`;

    const attendanceMap = new Map<
      string,
      {
        totalDays: number;
        effectivePresent: number;
        lopDays: number;
        holidays: number;
        weekOffs: number;
        daysOnLeave: number;
      }
    >();
    try {
      const summaries = await this.attendanceService.getMonthlySummary({
        clientId: run.clientId,
        year: run.periodYear,
        month: run.periodMonth,
        approvedOnly: true,
      });
      for (const s of summaries) {
        if (s.employeeCode) attendanceMap.set(s.employeeCode, s);
      }
    } catch {
      this.logger.warn('Attendance fetch skipped for specific employees');
    }

    const errors: string[] = [];
    let processed = 0;

    for (const emp of targets) {
      try {
        const att = attendanceMap.get(emp.employeeCode);
        await this.processEmployee(
          run,
          emp,
          setup,
          components,
          asOfDate,
          errors,
          att,
        );
        processed++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Employee ${emp.employeeName || emp.employeeCode}: ${msg}`);
      }
    }

    // Do NOT change run status
    return { processed, status: run.status, errors };
  }

  async previewEmployee(params: {
    clientId: string;
    employeeId?: string | null;
    branchId?: string | null;
    grossAmount: number;
    asOfDate: string;
  }): Promise<Record<string, number>> {
    const { clientId, employeeId, branchId, grossAmount, asOfDate } = params;

    const setup = await this.setupRepo.findOne({ where: { clientId } });
    if (!setup) {
      // No setup configured — return a minimal preview with just gross = net
      return {
        ACTUAL_GROSS: grossAmount,
        GROSS: grossAmount,
        NET_PAY: grossAmount,
      };
    }

    const components = await this.compRepo.find({
      where: { clientId, isActive: true },
      order: { displayOrder: 'ASC' },
    });
    if (!components.length) {
      // No components configured — return gross = net
      return {
        ACTUAL_GROSS: grossAmount,
        GROSS: grossAmount,
        NET_PAY: grossAmount,
      };
    }

    const values: Record<string, number> = { ACTUAL_GROSS: grossAmount };

    // Look up employee for structure scoping and state code
    let departmentId: string | null = null;
    let gradeId: string | null = null;
    let employeeStateCode = '';
    if (employeeId) {
      const employee = await this.empRepo.findOne({
        where: { id: employeeId },
      });
      if (employee) {
        departmentId = employee.departmentId ?? null;
        gradeId = employee.gradeId ?? null;
        employeeStateCode = employee.stateCode ?? '';
      }
    }

    const resolved = await this.structureResolver.resolve({
      clientId,
      employeeId: employeeId ?? null,
      branchId: branchId ?? null,
      departmentId,
      gradeId,
      asOfDate,
    });

    if (!resolved) {
      // Minimal preview without structure — just statutory
      values['GROSS'] = grossAmount;
      const statResult = this.statutory.compute({ values, setup, components });
      Object.assign(values, statResult.values);
      return values;
    }

    const { structure, items } = resolved;

    let paramMap = new Map<string, number>();
    const ruleSetResult = structure.ruleSetId
      ? await this.rulesetResolver.resolveAndLoad({
          clientId,
          branchId: branchId ?? null,
          asOfDate,
        })
      : await this.rulesetResolver.resolveAndLoad({
          clientId,
          branchId: branchId ?? null,
          asOfDate,
        });

    if (ruleSetResult) {
      paramMap = ruleSetResult.params;
    }

    const componentMap = this.buildComponentMap(components);

    this.calculateItems(items, values, componentMap, paramMap, components);

    // Compute wage bases and store
    const { pfWage, esiWage, gross } = this.wageBase.computeWageBases({
      values,
      components,
    });
    values['PF_WAGE'] = pfWage;
    values['ESI_WAGE'] = esiWage;
    values['GROSS'] = gross;

    // Statutory deductions
    const statResult = this.statutory.compute({ values, setup, components });
    Object.assign(values, statResult.values);

    // State statutory (PT/LWF)
    const stateCode = employeeStateCode;

    if (stateCode) {
      const stateDeductions = await this.stateStat.applyStateDeductions({
        clientId,
        stateCode,
        values,
        ptEnabled: setup.ptEnabled,
        lwfEnabled: setup.lwfEnabled,
      });
      Object.assign(values, stateDeductions);
    }

    // Net pay
    values['NET_PAY'] = this.computeNetPay(values, components);

    return values;
  }

  // ─── Private helpers ───────────────────────────────────────────────

  private async processEmployee(
    run: PayrollRunEntity,
    emp: PayrollRunEmployeeEntity,
    setup: PayrollClientSetupEntity,
    components: PayrollComponentEntity[],
    asOfDate: string,
    errors: string[],
    attendance?: {
      totalDays: number;
      effectivePresent: number;
      lopDays: number;
      holidays: number;
      weekOffs: number;
      daysOnLeave: number;
    },
  ): Promise<void> {
    const qr = this.ds.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      // Load uploaded values
      const uploadedRows = await this.compValRepo.find({
        where: {
          runId: run.id,
          runEmployeeId: emp.id,
          source: 'UPLOADED' as PayrollRunComponentValueEntity['source'],
        },
      });

      const values: Record<string, number> = {};
      for (const row of uploadedRows) {
        values[row.componentCode] = Number(row.amount) || 0;
      }

      // ── Seed attendance data (uploaded values take precedence) ──────────
      const daysInMonth = new Date(
        run.periodYear,
        run.periodMonth,
        0,
      ).getDate();
      const attendanceUploaded = emp.totalDays > 0; // means Excel was uploaded before processing

      if (attendanceUploaded) {
        // Attendance was uploaded via Excel – keep entity fields as-is
        // Only fill in component values if not already uploaded
        if (values['LOP_DAYS'] === undefined) {
          values['LOP_DAYS'] = emp.lopDays;
        }
        if (values['NCP_DAYS'] === undefined) {
          values['NCP_DAYS'] = emp.ncpDays;
        }
        if (values['OT_HOURS'] === undefined) {
          values['OT_HOURS'] = emp.otHours;
        }
      } else if (attendance) {
        if (values['LOP_DAYS'] === undefined) {
          values['LOP_DAYS'] = attendance.lopDays;
        }
        if (values['NCP_DAYS'] === undefined) {
          values['NCP_DAYS'] = attendance.lopDays; // NCP = LOP for govt returns
        }
        if (values['OT_HOURS'] === undefined) {
          values['OT_HOURS'] = (attendance as any).totalOvertimeHours ?? 0;
        }
        emp.totalDays = attendance.totalDays;
        emp.daysPresent = attendance.effectivePresent;
        emp.lopDays = values['LOP_DAYS'];
        emp.ncpDays = values['NCP_DAYS'];
        emp.otHours = values['OT_HOURS'];
      } else {
        // No attendance data — use uploaded or default to 0
        emp.totalDays = daysInMonth;
        emp.daysPresent = daysInMonth - (values['LOP_DAYS'] ?? 0);
        emp.lopDays = values['LOP_DAYS'] ?? 0;
        emp.ncpDays = values['NCP_DAYS'] ?? 0;
      }

      // Look up employee's departmentId and gradeId for structure scoping
      let departmentId: string | null = null;
      let gradeId: string | null = null;
      let empPfApplicable: boolean | undefined;
      let empEsiApplicable: boolean | undefined;
      let empPfServiceStartDate: string | null = null;
      let empBasicAtPfStart: number | null = null;
      if (emp.employeeId) {
        const masterEmp = await this.empRepo.findOne({
          where: { id: emp.employeeId },
        });
        if (masterEmp) {
          departmentId = masterEmp.departmentId ?? null;
          gradeId = masterEmp.gradeId ?? null;
          empPfApplicable = masterEmp.pfApplicable;
          empEsiApplicable = masterEmp.esiApplicable;
          empPfServiceStartDate = masterEmp.pfServiceStartDate ?? null;
          empBasicAtPfStart = masterEmp.basicAtPfStart
            ? Number(masterEmp.basicAtPfStart)
            : null;

          // Fallback: seed ACTUAL_GROSS from employee monthlyGross or CTC/12
          if (
            values['ACTUAL_GROSS'] === undefined ||
            values['ACTUAL_GROSS'] === 0
          ) {
            const mg = Number(masterEmp.monthlyGross) || 0;
            const ctcMonthly = Number(masterEmp.ctc)
              ? Number(masterEmp.ctc) / 12
              : 0;
            const fallbackGross = mg || ctcMonthly;
            if (fallbackGross > 0) {
              values['ACTUAL_GROSS'] = Math.round(fallbackGross);
            }
          }
        }
      }

      // ── Seed WORKED_DAYS / PAYABLE_DAYS for formula use ──────────────
      const WORKING_DAYS_IN_MONTH = 26;
      if (values['WORKED_DAYS'] === undefined) {
        values['WORKED_DAYS'] = emp.daysPresent || WORKING_DAYS_IN_MONTH;
      }

      // ── Holidays from attendance records ──────────────────────────
      const holidayDays = attendance?.holidays ?? 0;
      values['HOLIDAYS'] = holidayDays;
      values['WEEK_OFFS'] = attendance?.weekOffs ?? 0;

      // ── Earned Leave (EL) calculation ─────────────────────────────
      // Skip EL for employees who joined in the same month as the payroll run
      const workedDays =
        values['WORKED_DAYS'] ?? (emp.daysPresent || WORKING_DAYS_IN_MONTH);
      let skipEL = false;
      if (emp.employeeId) {
        const masterEmpForEL = await this.empRepo.findOne({
          where: { id: emp.employeeId },
        });
        if (masterEmpForEL?.dateOfJoining) {
          const doj = new Date(masterEmpForEL.dateOfJoining);
          if (
            doj.getFullYear() === run.periodYear &&
            doj.getMonth() + 1 === run.periodMonth
          ) {
            skipEL = true;
          }
        }
      }

      const elAccrued = skipEL ? 0 : Math.round((workedDays / 20) * 100) / 100; // 1/20 * worked days
      values['EL_ACCRUED'] = elAccrued;

      let paidLeaveDays = 0;
      let elBalanceBefore = 0;
      let elBalanceAfter = 0;

      if (emp.employeeId) {
        // Look up current EL balance
        const elBalance = await this.leaveBalanceRepo.findOne({
          where: {
            employeeId: emp.employeeId,
            year: run.periodYear,
            leaveType: 'EL',
          },
        });
        elBalanceBefore = elBalance ? parseFloat(elBalance.available) || 0 : 0;

        // Calculate absent days = total month days (26) minus worked days
        const absentDays = Math.max(0, WORKING_DAYS_IN_MONTH - workedDays);

        // Paid leave = min(absent days, available balance, 1.5)
        if (absentDays > 0 && elBalanceBefore > 0) {
          paidLeaveDays = Math.min(absentDays, elBalanceBefore, 1.5);
          paidLeaveDays = Math.round(paidLeaveDays * 100) / 100;
        }

        // New balance = old balance - paid leave + accrued this month
        elBalanceAfter =
          Math.round((elBalanceBefore - paidLeaveDays + elAccrued) * 100) / 100;

        // ── Write ledger entries & update balance (inside the transaction) ──
        const monthStr = `${run.periodYear}-${String(run.periodMonth).padStart(2, '0')}`;
        const entryDate = `${monthStr}-01`;

        // Delete any existing EL entries for this month (idempotent re-processing)
        await qr.manager
          .createQueryBuilder()
          .delete()
          .from(LeaveLedgerEntity)
          .where('employee_id = :empId', { empId: emp.employeeId })
          .andWhere('leave_type = :lt', { lt: 'EL' })
          .andWhere('remarks LIKE :m', { m: `%${monthStr}%` })
          .execute();

        // Ledger entry: EL accrual (credit)
        if (elAccrued > 0) {
          const accrualEntry = qr.manager.create(LeaveLedgerEntity, {
            employeeId: emp.employeeId,
            clientId: run.clientId,
            leaveType: 'EL',
            entryDate,
            qty: String(elAccrued),
            refType: 'EL_ACCRUAL',
            refId: run.id,
            remarks: `EL accrual for ${monthStr}: ${elAccrued} days`,
          });
          await qr.manager.save(LeaveLedgerEntity, accrualEntry);
        }

        // Ledger entry: EL paid leave (debit, negative qty)
        if (paidLeaveDays > 0) {
          const paidEntry = qr.manager.create(LeaveLedgerEntity, {
            employeeId: emp.employeeId,
            clientId: run.clientId,
            leaveType: 'EL',
            entryDate,
            qty: String(-paidLeaveDays),
            refType: 'EL_PAID_LEAVE',
            refId: run.id,
            remarks: `EL paid leave for ${monthStr}: ${paidLeaveDays} days`,
          });
          await qr.manager.save(LeaveLedgerEntity, paidEntry);
        }

        // Update leave_balances (upsert)
        // For insert: set accrued=elAccrued, used=paidLeaveDays, available=elAccrued-paidLeaveDays
        // For update: recalculate from all ledger entries for this year
        await qr.manager.query(
          `INSERT INTO leave_balances (id, employee_id, client_id, year, leave_type, opening, accrued, used, lapsed, available, created_at)
           VALUES (gen_random_uuid(), $1, $2, $3, 'EL', 0, $4, $5, 0, $6, NOW())
           ON CONFLICT (employee_id, year, leave_type)
           DO UPDATE SET accrued   = COALESCE((
                           SELECT SUM(ABS(qty)) FROM leave_ledger
                           WHERE employee_id = $1 AND leave_type = 'EL' AND ref_type = 'EL_ACCRUAL'
                             AND EXTRACT(YEAR FROM entry_date::date) = $3
                         ), 0),
                         used      = COALESCE((
                           SELECT SUM(ABS(qty)) FROM leave_ledger
                           WHERE employee_id = $1 AND leave_type = 'EL' AND ref_type = 'EL_PAID_LEAVE'
                             AND EXTRACT(YEAR FROM entry_date::date) = $3
                         ), 0),
                         available = leave_balances.opening
                           + COALESCE((
                               SELECT SUM(ABS(qty)) FROM leave_ledger
                               WHERE employee_id = $1 AND leave_type = 'EL' AND ref_type = 'EL_ACCRUAL'
                                 AND EXTRACT(YEAR FROM entry_date::date) = $3
                             ), 0)
                           - COALESCE((
                               SELECT SUM(ABS(qty)) FROM leave_ledger
                               WHERE employee_id = $1 AND leave_type = 'EL' AND ref_type = 'EL_PAID_LEAVE'
                                 AND EXTRACT(YEAR FROM entry_date::date) = $3
                             ), 0),
                         last_updated_at = NOW()`,
          [
            emp.employeeId,
            run.clientId,
            run.periodYear,
            elAccrued,
            paidLeaveDays,
            elAccrued - paidLeaveDays,
          ],
        );

        // Re-read updated balance for component value
        const updatedBal = await qr.manager.findOne(LeaveBalanceEntity, {
          where: {
            employeeId: emp.employeeId,
            year: run.periodYear,
            leaveType: 'EL',
          },
        });
        elBalanceAfter = updatedBal
          ? parseFloat(updatedBal.available) || 0
          : elBalanceAfter;
      }

      values['EL_PAID_LEAVE_DAYS'] = paidLeaveDays;
      values['EL_BALANCE'] = elBalanceAfter;

      if (values['PAYABLE_DAYS'] === undefined) {
        // Payable = worked days + holidays + paid leave from EL balance
        values['PAYABLE_DAYS'] = workedDays + holidayDays + paidLeaveDays;
      }

      const resolved = await this.structureResolver.resolve({
        clientId: run.clientId,
        employeeId: emp.employeeId ?? null,
        branchId: emp.branchId ?? null,
        departmentId,
        gradeId,
        asOfDate,
      });

      let structureId: string | null = null;
      let ruleSetId: string | null = null;

      if (resolved) {
        const { structure, items } = resolved;
        structureId = structure.id;

        // Resolve rule set
        let paramMap = new Map<string, number>();
        if (structure.ruleSetId) {
          const ruleParams = await this.rulesetResolver.loadParameters(
            structure.ruleSetId,
          );
          ruleSetId = structure.ruleSetId;
          paramMap = ruleParams;
        } else {
          const ruleSetResult = await this.rulesetResolver.resolveAndLoad({
            clientId: run.clientId,
            branchId: emp.branchId ?? null,
            asOfDate,
          });
          if (ruleSetResult) {
            ruleSetId = ruleSetResult.ruleSet.id;
            paramMap = ruleSetResult.params;
          }
        }

        const componentMap = this.buildComponentMap(components);

        // Calculate each structure item
        const empErrors = this.calculateItems(
          items,
          values,
          componentMap,
          paramMap,
          components,
        );
        const label = emp.employeeName || emp.employeeCode || emp.id;
        for (const e of empErrors) {
          errors.push(`Employee ${label}: ${e}`);
        }
      }

      // ── Pro-rata: multiply earned salary components by payableDays / 26 ──
      const payableDays = values['PAYABLE_DAYS'] ?? WORKING_DAYS_IN_MONTH;
      const proRataFactor = payableDays / WORKING_DAYS_IN_MONTH;
      const NON_PRORATA_CODES = new Set([
        'ATT_BONUS',
        'OTHER_EARNINGS',
        'ARREAR_ATT_BONUS',
        'OTHER_DEDUCTIONS',
        'ACTUAL_GROSS',
      ]);
      for (const comp of components) {
        if (
          comp.componentType === 'EARNING' &&
          !NON_PRORATA_CODES.has(comp.code) &&
          values[comp.code] !== undefined
        ) {
          values[comp.code] = values[comp.code] * proRataFactor;
        }
      }

      // Compute wage bases
      const { pfWage, esiWage, gross } = this.wageBase.computeWageBases({
        values,
        components,
      });
      values['PF_WAGE'] = pfWage;
      values['ESI_WAGE'] = esiWage;
      values['GROSS'] = gross;

      // Statutory deductions (PF/ESI)
      const statResult = this.statutory.compute({
        values,
        setup,
        components,
        pfApplicable: empPfApplicable,
        esiApplicable: empEsiApplicable,
        pfServiceStartDate: empPfServiceStartDate,
        basicAtPfStart: empBasicAtPfStart,
      });
      Object.assign(values, statResult.values);

      // State-based deductions (PT/LWF)
      const stateCode = emp.stateCode ?? '';
      if (stateCode) {
        const stateDeductions = await this.stateStat.applyStateDeductions({
          clientId: run.clientId,
          stateCode,
          values,
          ptEnabled: setup.ptEnabled,
          lwfEnabled: setup.lwfEnabled,
        });
        Object.assign(values, stateDeductions);
      }

      // Compute net pay
      values['NET_PAY'] = this.computeNetPay(values, components);

      // Persist component values (upsert)
      await this.persistComponentValues(qr, run.id, emp.id, values);

      // Update employee totals
      const totalDeductions = this.sumDeductions(values, components);
      const employerCost = this.sumEmployerCost(values, components);

      emp.grossEarnings = String(values['GROSS'] ?? 0);
      emp.totalDeductions = String(totalDeductions);
      emp.employerCost = String(employerCost);
      emp.netPay = String(values['NET_PAY'] ?? 0);
      await qr.manager.save(PayrollRunEmployeeEntity, emp);

      // Save calc trace (delete stale trace first for re-processing)
      await qr.manager.delete(PayCalcTraceEntity, {
        runId: run.id,
        employeeId: emp.employeeId ?? emp.id,
      });
      const trace = qr.manager.create(PayCalcTraceEntity, {
        runId: run.id,
        employeeId: emp.employeeId ?? emp.id,
        structureId: structureId ?? undefined,
        ruleSetId: ruleSetId ?? undefined,
        trace: values,
      });
      await qr.manager.save(PayCalcTraceEntity, trace);

      await qr.commitTransaction();
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  private calculateItems(
    items: PaySalaryStructureItemEntity[],
    values: Record<string, number>,
    componentMap: Map<string, PayrollComponentEntity>,
    paramMap: Map<string, number>,
    allComponents: PayrollComponentEntity[],
  ): string[] {
    const errors: string[] = [];

    for (const item of items) {
      const comp = componentMap.get(item.componentId);
      if (!comp) {
        continue;
      }

      // If already uploaded, keep existing value
      if (values[comp.code] !== undefined) {
        continue;
      }

      let amount = 0;

      try {
        switch (item.calcMethod) {
          case 'FIXED':
            amount = item.fixedAmount ?? 0;
            break;

          case 'PERCENT':
            amount = this.calcPercent(item, values);
            break;

          case 'FORMULA':
            amount = this.calcFormula(item, values, paramMap, allComponents);
            break;

          case 'SLAB':
            amount = this.calcSlab(item, values);
            break;

          case 'BALANCING':
            amount = this.calcBalancing(item, values, allComponents);
            break;

          default:
            amount = 0;
        }
      } catch (err) {
        if (err instanceof FormulaError) {
          errors.push(`Formula error for ${comp.code}: ${err.message}`);
        } else {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push(`Calc error for ${comp.code}: ${msg}`);
        }
        amount = 0;
      }

      amount = this.rounding.applyMinMax(
        amount,
        item.minAmount ?? null,
        item.maxAmount ?? null,
      );
      amount = this.rounding.applyRounding(
        amount,
        item.roundingMode ?? 'NEAREST_RUPEE',
      );

      values[comp.code] = amount;
    }

    return errors;
  }

  private calcPercent(
    item: PaySalaryStructureItemEntity,
    values: Record<string, number>,
  ): number {
    const baseKey = item.percentageBase ?? 'BASIC';
    const base = values[baseKey] ?? 0;
    const pct = item.percentage ?? 0;
    return base * (pct / 100);
  }

  private calcFormula(
    item: PaySalaryStructureItemEntity,
    values: Record<string, number>,
    paramMap: Map<string, number>,
    allComponents: PayrollComponentEntity[],
  ): number {
    if (!item.formula) {
      return 0;
    }

    const earningCodes = allComponents
      .filter((c) => c.componentType === 'EARNING')
      .map((c) => c.code);

    return evaluateFormula(item.formula, {
      vars: values,
      param: (key: string) => paramMap.get(key) ?? 0,
      earningsSum: () =>
        earningCodes.reduce((sum, code) => sum + (values[code] ?? 0), 0),
    });
  }

  private calcSlab(
    item: PaySalaryStructureItemEntity,
    values: Record<string, number>,
  ): number {
    const slabRef = item.slabRef as SlabRef | null;
    if (!slabRef || !slabRef.slabs || !slabRef.slabs.length) {
      return 0;
    }

    // Use GROSS as default base for slab lookup
    const baseAmount = values['GROSS'] ?? values['BASIC'] ?? 0;

    for (const slab of slabRef.slabs) {
      if (baseAmount >= slab.from && baseAmount <= slab.to) {
        if (slab.amount !== undefined) {
          return slab.amount;
        }
        if (slab.percent !== undefined) {
          return baseAmount * (slab.percent / 100);
        }
      }
    }

    return 0;
  }

  private calcBalancing(
    item: PaySalaryStructureItemEntity,
    values: Record<string, number>,
    allComponents: PayrollComponentEntity[],
  ): number {
    const config = (item.balancingConfig as BalancingConfig) ?? {};
    const grossSource = config.grossSource ?? 'ACTUAL_GROSS';
    const targetGross = values[grossSource] ?? values['ACTUAL_GROSS'] ?? 0;

    // Sum all other earnings computed so far
    const otherEarnings = allComponents
      .filter(
        (c) =>
          c.componentType === 'EARNING' &&
          c.id !== item.componentId &&
          values[c.code] !== undefined,
      )
      .reduce((sum, c) => sum + (values[c.code] ?? 0), 0);

    return Math.max(0, targetGross - otherEarnings);
  }

  private computeNetPay(
    values: Record<string, number>,
    components: PayrollComponentEntity[],
  ): number {
    const gross = values['GROSS'] ?? 0;
    const totalDeductions = this.sumDeductions(values, components);
    return Math.max(0, gross - totalDeductions);
  }

  private sumDeductions(
    values: Record<string, number>,
    components: PayrollComponentEntity[],
  ): number {
    let total = 0;

    // Statutory deduction codes that are always summed (even if not in components list)
    const STATUTORY_CODES = new Set([
      'PF_EMP',
      'ESI_EMP',
      'PT',
      'LWF_EMP',
      'PF_ER_FROM_EMP',
    ]);

    // Statutory employee deductions
    for (const code of STATUTORY_CODES) {
      total += values[code] ?? 0;
    }

    // All other DEDUCTION type components (skip statutory to avoid double-count)
    for (const comp of components) {
      if (
        comp.componentType === 'DEDUCTION' &&
        !STATUTORY_CODES.has(comp.code)
      ) {
        total += values[comp.code] ?? 0;
      }
    }

    return total;
  }

  private sumEmployerCost(
    values: Record<string, number>,
    components: PayrollComponentEntity[],
  ): number {
    const gross = values['GROSS'] ?? 0;
    let employerContributions = 0;

    // Statutory employer contributions
    employerContributions += values['PF_ER'] ?? 0;
    employerContributions += values['ESI_ER'] ?? 0;
    employerContributions += values['LWF_ER'] ?? 0;

    // All EMPLOYER type components
    for (const comp of components) {
      if (comp.componentType === 'EMPLOYER') {
        employerContributions += values[comp.code] ?? 0;
      }
    }

    return gross + employerContributions;
  }

  private buildComponentMap(
    components: PayrollComponentEntity[],
  ): Map<string, PayrollComponentEntity> {
    const map = new Map<string, PayrollComponentEntity>();
    for (const comp of components) {
      map.set(comp.id, comp);
    }
    return map;
  }

  private async persistComponentValues(
    qr: import('typeorm').QueryRunner,
    runId: string,
    runEmployeeId: string,
    values: Record<string, number>,
  ): Promise<void> {
    for (const [componentCode, amount] of Object.entries(values)) {
      const existing = await qr.manager.findOne(
        PayrollRunComponentValueEntity,
        {
          where: { runEmployeeId, componentCode },
        },
      );

      if (existing) {
        existing.amount = String(amount);
        if (existing.source !== 'UPLOADED') {
          existing.source =
            'CALCULATED' as PayrollRunComponentValueEntity['source'];
        }
        await qr.manager.save(PayrollRunComponentValueEntity, existing);
      } else {
        const newVal = qr.manager.create(PayrollRunComponentValueEntity, {
          runId,
          runEmployeeId,
          componentCode,
          amount: String(amount),
          source: 'CALCULATED' as PayrollRunComponentValueEntity['source'],
        });
        await qr.manager.save(PayrollRunComponentValueEntity, newVal);
      }
    }
  }
}
