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
    private readonly runItemRepo: Repository<PayrollRunItemEntity>,
    @InjectRepository(PayrollRunComponentValueEntity)
    private readonly compValRepo: Repository<PayrollRunComponentValueEntity>,
    @InjectRepository(PayrollComponentEntity)
    private readonly compRepo: Repository<PayrollComponentEntity>,
    @InjectRepository(PayrollClientSetupEntity)
    private readonly setupRepo: Repository<PayrollClientSetupEntity>,
    @InjectRepository(PayCalcTraceEntity)
    private readonly traceRepo: Repository<PayCalcTraceEntity>,
    @InjectRepository(EmployeeEntity)
    private readonly empRepo: Repository<EmployeeEntity>,
    private readonly ds: DataSource,
    private readonly structureResolver: StructureResolverService,
    private readonly rulesetResolver: RulesetResolverService,
    private readonly statutory: StatutoryCalculatorService,
    private readonly stateStat: StateStatutoryService,
    private readonly rounding: RoundingService,
    private readonly wageBase: WageBaseService,
  ) {}

  async processWithEngine(runId: string): Promise<ProcessResult> {
    const run = await this.runRepo.findOne({ where: { id: runId } });
    if (!run) {
      throw new BadRequestException(`Payroll run ${runId} not found`);
    }
    if (run.status === 'PROCESSED' || run.status === 'APPROVED') {
      throw new ConflictException(
        `Run ${runId} is already ${run.status}. Cannot re-process.`,
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

    const errors: string[] = [];
    let processed = 0;

    for (const emp of runEmployees) {
      try {
        await this.processEmployee(
          run,
          emp,
          setup,
          components,
          asOfDate,
          errors,
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

  async previewEmployee(params: {
    clientId: string;
    employeeId: string | null;
    branchId: string | null;
    grossAmount: number;
    asOfDate: string;
  }): Promise<Record<string, number>> {
    const { clientId, employeeId, branchId, grossAmount, asOfDate } = params;

    const setup = await this.setupRepo.findOne({ where: { clientId } });
    if (!setup) {
      throw new BadRequestException(
        `Payroll setup not found for client ${clientId}`,
      );
    }

    const components = await this.compRepo.find({
      where: { clientId, isActive: true },
      order: { displayOrder: 'ASC' },
    });
    if (!components.length) {
      throw new BadRequestException(
        `No payroll components configured for client ${clientId}`,
      );
    }

    const values: Record<string, number> = { ACTUAL_GROSS: grossAmount };

    // Look up employee's departmentId and gradeId for structure scoping
    let departmentId: string | null = null;
    let gradeId: string | null = null;
    if (employeeId) {
      const employee = await this.empRepo.findOne({
        where: { id: employeeId },
      });
      if (employee) {
        departmentId = employee.departmentId ?? null;
        gradeId = employee.gradeId ?? null;
      }
    }

    const resolved = await this.structureResolver.resolve({
      clientId,
      employeeId,
      branchId,
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
          branchId,
          asOfDate,
        })
      : await this.rulesetResolver.resolveAndLoad({
          clientId,
          branchId,
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

    // State statutory (PT/LWF) — use a placeholder stateCode for preview
    let stateCode = '';
    if (employeeId) {
      const employee = await this.empRepo.findOne({
        where: { id: employeeId },
      });
      stateCode = employee?.stateCode ?? '';
    }

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

      // Look up employee's departmentId and gradeId for structure scoping
      let departmentId: string | null = null;
      let gradeId: string | null = null;
      if (emp.employeeId) {
        const masterEmp = await this.empRepo.findOne({
          where: { id: emp.employeeId },
        });
        if (masterEmp) {
          departmentId = masterEmp.departmentId ?? null;
          gradeId = masterEmp.gradeId ?? null;
        }
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

      // Compute wage bases
      const { pfWage, esiWage, gross } = this.wageBase.computeWageBases({
        values,
        components,
      });
      values['PF_WAGE'] = pfWage;
      values['ESI_WAGE'] = esiWage;
      values['GROSS'] = gross;

      // Statutory deductions (PF/ESI)
      const statResult = this.statutory.compute({ values, setup, components });
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

      // Save calc trace
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

    // Statutory employee deductions
    total += values['PF_EMP'] ?? 0;
    total += values['ESI_EMP'] ?? 0;
    total += values['PT'] ?? 0;
    total += values['LWF_EMP'] ?? 0;

    // All DEDUCTION type components
    for (const comp of components) {
      if (comp.componentType === 'DEDUCTION') {
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
