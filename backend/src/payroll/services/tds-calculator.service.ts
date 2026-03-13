import { Injectable } from '@nestjs/common';

/**
 * India Income Tax (TDS) Calculator
 *
 * Supports both Old and New tax regimes as per Finance Act.
 * New regime is default from FY 2023-24 onwards.
 *
 * New Regime FY 2025-26 slabs:
 *   0 – 4,00,000:      Nil
 *   4,00,001 – 8,00,000:    5%
 *   8,00,001 – 12,00,000:   10%
 *   12,00,001 – 16,00,000:  15%
 *   16,00,001 – 20,00,000:  20%
 *   20,00,001 – 24,00,000:  25%
 *   Above 24,00,000:        30%
 *   Standard deduction: ₹75,000
 *   Rebate u/s 87A: Full rebate if taxable ≤ ₹12,00,000
 *
 * Old Regime slabs:
 *   0 – 2,50,000:      Nil
 *   2,50,001 – 5,00,000:   5%
 *   5,00,001 – 10,00,000:  20%
 *   Above 10,00,000:       30%
 *   Standard deduction: ₹50,000
 *   Rebate u/s 87A: ₹12,500 if taxable ≤ ₹5,00,000
 */

interface TdsInput {
  /** Annual gross salary (CTC-based or projected) */
  annualGross: number;
  /** 'OLD' | 'NEW' (default: 'NEW') */
  regime?: 'OLD' | 'NEW';
  /** Section 80C deductions (PPF, ELSS, LIC, etc.) — old regime only */
  deduction80C?: number;
  /** Section 80D (medical insurance) — old regime only */
  deduction80D?: number;
  /** Section 24b (home loan interest) — old regime only */
  deduction24b?: number;
  /** HRA exemption — old regime only */
  hraExemption?: number;
  /** Other Chapter VI-A deductions — old regime only */
  otherDeductions?: number;
  /** TDS already paid in FY so far */
  tdsAlreadyPaid?: number;
  /** Months remaining in FY */
  remainingMonths?: number;
}

export interface TdsResult {
  regime: 'OLD' | 'NEW';
  annualGross: number;
  standardDeduction: number;
  totalExemptions: number;
  taxableIncome: number;
  taxBeforeCess: number;
  cess: number;
  totalTaxLiability: number;
  rebate87A: number;
  netTaxAfterRebate: number;
  tdsAlreadyPaid: number;
  balanceTax: number;
  monthlyTds: number;
  slabBreakdown: { slab: string; rate: number; tax: number }[];
}

const NEW_REGIME_SLABS = [
  { from: 0, to: 400000, rate: 0 },
  { from: 400001, to: 800000, rate: 5 },
  { from: 800001, to: 1200000, rate: 10 },
  { from: 1200001, to: 1600000, rate: 15 },
  { from: 1600001, to: 2000000, rate: 20 },
  { from: 2000001, to: 2400000, rate: 25 },
  { from: 2400001, to: Infinity, rate: 30 },
];

const OLD_REGIME_SLABS = [
  { from: 0, to: 250000, rate: 0 },
  { from: 250001, to: 500000, rate: 5 },
  { from: 500001, to: 1000000, rate: 20 },
  { from: 1000001, to: Infinity, rate: 30 },
];

@Injectable()
export class TdsCalculatorService {
  calculate(input: TdsInput): TdsResult {
    const regime = input.regime ?? 'NEW';
    const annualGross = input.annualGross;
    const remainingMonths = input.remainingMonths ?? 12;
    const tdsAlreadyPaid = input.tdsAlreadyPaid ?? 0;

    let standardDeduction: number;
    let totalExemptions = 0;
    let slabs: typeof NEW_REGIME_SLABS;

    if (regime === 'NEW') {
      standardDeduction = 75000;
      slabs = NEW_REGIME_SLABS;
      // New regime: no exemptions/deductions allowed
    } else {
      standardDeduction = 50000;
      slabs = OLD_REGIME_SLABS;
      // Old regime: aggregate all exemptions
      const d80c = Math.min(input.deduction80C ?? 0, 150000); // 80C cap ₹1.5L
      const d80d = Math.min(input.deduction80D ?? 0, 100000); // 80D cap ₹1L
      const d24b = Math.min(input.deduction24b ?? 0, 200000); // 24b cap ₹2L
      const hra = input.hraExemption ?? 0;
      const other = input.otherDeductions ?? 0;
      totalExemptions = d80c + d80d + d24b + hra + other;
    }

    const taxableIncome = Math.max(
      0,
      annualGross - standardDeduction - totalExemptions,
    );

    // Slab-based tax
    const slabBreakdown: TdsResult['slabBreakdown'] = [];
    let taxBeforeCess = 0;

    for (const slab of slabs) {
      if (taxableIncome < slab.from) break;
      const taxableInSlab =
        Math.min(
          taxableIncome,
          slab.to === Infinity ? taxableIncome : slab.to,
        ) -
        slab.from +
        1;
      if (taxableInSlab <= 0) continue;

      const slabTax = Math.floor((taxableInSlab * slab.rate) / 100);
      taxBeforeCess += slabTax;

      const label =
        slab.to === Infinity
          ? `Above ₹${(slab.from - 1).toLocaleString('en-IN')}`
          : `₹${slab.from.toLocaleString('en-IN')} – ₹${slab.to.toLocaleString('en-IN')}`;
      slabBreakdown.push({ slab: label, rate: slab.rate, tax: slabTax });
    }

    // Rebate u/s 87A
    let rebate87A = 0;
    if (regime === 'NEW' && taxableIncome <= 1200000) {
      rebate87A = taxBeforeCess; // Full rebate
    } else if (regime === 'OLD' && taxableIncome <= 500000) {
      rebate87A = Math.min(taxBeforeCess, 12500);
    }

    const taxAfterRebate = Math.max(0, taxBeforeCess - rebate87A);

    // Health & Education Cess: 4%
    const cess = Math.ceil(taxAfterRebate * 0.04);
    const totalTaxLiability = taxAfterRebate + cess;
    const netTaxAfterRebate = totalTaxLiability;

    // Monthly TDS
    const balanceTax = Math.max(0, totalTaxLiability - tdsAlreadyPaid);
    const monthlyTds =
      remainingMonths > 0 ? Math.ceil(balanceTax / remainingMonths) : 0;

    return {
      regime,
      annualGross,
      standardDeduction,
      totalExemptions,
      taxableIncome,
      taxBeforeCess,
      cess,
      totalTaxLiability,
      rebate87A,
      netTaxAfterRebate,
      tdsAlreadyPaid,
      balanceTax,
      monthlyTds,
      slabBreakdown,
    };
  }

  /**
   * Compare tax under both regimes and recommend the lower one.
   */
  compareBothRegimes(input: Omit<TdsInput, 'regime'>): {
    old: TdsResult;
    new: TdsResult;
    recommended: 'OLD' | 'NEW';
    savings: number;
  } {
    const oldResult = this.calculate({ ...input, regime: 'OLD' });
    const newResult = this.calculate({ ...input, regime: 'NEW' });
    const recommended =
      oldResult.totalTaxLiability <= newResult.totalTaxLiability
        ? 'OLD'
        : 'NEW';
    const savings = Math.abs(
      oldResult.totalTaxLiability - newResult.totalTaxLiability,
    );
    return { old: oldResult, new: newResult, recommended, savings };
  }
}
