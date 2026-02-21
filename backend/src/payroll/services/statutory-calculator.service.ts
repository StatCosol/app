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
  }): { values: Record<string, number> } {
    const { values, setup, components } = params;
    const result = { ...values };

    // Compute wage bases from component flags
    let pfWage = 0;
    let esiWage = 0;
    let gross = 0;

    for (const comp of components) {
      const val = result[comp.code] ?? 0;
      if (comp.componentType === 'EARNING') {
        gross += val;
        if (comp.affectsPfWage) pfWage += val;
        if (comp.affectsEsiWage) esiWage += val;
      }
    }

    result['GROSS'] = gross;

    // ── PF ──
    if (setup.pfEnabled) {
      if (pfWage === 0) pfWage = gross; // fallback

      const ceiling = Number(setup.pfWageCeiling) || 15000;
      const cappedPfWage = Math.min(pfWage, ceiling);
      const eeRate = Number(setup.pfEmployeeRate) || 12;
      const erRate = Number(setup.pfEmployerRate) || 12;

      const pfEmp = Math.ceil((cappedPfWage * eeRate) / 100);

      // EPS: statutory ceiling always ₹15,000
      const epsWage = Math.min(pfWage, 15000);
      const epsContrib = Math.ceil((epsWage * 8.33) / 100);

      const totalErPf = Math.ceil((cappedPfWage * erRate) / 100);
      const pfDiff = Math.max(0, totalErPf - epsContrib);

      result['PF_WAGES'] = pfWage;
      result['PF_EMP'] = pfEmp;
      result['PF_ER'] = totalErPf;
      result['PF_EPS'] = epsContrib;
      result['PF_DIFF'] = pfDiff;
    }

    // ── ESI ──
    if (setup.esiEnabled) {
      if (esiWage === 0) esiWage = gross; // fallback

      const threshold = Number(setup.esiWageCeiling) || 21000;
      result['ESI_WAGES'] = esiWage;

      if (esiWage <= threshold) {
        const eeRate = Number(setup.esiEmployeeRate) || 0.75;
        const erRate = Number(setup.esiEmployerRate) || 3.25;
        result['ESI_EMP'] = Math.ceil((esiWage * eeRate) / 100);
        result['ESI_ER'] = Math.ceil((esiWage * erRate) / 100);
      } else {
        result['ESI_EMP'] = 0;
        result['ESI_ER'] = 0;
      }
    }

    return { values: result };
  }
}
