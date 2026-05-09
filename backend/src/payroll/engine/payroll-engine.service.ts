import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';

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
import { TdsCalculatorService } from '../services/tds-calculator.service';
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
    private readonly tdsCalc: TdsCalculatorService,
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
    // If the run was already APPROVED, re-processing invalidates the prior
    // approval. Auto-clear approval metadata so the run goes back through the
    // approval flow with the freshly computed values.
    const wasApproved = String(run.status || '').toUpperCase() === 'APPROVED';
    if (wasApproved) {
      this.logger.warn(
        `Run ${runId} was APPROVED; re-processing will clear approval metadata.`,
      );
      run.submittedByUserId = null;
      run.submittedAt = null;
      run.approvedByUserId = null;
      run.approvedAt = null;
      run.approvalComments = null;
      run.rejectedByUserId = null;
      run.rejectedAt = null;
      run.rejectionReason = null;
    }
    if (!run.periodMonth || run.periodMonth < 1 || run.periodMonth > 12) {
      throw new BadRequestException(
        `Run ${runId} has invalid periodMonth=${run.periodMonth}. Expected 1-12.`,
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
    if (!run.periodMonth || run.periodMonth < 1 || run.periodMonth > 12) {
      throw new BadRequestException(
        `Run ${runId} has invalid periodMonth=${run.periodMonth}. Expected 1-12.`,
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

  /**
   * Look up the statutory minimum monthly wage for a given (state, skill,
   * scheduled-employment), effective on `onDate`. Used to seed the
   * `MIN_WAGE` engine variable so formulas can reference it.
   *
   * Resolution order (each step short-circuits on first hit):
   *   1. minimum_wages master row matching state + skill +
   *      scheduled_employment (exact) for the date range.
   *   2. minimum_wages master row matching state + skill with
   *      scheduled_employment IS NULL (wildcard).
   *   3. pay_rule_parameter `MIN_WAGES` for the client's active rule set
   *      (legacy per-client flat fallback).
   *   4. 0 (formulas should guard accordingly).
   *
   * NOTE: Skill defaults to 'UNSKILLED' when not provided since the regular
   * employee master lacks a skill column today; admins can override by
   * configuring a NULL-skill (wildcard) row in `minimum_wages`.
   */
  private async resolveMinWage(
    stateCode: string | null | undefined,
    onDate: string,
    skillCategory: string = 'UNSKILLED',
    scheduledEmployment: string | null = null,
    clientId: string | null = null,
  ): Promise<number> {
    const skill = String(skillCategory || 'UNSKILLED').toUpperCase();
    const sched =
      scheduledEmployment && String(scheduledEmployment).trim()
        ? String(scheduledEmployment).trim()
        : null;

    if (stateCode) {
      try {
        // Prefer a schedule-specific match, then fall back to a NULL
        // (wildcard) row. ORDER BY ensures the schedule-matched row beats
        // the wildcard when both exist.
        const rows = await this.ds.query(
          `SELECT monthly_wage,
                  CASE
                    WHEN scheduled_employment IS NOT NULL AND $4::text IS NOT NULL
                         AND LOWER(scheduled_employment) = LOWER($4) THEN 0
                    WHEN scheduled_employment IS NULL THEN 1
                    ELSE 2
                  END AS rank
             FROM minimum_wages
            WHERE state_code = $1
              AND skill_category = $2
              AND effective_from <= $3
              AND (effective_to IS NULL OR effective_to >= $3)
              AND (
                scheduled_employment IS NULL
                OR ($4::text IS NOT NULL AND LOWER(scheduled_employment) = LOWER($4))
              )
            ORDER BY rank ASC, effective_from DESC
            LIMIT 1`,
          [String(stateCode).toUpperCase(), skill, onDate, sched],
        );
        if (rows && rows[0] && rows[0].monthly_wage != null) {
          return Number(rows[0].monthly_wage) || 0;
        }
      } catch (err) {
        this.logger.warn(
          `MIN_WAGE master lookup failed for state=${stateCode} skill=${skill} sched=${sched}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    // Fallback: per-client active rule-set MIN_WAGES parameter (legacy flat).
    if (clientId) {
      try {
        const paramRows = await this.ds.query(
          `SELECT p.value_num, p.value_text
             FROM pay_rule_parameters p
             JOIN pay_rule_sets r ON r.id = p.rule_set_id
            WHERE r.client_id = $1
              AND r.is_active = true
              AND r.effective_from <= $2
              AND (r.effective_to IS NULL OR r.effective_to >= $2)
              AND p.key = 'MIN_WAGES'
            ORDER BY r.branch_id NULLS LAST, r.effective_from DESC
            LIMIT 1`,
          [clientId, onDate],
        );
        const r0 = paramRows?.[0];
        if (r0) {
          const v =
            r0.value_num != null
              ? Number(r0.value_num)
              : r0.value_text != null
                ? Number(r0.value_text)
                : NaN;
          if (!isNaN(v)) return v;
        }
      } catch (err) {
        this.logger.warn(
          `MIN_WAGE rule-set fallback failed for client=${clientId}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    return 0;
  }

  /**
   * Best-effort: resolve the client's labour-law "schedule of employment"
   * by reading any CONTRACTOR user record attached to the client. Used to
   * scope the minimum-wages lookup. Returns null when not configured.
   */
  private async resolveClientScheduledEmployment(
    clientId: string | null | undefined,
  ): Promise<string | null> {
    if (!clientId) return null;
    try {
      const rows = await this.ds.query(
        `SELECT scheduled_employment FROM users
          WHERE client_id = $1
            AND scheduled_employment IS NOT NULL
            AND TRIM(scheduled_employment) <> ''
          LIMIT 1`,
        [clientId],
      );
      const v = rows?.[0]?.scheduled_employment;
      return v ? String(v) : null;
    } catch {
      return null;
    }
  }

  /**
   * Live-preview a single structure item against caller-supplied variable values.
   * Used by the structure-item editor to validate formula/slab/percent before saving.
   * No DB writes; all fetches scoped to clientId for variable name suggestions only.
   */
  async previewComponent(params: {
    clientId?: string | null;
    calcMethod: 'FIXED' | 'PERCENT' | 'FORMULA' | 'SLAB' | 'BALANCING';
    fixedAmount?: number | null;
    percentage?: number | null;
    percentageBase?: 'BASIC' | 'GROSS' | 'CTC' | 'PF_WAGE' | 'ESI_WAGE' | null;
    formula?: string | null;
    slabRef?: Record<string, unknown> | null;
    balancingConfig?: Record<string, unknown> | null;
    minAmount?: number | null;
    maxAmount?: number | null;
    roundingMode?: string | null;
    inputs?: Record<string, number>;
  }): Promise<{
    value: number;
    rawValue: number;
    baseAmount?: number;
    resolvedInputs: Record<string, number>;
    error?: string;
  }> {
    const values: Record<string, number> = {};
    if (params.inputs) {
      for (const [k, v] of Object.entries(params.inputs)) {
        const n = Number(v);
        if (Number.isFinite(n)) values[k] = n;
      }
    }

    // Best-effort: load components for FORMULA earningsSum() resolution.
    let allComponents: PayrollComponentEntity[] = [];
    const paramMap = new Map<string, number>();
    if (params.clientId) {
      try {
        allComponents = await this.compRepo.find({
          where: { clientId: params.clientId, isActive: true },
        });
      } catch {
        // ignore — preview should still work
      }
    }

    // Build a transient item-shaped object for the calc helpers.
    const fakeItem = {
      calcMethod: params.calcMethod,
      fixedAmount: params.fixedAmount ?? null,
      percentage: params.percentage ?? null,
      percentageBase: params.percentageBase ?? 'BASIC',
      formula: params.formula ?? null,
      slabRef: params.slabRef ?? null,
      balancingConfig: params.balancingConfig ?? null,
      minAmount: params.minAmount ?? null,
      maxAmount: params.maxAmount ?? null,
      roundingMode: params.roundingMode ?? 'NEAREST_RUPEE',
    } as unknown as PaySalaryStructureItemEntity;

    let raw = 0;
    let baseAmount: number | undefined;
    let error: string | undefined;
    try {
      switch (params.calcMethod) {
        case 'FIXED':
          raw = params.fixedAmount ?? 0;
          break;
        case 'PERCENT':
          baseAmount = values[params.percentageBase ?? 'BASIC'] ?? 0;
          raw = this.calcPercent(fakeItem, values);
          break;
        case 'FORMULA':
          raw = this.calcFormula(fakeItem, values, paramMap, allComponents);
          break;
        case 'SLAB':
          baseAmount = values['GROSS'] ?? values['BASIC'] ?? 0;
          raw = this.calcSlab(fakeItem, values);
          break;
        case 'BALANCING':
          raw = this.calcBalancing(fakeItem, values, allComponents);
          break;
        default:
          raw = 0;
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      raw = 0;
    }

    let value = raw;
    value = this.rounding.applyMinMax(
      value,
      params.minAmount ?? null,
      params.maxAmount ?? null,
    );
    value = this.rounding.applyRounding(
      value,
      (params.roundingMode as string) ?? 'NEAREST_RUPEE',
    );

    return { value, rawValue: raw, baseAmount, resolvedInputs: values, error };
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
    // Fallback: if employee has no state, use the branch's statecode so the
    // preview matches the run engine (which also falls back).
    if (!employeeStateCode && branchId) {
      const br = await this.ds.query(
        `SELECT statecode FROM client_branches WHERE id=$1 LIMIT 1`,
        [branchId],
      );
      employeeStateCode = br?.[0]?.statecode ?? '';
    }

    // Seed MIN_WAGE for formula use in preview as well. Honors the
    // client's labour-law schedule of employment so multi-state clients
    // get state+schedule-specific rates from `minimum_wages`, with rule-set
    // MIN_WAGES fallback when no master row exists.
    const previewSched = await this.resolveClientScheduledEmployment(clientId);
    values['MIN_WAGE'] = await this.resolveMinWage(
      employeeStateCode,
      asOfDate,
      'UNSKILLED',
      previewSched,
      clientId,
    );

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
      const statResult = this.statutory.compute({
        values,
        setup,
        components,
        periodMonth: Number(asOfDate.split('-')[1]) || undefined,
      });
      Object.assign(values, statResult.values);
      return values;
    }

    const { structure, items } = resolved;

    let paramMap = new Map<string, number>();
    // L1: both branches called resolveAndLoad with identical args. Always
    // resolve the active rule set for this client+branch+date — if the
    // structure is pinned to a specific ruleSetId, prefer that one's params.
    const ruleSetResult = await this.rulesetResolver.resolveAndLoad({
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

    // ── Overtime (OT) — same rule as full process path. Must run BEFORE
    // statutory so OT folds into ESI base and into GROSS for PT slabs.
    const otHoursPv = Number(values['OT_HOURS'] ?? 0);
    const otMultiplierPv = Number(setup.otMultiplier) || 2;
    const otHoursPerDayPv = Number((setup as any).otHoursPerDay) || 8;
    const otDaysInMonthPv = Number((setup as any).otDaysInMonth) || 26;
    const otBaseGrossPv = Number(values['ACTUAL_GROSS'] ?? 0) || gross;
    const otAmountPv =
      otHoursPv > 0 && otBaseGrossPv > 0
        ? Math.round(
            otHoursPv *
              (otBaseGrossPv / otDaysInMonthPv / otHoursPerDayPv) *
              otMultiplierPv,
          )
        : 0;
    values['OT_AMOUNT'] = otAmountPv;
    values['GROSS'] = gross + otAmountPv;
    values['ESI_WAGE'] = esiWage + otAmountPv;

    // Statutory deductions
    const statResult = this.statutory.compute({
      values,
      setup,
      components,
      periodMonth: Number(asOfDate.split('-')[1]) || undefined,
    });
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
      // Load user-supplied input values. Both CSV-imported rows ('UPLOADED')
      // and inline edits made from the Preview Employees grid ('MANUAL_EDIT')
      // are treated as authoritative inputs the engine must honour during
      // reprocess. Without 'MANUAL_EDIT' here, edits to OTHER_EARNINGS,
      // ARREAR_ATT_BONUS, OTHER_DEDUCTIONS, OT_HOURS etc. silently vanish on
      // the next Save & Reprocess (and on full-run rerun).
      const uploadedRows = await this.compValRepo.find({
        where: {
          runId: run.id,
          runEmployeeId: emp.id,
          source: In([
            'UPLOADED',
            'MANUAL_EDIT',
          ]) as unknown as PayrollRunComponentValueEntity['source'],
        },
      });

      const values: Record<string, number> = {};
      const uploadedCodes = new Set<string>();
      for (const row of uploadedRows) {
        values[row.componentCode] = Number(row.amount) || 0;
        uploadedCodes.add(row.componentCode);
      }

      // ── Seed attendance data (uploaded values take precedence) ──────────
      const daysInMonth = new Date(
        run.periodYear,
        run.periodMonth,
        0,
      ).getDate();
      const attendanceUploaded = emp.totalDays > 0; // means Excel was uploaded before processing
      // True when *any* attendance signal exists for this employee. When false the engine
      // treats the employee as having no payable days (gross/net = 0) instead of silently
      // assuming a full 26-day month.
      const attendanceProvided =
        attendanceUploaded ||
        !!attendance ||
        values['PAYABLE_DAYS'] !== undefined ||
        values['WORKED_DAYS'] !== undefined;

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
          // NCP_DAYS = Non-Contributory Period for EPF (LWP). In our model
          // attendance.lopDays is already the unpaid-leave-only count
          // (paid leave from EL balance is excluded from LOP via PAYABLE_DAYS
          // arithmetic), so NCP_DAYS = LOP_DAYS is correct for PF reporting.
          // Override via UPLOADED/MANUAL_EDIT NCP_DAYS if a client wants to
          // distinguish (e.g. paid sabbatical that isn't LOP but is still NCP).
          values['NCP_DAYS'] = attendance.lopDays;
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
        // No attendance data — only fall back to a full month when explicit
        // PAYABLE_DAYS / WORKED_DAYS values were supplied for this employee.
        // Otherwise treat as zero so totals don't silently assume a full month.
        if (attendanceProvided) {
          emp.totalDays = daysInMonth;
          emp.daysPresent = daysInMonth - (values['LOP_DAYS'] ?? 0);
          emp.lopDays = values['LOP_DAYS'] ?? 0;
          emp.ncpDays = values['NCP_DAYS'] ?? 0;
        } else {
          emp.totalDays = 0;
          emp.daysPresent = 0;
          emp.lopDays = values['LOP_DAYS'] ?? 0;
          emp.ncpDays = values['NCP_DAYS'] ?? 0;
        }
      }

      // Look up employee's departmentId and gradeId for structure scoping
      let departmentId: string | null = null;
      let gradeId: string | null = null;
      let empPfApplicable: boolean | undefined;
      let empEsiApplicable: boolean | undefined;
      let empPfServiceStartDate: string | null = null;
      let empBasicAtPfStart: number | null = null;
      let empCtcAnnual: number | null = null;
      let empMonthlyGross: number | null = null;
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
          empCtcAnnual = masterEmp.ctc ? Number(masterEmp.ctc) : null;
          empMonthlyGross = masterEmp.monthlyGross
            ? Number(masterEmp.monthlyGross)
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
              values['ACTUAL_GROSS'] = Math.ceil(fallbackGross);
            }
          }
        }
      }

      // ── Seed WORKED_DAYS / PAYABLE_DAYS for formula use ──────────────
      // Per-client wage divisor:
      //   FIXED_26      → 26 (default Indian convention)
      //   CALENDAR_DAYS → actual days in the payroll month (28/29/30/31)
      const wageBasis = setup.wageBasisDays || 'FIXED_26';
      const calendarDaysInMonth = new Date(
        run.periodYear,
        run.periodMonth,
        0,
      ).getDate();
      const WORKING_DAYS_IN_MONTH =
        wageBasis === 'CALENDAR_DAYS' ? calendarDaysInMonth : 26;
      if (values['WORKED_DAYS'] === undefined) {
        // No attendance uploaded for this employee → 0, NOT a full month.
        values['WORKED_DAYS'] = attendanceProvided
          ? emp.daysPresent || WORKING_DAYS_IN_MONTH
          : 0;
      }
      if (values['PAYABLE_DAYS'] === undefined && !attendanceProvided) {
        values['PAYABLE_DAYS'] = 0;
        values['LOP_DAYS'] = values['LOP_DAYS'] ?? 0;
      }

      // ── Holidays from attendance records ──────────────────────────
      const holidayDays = attendance?.holidays ?? 0;
      values['HOLIDAYS'] = holidayDays;
      values['WEEK_OFFS'] = attendance?.weekOffs ?? 0;

      // ── Earned Leave (EL) accrual ────────────────────────────────
      // Per-client divisor: EL_ACCRUED = WORKED_DAYS / divisor.
      // Default 20 (≈1.5 days/month at 30 worked days). Configurable via
      // payroll_client_setup.el_accrual_divisor (e.g. 22 for some factories).
      const elDivisorRaw = Number(setup.elAccrualDivisor);
      const elDivisor = elDivisorRaw && elDivisorRaw > 0 ? elDivisorRaw : 20;
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

      const elAccrued = skipEL
        ? 0
        : Math.round((workedDays / elDivisor) * 100) / 100;
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

        // Paid leave is ONLY honored when explicitly approved on the attendance
        // sheet (UPLOADED via EL_PAID_LEAVE_DAYS) or via ESS approval flow.
        // The engine must NOT auto-deduct EL balance for plain absences —
        // those become LOP, not paid leave. Capping by available balance still
        // applies so we never go negative.
        const uploadedPaidLeave = uploadedCodes.has('EL_PAID_LEAVE_DAYS')
          ? values['EL_PAID_LEAVE_DAYS'] || 0
          : 0;
        if (uploadedPaidLeave > 0 && elBalanceBefore > 0) {
          paidLeaveDays = Math.min(uploadedPaidLeave, elBalanceBefore);
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

      // EL_PAID_LEAVE_DAYS represents leave approved on the attendance sheet.
      // If the user uploaded a value (even 0), respect it as the source of truth.
      // The engine's auto-derived paidLeaveDays (= min(absentDays, balance, 1.5)) must
      // NOT clobber it, otherwise Leave Validation reports phantom sheet leaves.
      if (!uploadedCodes.has('EL_PAID_LEAVE_DAYS')) {
        values['EL_PAID_LEAVE_DAYS'] = paidLeaveDays;
      }
      values['EL_BALANCE'] = elBalanceAfter;

      // ── Sick Leave (SL) accrual ──────────────────────────────────
      // Per-client divisor: SL_ACCRUED = WORKED_DAYS / divisor.
      // Default 60 (≈0.5 day per 30 worked days). Skip in joining month.
      const slDivisorRaw = Number((setup as any).slAccrualDivisor);
      const slDivisor = slDivisorRaw && slDivisorRaw > 0 ? slDivisorRaw : 60;
      const slAccrued = skipEL
        ? 0
        : Math.round((workedDays / slDivisor) * 100) / 100;
      values['SL_ACCRUED'] = slAccrued;

      let slUsed = 0;
      let slBalanceAfter = 0;
      if (emp.employeeId) {
        const slBalBefore = await qr.manager.findOne(LeaveBalanceEntity, {
          where: {
            employeeId: emp.employeeId,
            year: run.periodYear,
            leaveType: 'SL',
          },
        });
        const slAvailableBefore = slBalBefore
          ? parseFloat(slBalBefore.available) || 0
          : 0;

        const uploadedSlDays = uploadedCodes.has('SL_DAYS')
          ? values['SL_DAYS'] || 0
          : 0;
        if (uploadedSlDays > 0 && slAvailableBefore > 0) {
          slUsed = Math.min(uploadedSlDays, slAvailableBefore);
          slUsed = Math.round(slUsed * 100) / 100;
        }

        const monthStr = `${run.periodYear}-${String(run.periodMonth).padStart(2, '0')}`;
        const entryDate = `${monthStr}-01`;

        // Idempotent: drop existing SL entries for this month
        await qr.manager
          .createQueryBuilder()
          .delete()
          .from(LeaveLedgerEntity)
          .where('employee_id = :empId', { empId: emp.employeeId })
          .andWhere('leave_type = :lt', { lt: 'SL' })
          .andWhere('remarks LIKE :m', { m: `%${monthStr}%` })
          .execute();

        if (slAccrued > 0) {
          await qr.manager.save(
            LeaveLedgerEntity,
            qr.manager.create(LeaveLedgerEntity, {
              employeeId: emp.employeeId,
              clientId: run.clientId,
              leaveType: 'SL',
              entryDate,
              qty: String(slAccrued),
              refType: 'SL_ACCRUAL',
              refId: run.id,
              remarks: `SL accrual for ${monthStr}: ${slAccrued} days`,
            }),
          );
        }
        if (slUsed > 0) {
          await qr.manager.save(
            LeaveLedgerEntity,
            qr.manager.create(LeaveLedgerEntity, {
              employeeId: emp.employeeId,
              clientId: run.clientId,
              leaveType: 'SL',
              entryDate,
              qty: String(-slUsed),
              refType: 'SL_PAID_LEAVE',
              refId: run.id,
              remarks: `SL paid leave for ${monthStr}: ${slUsed} days`,
            }),
          );
        }

        await qr.manager.query(
          `INSERT INTO leave_balances (id, employee_id, client_id, year, leave_type, opening, accrued, used, lapsed, available, created_at)
           VALUES (gen_random_uuid(), $1, $2, $3, 'SL', 0, $4, $5, 0, $6, NOW())
           ON CONFLICT (employee_id, year, leave_type)
           DO UPDATE SET accrued   = COALESCE((SELECT SUM(ABS(qty)) FROM leave_ledger
                                               WHERE employee_id = $1 AND leave_type = 'SL' AND ref_type = 'SL_ACCRUAL'
                                                 AND EXTRACT(YEAR FROM entry_date::date) = $3), 0),
                         used      = COALESCE((SELECT SUM(ABS(qty)) FROM leave_ledger
                                               WHERE employee_id = $1 AND leave_type = 'SL' AND ref_type = 'SL_PAID_LEAVE'
                                                 AND EXTRACT(YEAR FROM entry_date::date) = $3), 0),
                         available = GREATEST(leave_balances.opening
                           + COALESCE((SELECT SUM(ABS(qty)) FROM leave_ledger
                                       WHERE employee_id = $1 AND leave_type = 'SL' AND ref_type = 'SL_ACCRUAL'
                                         AND EXTRACT(YEAR FROM entry_date::date) = $3), 0)
                           - COALESCE((SELECT SUM(ABS(qty)) FROM leave_ledger
                                       WHERE employee_id = $1 AND leave_type = 'SL' AND ref_type = 'SL_PAID_LEAVE'
                                         AND EXTRACT(YEAR FROM entry_date::date) = $3), 0), 0),
                         last_updated_at = NOW()`,
          [
            emp.employeeId,
            run.clientId,
            run.periodYear,
            slAccrued,
            slUsed,
            slAccrued - slUsed,
          ],
        );

        const updatedSlBal = await qr.manager.findOne(LeaveBalanceEntity, {
          where: {
            employeeId: emp.employeeId,
            year: run.periodYear,
            leaveType: 'SL',
          },
        });
        slBalanceAfter = updatedSlBal
          ? parseFloat(updatedSlBal.available) || 0
          : Math.max(0, slAvailableBefore + slAccrued - slUsed);
      }
      values['SL_BALANCE'] = slBalanceAfter;

      if (values['PAYABLE_DAYS'] === undefined) {
        // Payable = worked days + holidays + paid leave from EL balance
        values['PAYABLE_DAYS'] = workedDays + holidayDays + paidLeaveDays;
      }

      // ── Seed MIN_WAGE for formula use (best-effort) ──────────────────
      // Resolves the statutory minimum monthly wage by employee state +
      // default UNSKILLED, scoped to the client's labour-law schedule of
      // employment so multi-state clients get the right state's rate per
      // branch. Falls back to branch state when employee has none, then to
      // the rule-set MIN_WAGES parameter when no master row matches.
      if (values['MIN_WAGE'] === undefined) {
        let mwState = emp.stateCode ?? '';
        if (!mwState && emp.branchId) {
          const br = await qr.manager.query(
            `SELECT statecode FROM client_branches WHERE id=$1 LIMIT 1`,
            [emp.branchId],
          );
          mwState = br?.[0]?.statecode ?? '';
        }
        const runSched = await this.resolveClientScheduledEmployment(
          run.clientId,
        );
        values['MIN_WAGE'] = await this.resolveMinWage(
          mwState,
          asOfDate,
          'UNSKILLED',
          runSched,
          run.clientId,
        );
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
      // Default to 0 when missing so a blank attendance sheet does NOT silently
      // produce a full-month salary.
      const payableDays = values['PAYABLE_DAYS'] ?? 0;
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
      // When payable days = 0, also zero out the non-prorata earnings (ATT_BONUS,
      // OTHER_EARNINGS, ARREAR_ATT_BONUS). ACTUAL_GROSS stays as a reference value.
      if (payableDays === 0) {
        for (const code of [
          'ATT_BONUS',
          'OTHER_EARNINGS',
          'ARREAR_ATT_BONUS',
        ]) {
          if (values[code] !== undefined) values[code] = 0;
        }
      }

      // Compute wage bases
      const { pfWage, esiWage, gross } = this.wageBase.computeWageBases({
        values,
        components,
      });
      values['PF_WAGE'] = pfWage;
      values['GROSS'] = gross;

      // ── Overtime (OT) amount — computed BEFORE statutory so OT can be
      // included in the ESI wage base (per ESIC: ESI is payable on OT
      // wages even though OT does not raise the coverage ceiling). PF
      // wages remain unchanged.
      // Rule: OT base wage = ACTUAL_GROSS (registered monthly gross, NOT
      // post-pro-rata earned gross). 1 day = ACTUAL_GROSS / otDaysInMonth;
      // 1 hour = day / otHoursPerDay; amount = hours × per-hour × multiplier.
      // Per-client config:
      //   ot_days_in_month   (default 26)  – e.g. VEIPL: 26
      //   ot_hours_per_day   (default 8)   – e.g. VEIPL: 8
      //   ot_multiplier      (default 2.0) – e.g. VEIPL: 1.0 (single wage)
      const otHoursEarly = Number(values['OT_HOURS'] ?? 0);
      const otMultiplierEarly = Number(setup.otMultiplier) || 2;
      const otHoursPerDay = Number((setup as any).otHoursPerDay) || 8;
      const otDaysInMonth = Number((setup as any).otDaysInMonth) || 26;
      const otBaseGross = Number(values['ACTUAL_GROSS'] ?? 0) || gross;
      const otAmountEarly =
        otHoursEarly > 0 && otBaseGross > 0
          ? Math.round(
              otHoursEarly *
                (otBaseGross / otDaysInMonth / otHoursPerDay) *
                otMultiplierEarly,
            )
          : 0;
      values['OT_AMOUNT'] = otAmountEarly;
      // Earned-gross convention per business rule:
      //   PT base   = basic + HRA + other allowance + OTHER_EARNINGS + OT
      //   ESI base  = basic + HRA + other allowance + OT  (excludes OTHER_EARNINGS)
      // wage-base service already excludes OTHER_EARNINGS from esiWage via the
      // component's affectsEsiWage flag. We add OT to both bases here, and OT
      // also gets folded into GROSS so PT/LWF slabs see the true earned gross.
      values['GROSS'] = gross + otAmountEarly;
      // ESI wage base includes OT earnings; PF wage base does not.
      values['ESI_WAGE'] = esiWage + otAmountEarly;

      // Statutory deductions (PF/ESI)
      const statResult = this.statutory.compute({
        values,
        setup,
        components,
        pfApplicable: empPfApplicable,
        esiApplicable: empEsiApplicable,
        pfServiceStartDate: empPfServiceStartDate,
        basicAtPfStart: empBasicAtPfStart,
        periodMonth: run.periodMonth,
      });
      Object.assign(values, statResult.values);

      // ESI contribution-period rule: if wage exceeded the ceiling at the start
      // of a period (April or October), persist the master flag so the employee
      // stays out of ESI for subsequent runs.
      if (statResult.esiDroppedAtPeriodStart && emp.employeeId) {
        await this.empRepo.update(
          { id: emp.employeeId },
          { esiApplicable: false },
        );
      }

      // State-based deductions (PT/LWF)
      // If the employee's master state_code is missing, fall back to the
      // branch's statecode so PT/LWF still apply (otherwise PT silently=0).
      let stateCode = emp.stateCode ?? '';
      if (!stateCode && emp.branchId) {
        const br = await qr.manager.query(
          `SELECT statecode FROM client_branches WHERE id=$1 LIMIT 1`,
          [emp.branchId],
        );
        stateCode = br?.[0]?.statecode ?? '';
        if (stateCode) {
          // Backfill so subsequent reads/reports see it.
          emp.stateCode = stateCode;
          if (emp.employeeId) {
            await qr.manager.query(
              `UPDATE employees SET state_code=$1 WHERE id=$2 AND (state_code IS NULL OR state_code='')`,
              [stateCode, emp.employeeId],
            );
          }
        }
      }
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

      // ── Income Tax (TDS) ────────────────────────────────────────────
      // Compute monthly TDS using FY 2025-26 New Regime (default).
      // Annual gross priority: monthly_gross × 12 (most reliably populated)
      // → CTC → current run gross × 12. Skip silently when no income basis.
      try {
        const grossNow = Number(values['GROSS'] ?? 0);
        const annualGross =
          empMonthlyGross && empMonthlyGross > 0
            ? empMonthlyGross * 12
            : empCtcAnnual && empCtcAnnual > 0
              ? empCtcAnnual
              : grossNow > 0
                ? grossNow * 12
                : 0;
        if (annualGross > 0) {
          const tdsResult = this.tdsCalc.calculate({
            annualGross,
            regime: 'NEW',
            remainingMonths: 12,
          });
          values['TDS'] = Math.max(0, Math.ceil(tdsResult.monthlyTds));
          values['TDS_ANNUAL_BASIS'] = Math.round(annualGross);
        } else {
          values['TDS'] = 0;
          values['TDS_ANNUAL_BASIS'] = 0;
        }
      } catch (tdsErr) {
        this.logger.warn(
          `TDS calc skipped for emp ${emp.employeeId ?? emp.id}: ${(tdsErr as Error).message}`,
        );
        values['TDS'] = 0;
      }

      // ── Overtime (OT) amount ────────────────────────────────────────────
      // OT_AMOUNT was computed above (before statutory) so OT is included in
      // the ESI wage base AND in GROSS (for PT slabs). Re-read the persisted
      // value here for trace coherence.
      const otAmount = Number(values['OT_AMOUNT'] ?? 0);

      // Compute net pay. GROSS already includes OT, so do NOT add OT again.
      values['NET_PAY'] = this.computeNetPay(values, components);

      // Persist component values (upsert)
      await this.persistComponentValues(qr, run.id, emp.id, values);

      // Update employee totals
      const totalDeductions = this.sumDeductions(values, components);
      const employerCost = this.sumEmployerCost(values, components);

      // M3: round all employee salary aggregates UP to the next whole rupee,
      // then derive net = gross - deductions from the *rounded* values
      // so the displayed identity (NET = GROSS - DEDUCTIONS) holds
      // exactly. GROSS already INCLUDES overtime (folded in above) so the
      // headline matches "all earnings".
      const grossRounded = Math.ceil(Number(values['GROSS'] ?? 0));
      const deductionsRounded = Math.ceil(Number(totalDeductions));
      const employerRounded = Math.ceil(Number(employerCost));
      const netRounded = Math.max(0, grossRounded - deductionsRounded);

      // Reference otAmount to keep lint happy (kept for future audit/trace).
      void otAmount;

      emp.grossEarnings = String(grossRounded);
      emp.totalDeductions = String(deductionsRounded);
      emp.employerCost = String(employerRounded);
      emp.netPay = String(netRounded);
      // Keep the trace value coherent with the persisted aggregate so the
      // payslip and component-detail panel match the totals row.
      values['NET_PAY'] = netRounded;
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

    // System deduction codes that are user-supplied via CSV upload or the
    // Preview-Employees inline edit (Save & Process). They are never part
    // of a client's salary structure ruleset, so they would otherwise be
    // silently dropped from the total. Always sum them when present.
    const SYSTEM_DEDUCTION_CODES = new Set(['OTHER_DEDUCTIONS']);

    // Statutory employee deductions
    for (const code of STATUTORY_CODES) {
      total += values[code] ?? 0;
    }

    // System (user-supplied) deductions
    for (const code of SYSTEM_DEDUCTION_CODES) {
      total += values[code] ?? 0;
    }

    // All other DEDUCTION type components (skip statutory + system to avoid double-count)
    for (const comp of components) {
      if (
        comp.componentType === 'DEDUCTION' &&
        !STATUTORY_CODES.has(comp.code) &&
        !SYSTEM_DEDUCTION_CODES.has(comp.code)
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
        // Preserve user-supplied input values: never overwrite amount or
        // source for UPLOADED (CSV import) or MANUAL_EDIT (inline preview
        // edit). Use the explicit "Override" flow / Resolve buttons to
        // change them.
        if (
          existing.source === 'UPLOADED' ||
          (existing.source as string) === 'MANUAL_EDIT'
        ) {
          continue;
        }
        existing.amount = String(amount);
        existing.source =
          'CALCULATED' as PayrollRunComponentValueEntity['source'];
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
