import { BadRequestException } from '@nestjs/common';

export interface RateComponent {
  code: string;
  label: string;
  category: 'EARNING' | 'DEDUCTION' | 'EMPLOYER_COST' | 'BILLING_FEE';
  method: 'FIXED' | 'PERCENT' | 'HOURLY';
  value: number;
  basis?: string[];
  ceiling?: number;
  prorate: boolean;
}
export interface ContractorRateCard {
  divisor: number;
  rounding: 'RUPEE' | 'PAISE';
  components: RateComponent[];
}
export function validateRateCard(value: unknown): ContractorRateCard {
  const card = value as ContractorRateCard;
  if (
    !card ||
    !Number.isInteger(card.divisor) ||
    card.divisor < 1 ||
    card.divisor > 31 ||
    !['RUPEE', 'PAISE'].includes(card.rounding) ||
    !Array.isArray(card.components) ||
    !card.components.length ||
    card.components.length > 50
  )
    throw new BadRequestException(
      'Rate card needs a divisor (1–31), rounding and 1–50 components',
    );
  const codes = new Set<string>();
  for (const c of card.components) {
    if (
      !c ||
      !/^[A-Z][A-Z0-9_]{0,39}$/.test(c.code) ||
      codes.has(c.code) ||
      typeof c.label !== 'string' ||
      !c.label.trim() ||
      c.label.length > 120 ||
      !['EARNING', 'DEDUCTION', 'EMPLOYER_COST', 'BILLING_FEE'].includes(
        c.category,
      ) ||
      !['FIXED', 'PERCENT', 'HOURLY'].includes(c.method) ||
      typeof c.prorate !== 'boolean' ||
      typeof c.value !== 'number' ||
      !Number.isFinite(c.value) ||
      c.value < 0 ||
      c.value > 10000000 ||
      (c.method === 'PERCENT' && c.value > 100) ||
      (c.ceiling != null &&
        (typeof c.ceiling !== 'number' ||
          !Number.isFinite(c.ceiling) ||
          c.ceiling < 0))
    )
      throw new BadRequestException('Invalid or duplicate rate component');
    if (
      c.method === 'PERCENT' &&
      (!Array.isArray(c.basis) ||
        !c.basis.length ||
        new Set(c.basis).size !== c.basis.length ||
        c.basis.some((code) => !codes.has(code)))
    )
      throw new BadRequestException(
        'Percentage bases must reference unique preceding components',
      );
    if (c.method !== 'FIXED' && c.prorate)
      throw new BadRequestException(
        'Percentage components already use earned bases; do not prorate twice',
      );
    const requiredCategory = {
      BASIC_DA: 'EARNING',
      PF_EMP: 'DEDUCTION',
      ESI_EMP: 'DEDUCTION',
      PT: 'DEDUCTION',
      LWF_EMP: 'DEDUCTION',
      PF_ER: 'EMPLOYER_COST',
      ESI_ER: 'EMPLOYER_COST',
      LWF_ER: 'EMPLOYER_COST',
    }[c.code];
    if (requiredCategory && requiredCategory !== c.category)
      throw new BadRequestException('Incorrect category for ' + c.code);
    codes.add(c.code);
  }
  if (!card.components.some((c) => c.category === 'EARNING'))
    throw new BadRequestException('At least one earning is required');
  return card;
}
export function calculateRateCard(
  value: unknown,
  days: number,
  excludedCodes: string[] = [],
  overtimeHours = 0,
) {
  const card = validateRateCard(value);
  if (
    !Number.isFinite(overtimeHours) ||
    overtimeHours < 0 ||
    overtimeHours > 744
  )
    throw new BadRequestException('Invalid overtime hours');
  if (!Number.isFinite(days) || days < 0 || days > 31)
    throw new BadRequestException('Invalid payable days');
  const factor = card.rounding === 'RUPEE' ? 1 : 100;
  const round = (n: number) =>
    Math.round((n + Number.EPSILON) * factor) / factor;
  const amounts: Record<string, number> = {};
  const bases: Record<string, number> = {};
  const totals = {
    earnings: 0,
    deductions: 0,
    employerCosts: 0,
    billingFees: 0,
  };
  for (const c of card.components) {
    const base =
      c.method === 'FIXED'
        ? c.value
        : c.method === 'HOURLY'
          ? c.value * overtimeHours
          : (Math.min(
              c.basis!.reduce((n, code) => n + amounts[code], 0),
              c.ceiling ?? Infinity,
            ) *
              c.value) /
            100;
    bases[c.code] =
      c.method === 'PERCENT'
        ? Math.min(
            c.basis!.reduce((n, code) => n + amounts[code], 0),
            c.ceiling ?? Infinity,
          )
        : 0;
    if (excludedCodes.includes(c.code)) bases[c.code] = 0;
    const amount = excludedCodes.includes(c.code)
      ? 0
      : round(base * (c.prorate ? days / card.divisor : 1));
    amounts[c.code] = amount;
    const bucket = {
      EARNING: 'earnings',
      DEDUCTION: 'deductions',
      EMPLOYER_COST: 'employerCosts',
      BILLING_FEE: 'billingFees',
    }[c.category];
    totals[bucket] = round(totals[bucket] + amount);
  }
  return {
    amounts,
    bases,
    ...totals,
    netPay: round(totals.earnings - totals.deductions),
    billingTotal: round(
      totals.earnings + totals.employerCosts + totals.billingFees,
    ),
  };
}

export function calculateRateCardSegments(
  segments: Array<{ card: ContractorRateCard; days: number; hours: number }>,
  excludedCodes: string[] = [],
) {
  if (!segments.length)
    throw new BadRequestException('Attendance segments required');
  const usedBases: Record<string, number> = {};
  const results = segments.map((segment, index) => {
    const card = validateRateCard(segment.card);
    const adjusted = {
      ...card,
      components: card.components.map((c) => ({
        ...c,
        ...(c.ceiling != null
          ? { ceiling: Math.max(0, c.ceiling - (usedBases[c.code] || 0)) }
          : {}),
        ...(c.method === 'FIXED' && !c.prorate && index < segments.length - 1
          ? { value: 0 }
          : {}),
      })),
    };
    const result = calculateRateCard(
      adjusted,
      segment.days,
      excludedCodes,
      segment.hours,
    );
    for (const [code, base] of Object.entries(result.bases))
      usedBases[code] = (usedBases[code] || 0) + base;
    return result;
  });
  const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  const combined = {
    amounts: {} as Record<string, number>,
    bases: {} as Record<string, number>,
    earnings: 0,
    deductions: 0,
    employerCosts: 0,
    billingFees: 0,
    netPay: 0,
    billingTotal: 0,
  };
  for (const result of results) {
    for (const key of [
      'earnings',
      'deductions',
      'employerCosts',
      'billingFees',
      'netPay',
      'billingTotal',
    ] as const)
      combined[key] = round(combined[key] + result[key]);
    for (const key of ['amounts', 'bases'] as const)
      for (const [code, value] of Object.entries(result[key]))
        combined[key][code] = round((combined[key][code] || 0) + value);
  }
  return combined;
}
