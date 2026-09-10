import { Injectable } from '@nestjs/common';
import { StateSlabService } from './state-slab.service';

/**
 * StateStatutoryService
 *
 * Applies state-aware statutory deductions (PT, LWF) per employee.
 * Uses StateSlabService to resolve slab-based amounts from the DB.
 *
 * Component codes produced:
 *   PT       (DEDUCTION)           – Professional Tax
 *   LWF_EMP  (DEDUCTION)           – Labour Welfare Fund (employee)
 *   LWF_ER   (EMPLOYER_CONTRIBUTION) – Labour Welfare Fund (employer)
 */
@Injectable()
export class StateStatutoryService {
  constructor(private readonly slab: StateSlabService) {}

  async applyStateDeductions(params: {
    clientId: string;
    stateCode: string;
    values: Record<string, number>;
    ptEnabled: boolean;
    lwfEnabled: boolean;
    /**
     * The payroll period, YYYY-MM-DD, so a slab revision applies from the month
     * it took effect rather than to every month ever reprocessed after it.
     */
    asOfDate?: string;
  }): Promise<Record<string, number>> {
    const { clientId, stateCode, values, ptEnabled, lwfEnabled, asOfDate } =
      params;
    const gross = Number(values['GROSS'] ?? 0);

    // ── PT ──
    if (ptEnabled && stateCode) {
      const pt = await this.slab.resolveAmount({
        clientId,
        stateCode: stateCode || 'ALL',
        componentCode: 'PT',
        baseAmount: gross,
        asOfDate,
      });
      values['PT'] = Math.ceil(pt);
    }

    // ── LWF ──
    if (lwfEnabled && stateCode) {
      const lwfEmp = await this.slab.resolveAmount({
        clientId,
        stateCode: stateCode || 'ALL',
        componentCode: 'LWF_EMP',
        baseAmount: gross,
        asOfDate,
      });
      const lwfEr = await this.slab.resolveAmount({
        clientId,
        stateCode: stateCode || 'ALL',
        componentCode: 'LWF_ER',
        baseAmount: gross,
        asOfDate,
      });
      values['LWF_EMP'] = Math.ceil(lwfEmp);
      values['LWF_ER'] = Math.ceil(lwfEr);
    }

    return values;
  }
}
