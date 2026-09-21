import { BadRequestException } from '@nestjs/common';
import {
  evaluateFormula,
  FORMULA_VARIABLES,
  FormulaError,
  FormulaNode,
  formulaReferences,
  parseFormula,
} from './contractor-quotation-formula';

export interface RateComponent {
  code: string;
  label: string;
  /**
   * SUBTOTAL lines (derived wage, "Sub Total 2", manpower cost…) are worked
   * out so later lines can use them; they are neither paid nor billed.
   */
  category:
    | 'EARNING'
    | 'DEDUCTION'
    | 'EMPLOYER_COST'
    | 'BILLING_FEE'
    | 'SUBTOTAL';
  method: 'FIXED' | 'PERCENT' | 'HOURLY' | 'FORMULA';
  /** Amount, percentage or hourly rate; unused by FORMULA lines. */
  value: number;
  basis?: string[];
  ceiling?: number;
  /** FORMULA lines only: an Excel-style formula over earlier line codes. */
  formula?: string;
  /**
   * EARNING lines only; default true. False when the worker is paid the line
   * but the client is billed for it through a separate employer-cost line
   * (a vendor paying leave on one base and billing it on another).
   */
  billable?: boolean;
  prorate: boolean;
}
export interface ContractorRateCard {
  /**
   * Optional. Payroll runs prorate by the wage month's working days (calendar
   * days excluding Sundays) and ignore any stored value; older cards may still
   * carry one, which must then be 1–31.
   */
  divisor?: number | null;
  rounding: 'RUPEE' | 'PAISE';
  components: RateComponent[];
}

const CATEGORIES = [
  'EARNING',
  'DEDUCTION',
  'EMPLOYER_COST',
  'BILLING_FEE',
  'SUBTOTAL',
];
const METHODS = ['FIXED', 'PERCENT', 'HOURLY', 'FORMULA'];

interface Analysis {
  trees: Map<string, FormulaNode>;
  /** Changes with payable days or overtime within a month. */
  varies: Set<string>;
  usesFull: boolean;
}

function analyse(card: ContractorRateCard): Analysis {
  const trees = new Map<string, FormulaNode>();
  const varies = new Set<string>();
  let usesFull = false;
  for (const c of card.components) {
    if (c.method === 'FORMULA') {
      const tree = parseFormula(c.formula!);
      trees.set(c.code, tree);
      const refs = formulaReferences(tree);
      usesFull ||= refs.full.size > 0;
      if (
        c.prorate ||
        refs.direct.has('DAYS') ||
        refs.direct.has('OT_HOURS') ||
        [...refs.direct].some((code) => varies.has(code))
      )
        varies.add(c.code);
    } else if (
      c.prorate ||
      c.method === 'HOURLY' ||
      (c.method === 'PERCENT' && c.basis!.some((code) => varies.has(code)))
    )
      varies.add(c.code);
  }
  return { trees, varies, usesFull };
}

export function validateRateCard(value: unknown): ContractorRateCard {
  const card = value as ContractorRateCard;
  if (
    !card ||
    (card.divisor != null &&
      (!Number.isInteger(card.divisor) ||
        card.divisor < 1 ||
        card.divisor > 31)) ||
    !['RUPEE', 'PAISE'].includes(card.rounding) ||
    !Array.isArray(card.components) ||
    !card.components.length ||
    card.components.length > 80
  )
    throw new BadRequestException(
      'Rate card needs rounding and 1–80 components; a divisor, if given, must be 1–31',
    );
  const codes = new Set<string>();
  const varies = new Set<string>();
  for (const c of card.components) {
    if (
      !c ||
      !/^[A-Z][A-Z0-9_]{0,39}$/.test(c.code) ||
      codes.has(c.code) ||
      (FORMULA_VARIABLES as readonly string[]).includes(c.code) ||
      typeof c.label !== 'string' ||
      !c.label.trim() ||
      c.label.length > 120 ||
      !CATEGORIES.includes(c.category) ||
      !METHODS.includes(c.method) ||
      typeof c.prorate !== 'boolean' ||
      (c.billable != null &&
        (typeof c.billable !== 'boolean' || c.category !== 'EARNING')) ||
      (c.method === 'FORMULA'
        ? typeof c.formula !== 'string' ||
          (c.value != null && typeof c.value !== 'number')
        : typeof c.value !== 'number' ||
          !Number.isFinite(c.value) ||
          c.value < 0 ||
          c.value > 10000000 ||
          (c.method === 'PERCENT' && c.value > 100)) ||
      (c.ceiling != null &&
        (typeof c.ceiling !== 'number' ||
          !Number.isFinite(c.ceiling) ||
          c.ceiling < 0))
    )
      throw new BadRequestException(
        `Invalid or duplicate rate component${c?.code ? ' ' + c.code : ''}`,
      );
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
    if (c.method === 'FORMULA') {
      let refs: ReturnType<typeof formulaReferences>;
      try {
        refs = formulaReferences(parseFormula(c.formula!));
      } catch (e) {
        throw new BadRequestException(
          `Formula for ${c.code}: ${e instanceof FormulaError ? e.message : 'invalid'}`,
        );
      }
      const unknown = [...refs.direct, ...refs.full].filter(
        (name) =>
          !codes.has(name) &&
          !(FORMULA_VARIABLES as readonly string[]).includes(name),
      );
      if (unknown.length || [...refs.full].some((name) => !codes.has(name)))
        throw new BadRequestException(
          `Formula for ${c.code} must use earlier line codes or ${FORMULA_VARIABLES.join(', ')}; unknown: ${unknown.join(', ') || [...refs.full].join(', ')}`,
        );
      const scaledInput =
        refs.direct.has('DAYS') ||
        refs.direct.has('OT_HOURS') ||
        [...refs.direct].some((code) => varies.has(code));
      if (c.prorate && scaledInput)
        throw new BadRequestException(
          `Formula for ${c.code} already uses attendance-based amounts; do not prorate it again`,
        );
      if (c.prorate || scaledInput) varies.add(c.code);
    } else {
      if (c.method !== 'FIXED' && c.prorate)
        throw new BadRequestException(
          'Percentage components already use earned bases; do not prorate twice',
        );
      if (
        c.prorate ||
        c.method === 'HOURLY' ||
        (c.method === 'PERCENT' && c.basis!.some((code) => varies.has(code)))
      )
        varies.add(c.code);
    }
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

/** Whether the card pays overtime (an HOURLY line or a formula on OT_HOURS). */
export function rateCardPaysOvertime(card: ContractorRateCard | null) {
  return !!card?.components.some(
    (c) =>
      c.method === 'HOURLY' ||
      (c.method === 'FORMULA' &&
        formulaReferences(parseFormula(c.formula!)).direct.has('OT_HOURS')),
  );
}

/**
 * What the earlier parts of a month (split by a dated quotation revision)
 * have already reached, so this part is charged only the difference.
 */
export interface RateCardCarry {
  /** Running totals of the lines that follow attendance. */
  values: Record<string, number>;
  bases: Record<string, number>;
  days: number;
  hours: number;
}

export function calculateRateCard(
  value: unknown,
  days: number,
  excludedCodes: string[] = [],
  overtimeHours = 0,
  options: { chargeMonthlyAmounts?: boolean } = {},
) {
  return calculateRateCardPart(
    value,
    days,
    excludedCodes,
    overtimeHours,
    options,
  ).result;
}

function calculateRateCardPart(
  value: unknown,
  days: number,
  excludedCodes: string[],
  overtimeHours: number,
  options: { chargeMonthlyAmounts?: boolean; carry?: RateCardCarry },
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
  const analysis = analyse(card);
  if (
    !card.divisor &&
    card.components.some(
      (c) =>
        c.prorate ||
        (c.method === 'FORMULA' &&
          formulaReferences(analysis.trees.get(c.code)!).direct.has(
            'WORKING_DAYS',
          )),
    )
  )
    throw new BadRequestException(
      "Prorated components need the wage month's working days as the divisor",
    );
  // FULL(X) reads X for a whole month with no overtime.
  const full = analysis.usesFull
    ? run(card, analysis, card.divisor ?? days, 0, excludedCodes, true, null)
    : null;
  return run(
    card,
    analysis,
    days,
    overtimeHours,
    excludedCodes,
    options.chargeMonthlyAmounts ?? true,
    full,
    options.carry,
  );
}

function run(
  card: ContractorRateCard,
  analysis: Analysis,
  days: number,
  overtimeHours: number,
  excludedCodes: string[],
  chargeMonthlyAmounts: boolean,
  full: { values: Record<string, number> } | null,
  carry?: RateCardCarry,
) {
  const factor = card.rounding === 'RUPEE' ? 1 : 100;
  const round = (n: number) =>
    Math.round((n + Number.EPSILON) * factor) / factor;
  const paise = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  const amounts: Record<string, number> = {};
  // What later lines read: the rounded amount, except subtotals, which keep
  // full precision the way the vendor's own sheet carries them.
  const values: Record<string, number> = {};
  const bases: Record<string, number> = {};
  // Lines that follow attendance, as totals for the month so far (earlier
  // parts plus this one). A line calculated from them — PF capped at 15,000,
  // ESI above a threshold, a percentage — is worked out on those totals and
  // this part charged the difference, so a month split by a revision comes to
  // what the whole month would. Without a carry they equal this part's own.
  const cumulative: Record<string, number> = {};
  const cumulativeBases: Record<string, number> = {};
  const before = (code: string) => carry?.values[code] ?? 0;
  const totals = {
    earnings: 0,
    deductions: 0,
    employerCosts: 0,
    billingFees: 0,
    unbilledEarnings: 0,
  };
  const variables: Record<string, number> = {
    DAYS: (carry?.days ?? 0) + days,
    WORKING_DAYS: card.divisor ?? 0,
    OT_HOURS: (carry?.hours ?? 0) + overtimeHours,
  };
  const read = (name: string) =>
    name in variables && !(name in values)
      ? variables[name]
      : analysis.varies.has(name)
        ? cumulative[name]
        : values[name];
  for (const c of card.components) {
    const excluded = excludedCodes.includes(c.code);
    const varies = analysis.varies.has(c.code);
    // A dated revision splits a month into segments; amounts that do not
    // depend on attendance are charged once, in the last segment.
    const monthlyOnly =
      !chargeMonthlyAmounts &&
      c.category !== 'SUBTOTAL' &&
      !varies &&
      c.method !== 'PERCENT';
    // Calculated from attendance-based lines: worked out on month totals.
    const derived =
      varies &&
      (c.method === 'PERCENT' || (c.method === 'FORMULA' && !c.prorate));
    let raw: number;
    if (c.method === 'FORMULA') {
      try {
        raw = evaluateFormula(analysis.trees.get(c.code)!, {
          value: read,
          full: (name) => (full ? full.values[name] : read(name)),
        });
      } catch (e) {
        throw new BadRequestException(
          `Formula for ${c.code}: ${e instanceof FormulaError ? e.message : 'could not be calculated'}`,
        );
      }
      raw *= c.prorate ? days / card.divisor! : 1;
      bases[c.code] = 0;
    } else {
      const basis =
        c.method === 'PERCENT'
          ? Math.min(
              c.basis!.reduce((n, code) => n + read(code), 0),
              c.ceiling ?? Infinity,
            )
          : 0;
      raw =
        c.method === 'FIXED'
          ? c.value * (c.prorate ? days / card.divisor! : 1)
          : c.method === 'HOURLY'
            ? c.value * overtimeHours
            : (basis * c.value) / 100;
      const basisTotal = excluded ? 0 : basis;
      cumulativeBases[c.code] = basisTotal;
      bases[c.code] = derived
        ? basisTotal - (carry?.bases[c.code] ?? 0)
        : basisTotal;
    }
    if (excluded || monthlyOnly) raw = 0;
    if (c.category === 'SUBTOTAL') {
      const total = derived ? raw : before(c.code) + raw;
      const own = derived ? raw - before(c.code) : raw;
      if (varies) cumulative[c.code] = total;
      values[c.code] = own;
      amounts[c.code] = paise(own);
      continue;
    }
    let amount: number;
    if (derived) {
      const total = round(raw);
      amount = round(total - before(c.code));
      cumulative[c.code] = total;
    } else {
      amount = round(raw);
      if (varies) cumulative[c.code] = round(before(c.code) + amount);
    }
    amounts[c.code] = values[c.code] = amount;
    const bucket = {
      EARNING: 'earnings',
      DEDUCTION: 'deductions',
      EMPLOYER_COST: 'employerCosts',
      BILLING_FEE: 'billingFees',
    }[c.category];
    totals[bucket] = round(totals[bucket] + amount);
    if (c.category === 'EARNING' && c.billable === false)
      totals.unbilledEarnings = round(totals.unbilledEarnings + amount);
  }
  const result = {
    amounts,
    bases,
    ...totals,
    netPay: round(totals.earnings - totals.deductions),
    billingTotal: round(
      totals.earnings -
        totals.unbilledEarnings +
        totals.employerCosts +
        totals.billingFees,
    ),
  };
  const next: RateCardCarry = {
    values: { ...(carry?.values ?? {}), ...cumulative },
    bases: {
      ...(carry?.bases ?? {}),
      ...Object.fromEntries(
        Object.keys(cumulative)
          .filter((code) => code in cumulativeBases)
          .map((code) => [code, cumulativeBases[code]]),
      ),
    },
    days: variables.DAYS,
    hours: variables.OT_HOURS,
  };
  return { result, values, carry: next };
}

// Paid only on particular occasions, not part of a day's regular wage.
const NOT_REGULAR = /bonus|leave|encash|overtime|\bot\b|arrear|gratuity/i;

/**
 * One day's wage for Sunday work: the month's regular earnings — every
 * earning that follows attendance, prorated or calculated from one, but not
 * bonus, leave or overtime — for a full month, divided by its working days.
 */
export function proratedEarningsDayRate(card: ContractorRateCard) {
  const month = calculateRateCard(card, card.divisor!);
  const { varies, trees } = analyse(card);
  const total = card.components
    .filter(
      (c) =>
        c.category === 'EARNING' &&
        varies.has(c.code) &&
        c.method !== 'HOURLY' &&
        !(
          c.method === 'FORMULA' &&
          formulaReferences(trees.get(c.code)!).direct.has('OT_HOURS')
        ) &&
        !['BONUS', 'LEAVE', 'OT'].includes(c.code) &&
        !NOT_REGULAR.test(c.label),
    )
    .reduce((n, c) => n + month.amounts[c.code], 0);
  return total / card.divisor!;
}

export function calculateRateCardSegments(
  segments: Array<{ card: ContractorRateCard; days: number; hours: number }>,
  excludedCodes: string[] = [],
) {
  if (!segments.length)
    throw new BadRequestException('Attendance segments required');
  let carry: RateCardCarry | undefined;
  const results = segments.map((segment, index) => {
    // What the earlier parts come to under THIS revision's rules: the part is
    // charged its own formula's difference, so a cap is shared across the
    // month while a changed rate applies only to this part's own days.
    const baseline = carry
      ? calculateRateCardPart(segment.card, 0, excludedCodes, 0, {
          chargeMonthlyAmounts: false,
          carry,
        }).carry
      : undefined;
    const part = calculateRateCardPart(
      segment.card,
      segment.days,
      excludedCodes,
      segment.hours,
      {
        chargeMonthlyAmounts: index === segments.length - 1,
        carry: baseline,
      },
    );
    carry = part.carry;
    return part.result;
  });
  const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  const combined = {
    amounts: {} as Record<string, number>,
    bases: {} as Record<string, number>,
    earnings: 0,
    deductions: 0,
    employerCosts: 0,
    billingFees: 0,
    unbilledEarnings: 0,
    netPay: 0,
    billingTotal: 0,
  };
  for (const result of results) {
    for (const key of [
      'earnings',
      'deductions',
      'employerCosts',
      'billingFees',
      'unbilledEarnings',
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
