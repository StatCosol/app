import { Injectable } from '@nestjs/common';
import { PayrollComponentEntity } from '../entities/payroll-component.entity';

interface ComputeWageBasesParams {
  values: Record<string, number>;
  components: PayrollComponentEntity[];
}

interface WageBaseResult {
  pfWage: number;
  esiWage: number;
  gross: number;
}

@Injectable()
export class WageBaseService {
  computeWageBases(params: ComputeWageBasesParams): WageBaseResult {
    const { values, components } = params;

    let pfWage = 0;
    let esiWage = 0;
    let gross = 0;

    for (const comp of components) {
      if (comp.componentType !== 'EARNING') {
        continue;
      }

      const amount = values[comp.code] ?? 0;
      if (amount === 0) {
        continue;
      }

      gross += amount;

      if (comp.affectsPfWage) {
        pfWage += amount;
      }
      if (comp.affectsEsiWage) {
        esiWage += amount;
      }
    }

    // Fallback: if no components flag PF/ESI wage, use gross
    if (pfWage === 0 && gross > 0) {
      pfWage = gross;
    }
    if (esiWage === 0 && gross > 0) {
      esiWage = gross;
    }

    return { pfWage, esiWage, gross };
  }
}
