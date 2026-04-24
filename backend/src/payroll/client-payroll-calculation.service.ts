import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PayrollClientStructureEntity } from './entities/payroll-client-structure.entity';
import { PayrollStructureComponentEntity } from './entities/payroll-structure-component.entity';
import { PayrollStatutoryConfigEntity } from './entities/payroll-statutory-config.entity';
import { evaluateFormula } from './engine/expression';

// ── Public types ──────────────────────────────────────────────────────────────

export interface CalculatePayrollInput {
  gross: number;
  lopDays: number;
  stateCode: string;
  month: number;
  year: number;
}

export interface CalculatePayrollResult {
  warnings: string[];
  values: Record<string, number>;
  totalEarnings: number;
  totalDeductions: number;
  employerContributions: number;
  netPay: number;
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class ClientPayrollCalculationService {
  private readonly logger = new Logger(ClientPayrollCalculationService.name);

  /**
   * Calculate all payroll components for a given structure and input.
   *
   * Uses the existing safe formula expression engine (IF/MIN/MAX/ROUND/PARAM)
   * instead of JS eval — no code-injection risk.
   */
  calculate(
    structure: PayrollClientStructureEntity,
    input: CalculatePayrollInput,
  ): CalculatePayrollResult {
    if (input.gross < 0) {
      throw new BadRequestException('Gross salary cannot be negative.');
    }

    const statutory = structure.statutoryConfigs?.find(
      (c) => c.stateCode === input.stateCode,
    );
    if (!statutory) {
      throw new BadRequestException(
        `No statutory config found for state ${input.stateCode}`,
      );
    }

    const warnings: string[] = [];
    const minimumWage = Number(statutory.minimumWage) || 0;

    // Seed the context with input values
    const ctx: Record<string, number> = {
      ACTUAL_GROSS: input.gross,
      GROSS: input.gross,
      LOP_DAYS: input.lopDays,
      MINIMUM_WAGE: minimumWage,
    };

    // Minimum-wage warning
    if (
      statutory.warnIfGrossBelowMinWage &&
      minimumWage > 0 &&
      input.gross < minimumWage
    ) {
      warnings.push(
        `Gross Salary (${input.gross}) is below the applicable Minimum Wage (${minimumWage}). Please review wage fixation.`,
      );
    }

    // ── Evaluate each component in displayOrder ───────────────────────────
    const components = (structure.components || [])
      .filter((c) => c.isActive)
      .sort((a, b) => a.displayOrder - b.displayOrder);

    for (const comp of components) {
      try {
        const amount = this.calculateComponent(comp, ctx);
        ctx[comp.code] = amount;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Calc error [${comp.code}]: ${msg}`);
        warnings.push(`Component ${comp.code}: ${msg}`);
        ctx[comp.code] = 0;
      }
    }

    // ── Statutory deductions ──────────────────────────────────────────────
    if (statutory.enablePt) {
      ctx['PT'] = this.calculatePt(ctx['GROSS'] ?? input.gross, input.stateCode);
    }
    if (statutory.enablePf) {
      ctx['PF_EMPLOYEE'] = this.calculatePfEmployee(ctx, statutory);
      ctx['PF_EMPLOYER'] = this.calculatePfEmployer(ctx, statutory);
    }
    if (statutory.enableEsi) {
      ctx['ESI_EMPLOYEE'] = this.calculateEsi(
        ctx['GROSS'] ?? input.gross,
        Number(statutory.esiEmployeeRate),
        statutory,
      );
      ctx['ESI_EMPLOYER'] = this.calculateEsi(
        ctx['GROSS'] ?? input.gross,
        Number(statutory.esiEmployerRate),
        statutory,
      );
    }

    // ── Validation warnings ───────────────────────────────────────────────
    const basic = ctx['BASIC'] ?? 0;
    const hra = ctx['HRA'] ?? 0;
    if (basic > input.gross) {
      warnings.push(
        'Basic exceeds gross salary. Please review component configuration.',
      );
    }
    if (basic + hra > input.gross) {
      warnings.push(
        'HRA plus Basic exceeds gross salary. Please review wage split.',
      );
    }

    // ── Totals ────────────────────────────────────────────────────────────
    const totalEarnings = components
      .filter((c) => c.componentType === 'EARNING')
      .reduce((sum, c) => sum + (ctx[c.code] || 0), 0);

    const totalDeductions =
      (ctx['PT'] || 0) +
      (ctx['PF_EMPLOYEE'] || 0) +
      (ctx['ESI_EMPLOYEE'] || 0);

    const employerContributions =
      (ctx['PF_EMPLOYER'] || 0) + (ctx['ESI_EMPLOYER'] || 0);

    return {
      warnings,
      values: ctx,
      totalEarnings,
      totalDeductions,
      employerContributions,
      netPay: totalEarnings - totalDeductions,
    };
  }

  // ── Component evaluation ────────────────────────────────────────────────────

  private calculateComponent(
    comp: PayrollStructureComponentEntity,
    ctx: Record<string, number>,
  ): number {
    let amount = 0;

    switch (comp.calculationMethod) {
      case 'FIXED':
        amount = Number(comp.fixedValue ?? 0);
        break;

      case 'PERCENTAGE': {
        const base = ctx[comp.basedOn || ''] ?? 0;
        amount = (base * Number(comp.percentageValue ?? 0)) / 100;
        break;
      }

      case 'FORMULA':
      case 'CONDITIONAL_FIXED':
      case 'BALANCING': {
        const formula = comp.formula;
        if (!formula) {
          amount = 0;
          break;
        }
        // Use the safe tokenize→parse→evaluate pipeline
        amount = evaluateFormula(formula, {
          vars: ctx,
          param: (key: string) => ctx[key] ?? 0,
          earningsSum: () =>
            Object.entries(ctx)
              .filter(([k]) => k !== 'LOP_DAYS' && k !== 'MINIMUM_WAGE')
              .reduce((s, [, v]) => s + v, 0),
        });
        break;
      }

      default:
        amount = 0;
    }

    return this.applyRound(amount, comp.roundRule);
  }

  // ── Statutory helpers ───────────────────────────────────────────────────────

  /**
   * Professional Tax — slab-based per state.
   * Currently supports Telangana (TS). Extend with more states as needed.
   */
  private calculatePt(gross: number, stateCode: string): number {
    if (stateCode === 'TS') {
      if (gross <= 15000) return 0;
      if (gross <= 20000) return 150;
      return 200;
    }
    // Other states can be added here
    return 0;
  }

  private calculatePfEmployee(
    ctx: Record<string, number>,
    statutory: PayrollStatutoryConfigEntity,
  ): number {
    const gross = ctx['GROSS'] ?? ctx['ACTUAL_GROSS'] ?? 0;
    const threshold = Number(statutory.pfApplyIfGrossAbove) || 0;

    if (threshold > 0 && gross <= threshold) return 0;

    const basic = ctx['BASIC'] ?? 0;
    const pfWage = Math.min(basic, Number(statutory.pfWageCap));
    return Math.ceil((pfWage * Number(statutory.pfEmployeeRate)) / 100);
  }

  private calculatePfEmployer(
    ctx: Record<string, number>,
    statutory: PayrollStatutoryConfigEntity,
  ): number {
    // Employer PF = same wage base, typically 12% (includes EPS split)
    const gross = ctx['GROSS'] ?? ctx['ACTUAL_GROSS'] ?? 0;
    const threshold = Number(statutory.pfApplyIfGrossAbove) || 0;

    if (threshold > 0 && gross <= threshold) return 0;

    const basic = ctx['BASIC'] ?? 0;
    const pfWage = Math.min(basic, Number(statutory.pfWageCap));
    return Math.ceil((pfWage * Number(statutory.pfEmployeeRate)) / 100);
  }

  private calculateEsi(
    gross: number,
    rate: number,
    statutory: PayrollStatutoryConfigEntity,
  ): number {
    if (gross > Number(statutory.esiGrossCeiling)) return 0;
    return Math.ceil((gross * rate) / 100);
  }

  // ── Rounding ────────────────────────────────────────────────────────────────

  private applyRound(
    amount: number,
    rule: 'NONE' | 'ROUND' | 'ROUND_UP' | 'ROUND_DOWN',
  ): number {
    switch (rule) {
      case 'ROUND':
        return Math.round(amount);
      case 'ROUND_UP':
        return Math.ceil(amount);
      case 'ROUND_DOWN':
        return Math.floor(amount);
      default:
        return Number(amount.toFixed(2));
    }
  }
}
