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
  }): { values: Record<string, number> } {
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

    result['GROSS'] = gross;

    // When employee had 0 payable days (e.g. only prior-period arrears),
    // no current-month wages apply – skip PF/ESI
    const payableDays = result['PAYABLE_DAYS'];
    if (payableDays === 0) {
      pfWage = 0;
      esiWage = 0;
    }

    // ── PF ──
    if (setup.pfEnabled && empPfApplicable !== false) {
      // Check PF gross threshold — skip PF when gross is at or below the threshold
      const pfGrossThreshold = Number(setup.pfGrossThreshold) || 0;
      const pfApplicable = pfGrossThreshold === 0 || gross >= pfGrossThreshold;

      if (pfApplicable) {
        if (pfWage === 0 && !anyPfFlagSet) pfWage = gross; // fallback only when no flags configured

        const ceiling = Number(setup.pfWageCeiling) || 15000;
        const cappedPfWage = Math.min(pfWage, ceiling);
        const eeRate = Number(setup.pfEmployeeRate) || 12;
        const erRate = Number(setup.pfEmployerRate) || 12;

        const pfEmp = (cappedPfWage * eeRate) / 100;

        // EPS: statutory ceiling always ₹15,000
        const epsWage = Math.min(pfWage, 15000);
        const epsContrib = (epsWage * 8.33) / 100;

        const totalErPf = (cappedPfWage * erRate) / 100;
        const pfDiff = Math.max(0, totalErPf - epsContrib);

        result['PF_WAGES'] = pfWage;
        result['PF_EMP'] = pfEmp;
        result['PF_ER'] = totalErPf;
        result['PF_EPS'] = epsContrib;
        result['PF_DIFF'] = pfDiff;

        // When the employee's registered gross (ACTUAL_GROSS) meets or exceeds the PF gross
        // threshold (or > 25 000 when no threshold is set), employer PF is also deducted from
        // the employee's salary.
        const actualGross = result['ACTUAL_GROSS'] ?? 0;
        if (pfGrossThreshold > 0) {
          result['PF_ER_FROM_EMP'] = actualGross >= pfGrossThreshold ? totalErPf : 0;
        } else {
          result['PF_ER_FROM_EMP'] = actualGross > 25000 ? totalErPf : 0;
        }
      } else {
        result['PF_WAGES'] = 0;
        result['PF_EMP'] = 0;
        result['PF_ER'] = 0;
        result['PF_EPS'] = 0;
        result['PF_DIFF'] = 0;
        result['PF_ER_FROM_EMP'] = 0;
      }
    } else {
      // PF not enabled at client level, or employee PF not applicable
      result['PF_WAGES'] = 0;
      result['PF_EMP'] = 0;
      result['PF_ER'] = 0;
      result['PF_EPS'] = 0;
      result['PF_DIFF'] = 0;
      result['PF_ER_FROM_EMP'] = 0;
    }

    // ── ESI ──
    if (setup.esiEnabled && empEsiApplicable !== false) {
      if (esiWage === 0 && !anyEsiFlagSet) esiWage = gross; // fallback only when no flags configured

      const threshold = Number(setup.esiWageCeiling) || 21000;
      result['ESI_WAGES'] = esiWage;

      if (esiWage <= threshold) {
        const eeRate = Number(setup.esiEmployeeRate) || 0.75;
        const erRate = Number(setup.esiEmployerRate) || 3.25;
        result['ESI_EMP'] = (esiWage * eeRate) / 100;
        result['ESI_ER'] = (esiWage * erRate) / 100;
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

    return { values: result };
  }
}
