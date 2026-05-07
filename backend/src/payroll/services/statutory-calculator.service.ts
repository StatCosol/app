import { Injectable } from '@nestjs/common';
import { PayrollClientSetupEntity } from '../entities/payroll-client-setup.entity';
import { PayrollComponentEntity } from '../entities/payroll-component.entity';

/**
 * StatutoryCalculatorService
 *
 * Pure computation service for PF and ESI.
 * Reads rates/ceilings from PayrollClientSetupEntity,
 * determines wage bases from component flags, and returns
 * updated values map with statutory component codes:
 *
 *   PF_WAGES  (INFO)     – uncapped PF wage base
 *   PF_EMP    (DEDUCTION) – employee PF
 *   PF_ER     (EMPLOYER)  – employer PF (total)
 *   PF_EPS    (INFO)      – EPS split (for ECR)
 *   PF_DIFF   (INFO)      – EPF A/c 1 diff (for ECR)
 *   PF_ER_FROM_EMP (DEDUCTION) – employer PF borne by employee when ACTUAL_GROSS > 25 000
 *
 *   ESI_WAGES (INFO)       – ESI wage base
 *   ESI_EMP   (DEDUCTION)  – employee ESI
 *   ESI_ER    (EMPLOYER)   – employer ESI
 *
 *   GROSS     (INFO)       – sum of all EARNING components
 */
@Injectable()
export class StatutoryCalculatorService {
  compute(params: {
    values: Record<string, number>;
    setup: PayrollClientSetupEntity;
    components: PayrollComponentEntity[];
    pfApplicable?: boolean;
    esiApplicable?: boolean;
    pfServiceStartDate?: string | null;
    basicAtPfStart?: number | null;
    /**
     * Payroll period month (1-12). Used to apply the ESI contribution-period rule:
     *   April (4) starts H1 (Apr-Sep); October (10) starts H2 (Oct-Mar).
     *   If the employee's ESI wage exceeds the threshold:
     *     - At a period-start month → ESI is dropped for the period (and caller is
     *       expected to flip the master `esiApplicable` flag off).
     *     - In a mid-period month → ESI continues but capped at the threshold
     *       (statutory max wage) until the period ends.
     */
    periodMonth?: number;
  }): { values: Record<string, number>; esiDroppedAtPeriodStart?: boolean } {
    const { values, setup, components } = params;
    const empPfApplicable = params.pfApplicable;
    const empEsiApplicable = params.esiApplicable;
    const result = { ...values };

    // Compute wage bases from component flags
    let pfWage = 0;
    let esiWage = 0;
    let gross = 0;
    let anyPfFlagSet = false;
    let anyEsiFlagSet = false;

    for (const comp of components) {
      const val = result[comp.code] ?? 0;
      if (comp.componentType === 'EARNING') {
        gross += val;
        if (comp.affectsPfWage) {
          pfWage += val;
          anyPfFlagSet = true;
        }
        if (comp.affectsEsiWage) {
          esiWage += val;
          anyEsiFlagSet = true;
        }
      }
    }

    // OT_AMOUNT is not part of the EARNING components loop above (it's
    // injected separately by the engine / processing service). Per business
    // rule it is folded into the earned GROSS (so PT/LWF slabs see the true
    // gross including overtime) and into the ESI wage base (per ESIC, ESI
    // is payable on overtime). PF wage explicitly excludes OT.
    const otAmountForEsi = Number(result['OT_AMOUNT'] ?? 0);
    result['GROSS'] = gross + otAmountForEsi;
    if (otAmountForEsi > 0) {
      esiWage += otAmountForEsi;
      anyEsiFlagSet = true;
    }

    // When employee had 0 payable days (e.g. only prior-period arrears),
    // no current-month wages apply – skip PF/ESI
    const payableDays = result['PAYABLE_DAYS'];
    if (payableDays === 0) {
      pfWage = 0;
      esiWage = 0;
    }

    // ── PF ──
    if (setup.pfEnabled && empPfApplicable !== false) {
      // pfGrossThreshold no longer skips basic PF — it only controls whether
      // the employer share is also recovered from the employee (PF_ER_FROM_EMP below).
      // Basic 12% of capped basic always applies when PF is enabled for the employee.
      const pfGrossThreshold = Number(setup.pfGrossThreshold) || 0;
      const pfApplicable = true;

      if (pfApplicable) {
        if (pfWage === 0 && !anyPfFlagSet) pfWage = gross; // fallback only when no flags configured

        const ceiling = Number(setup.pfWageCeiling) || 15000;
        const cappedPfWage = Math.min(pfWage, ceiling);
        const eeRate = Number(setup.pfEmployeeRate) || 12;
        const erRate = Number(setup.pfEmployerRate) || 12;

        const pfEmp = (cappedPfWage * eeRate) / 100;

        // EPS exclusion rule: joined after September 2014 with basic > ₹15,000
        // → not covered under EPS; full employer PF goes to EPF (diff), pension = 0
        const EPS_CUTOFF = new Date('2014-10-01');
        const epsExcluded =
          !!params.pfServiceStartDate &&
          new Date(params.pfServiceStartDate) >= EPS_CUTOFF &&
          (params.basicAtPfStart ?? 0) > 15000;

        // EPS: statutory ceiling always ₹15,000
        const epsWage = epsExcluded ? 0 : Math.min(pfWage, 15000);
        const epsContrib = epsExcluded ? 0 : (epsWage * 8.33) / 100;

        const totalErPf = (cappedPfWage * erRate) / 100;
        const pfDiff = epsExcluded
          ? totalErPf
          : Math.max(0, totalErPf - epsContrib);

        result['PF_WAGES'] = pfWage;
        result['PF_EMP'] = Math.ceil(pfEmp);
        result['PF_ER'] = Math.ceil(totalErPf);
        result['PF_EPS'] = Math.ceil(epsContrib);
        result['PF_DIFF'] = Math.ceil(pfDiff);
        result['EPS_WAGES'] = epsWage;

        // When the employee's registered gross (ACTUAL_GROSS) meets or exceeds the PF gross
        // threshold (or >= 25 000 when no threshold is set), employer PF is also deducted from
        // the employee's salary so that total PF deduction reaches 25% of the capped basic.
        const actualGross = result['ACTUAL_GROSS'] ?? 0;
        if (pfGrossThreshold > 0) {
          result['PF_ER_FROM_EMP'] =
            actualGross >= pfGrossThreshold ? Math.ceil(totalErPf) : 0;
        } else {
          result['PF_ER_FROM_EMP'] =
            actualGross >= 25000 ? Math.ceil(totalErPf) : 0;
        }
      } else {
        result['PF_WAGES'] = 0;
        result['PF_EMP'] = 0;
        result['PF_ER'] = 0;
        result['PF_EPS'] = 0;
        result['PF_DIFF'] = 0;
        result['EPS_WAGES'] = 0;
        result['PF_ER_FROM_EMP'] = 0;
      }
    } else {
      // PF not enabled at client level, or employee PF not applicable
      result['PF_WAGES'] = 0;
      result['PF_EMP'] = 0;
      result['PF_ER'] = 0;
      result['PF_EPS'] = 0;
      result['PF_DIFF'] = 0;
      result['EPS_WAGES'] = 0;
      result['PF_ER_FROM_EMP'] = 0;
    }

    // ── ESI ──
    let esiDroppedAtPeriodStart = false;
    if (setup.esiEnabled && empEsiApplicable !== false) {
      if (esiWage === 0 && !anyEsiFlagSet) esiWage = gross; // fallback only when no flags configured

      const threshold = Number(setup.esiWageCeiling) || 21000;
      result['ESI_WAGES'] = esiWage;

      // ESI contribution-period rule (statutory, India):
      //   Two periods — April–September (H1) and October–March (H2).
      //   If wage exceeds the threshold:
      //     - At the start of a period (April or October) the employee is removed
      //       from ESI for that entire period.
      //     - Mid-period, ESI continues to be deducted on the threshold (capped)
      //       until the period ends.
      const periodMonth = params.periodMonth;
      const isPeriodStart = periodMonth === 4 || periodMonth === 10;
      let effectiveEsiWage = esiWage;
      if (esiWage > threshold) {
        if (isPeriodStart) {
          effectiveEsiWage = 0;
          esiDroppedAtPeriodStart = true;
        } else {
          effectiveEsiWage = threshold;
        }
      }

      if (effectiveEsiWage > 0) {
        const eeRate = Number(setup.esiEmployeeRate) || 0.75;
        const erRate = Number(setup.esiEmployerRate) || 3.25;
        result['ESI_EMP'] = Math.ceil((effectiveEsiWage * eeRate) / 100);
        result['ESI_ER'] = Math.ceil((effectiveEsiWage * erRate) / 100);
      } else {
        result['ESI_EMP'] = 0;
        result['ESI_ER'] = 0;
      }
    } else {
      // ESI not enabled at client level, or employee ESI not applicable
      result['ESI_WAGES'] = 0;
      result['ESI_EMP'] = 0;
      result['ESI_ER'] = 0;
    }

    return esiDroppedAtPeriodStart
      ? { values: result, esiDroppedAtPeriodStart: true }
      : { values: result };
  }
}
