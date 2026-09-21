import { calculateRateCard, ContractorRateCard } from './contractor-rate-card';

/**
 * Statutory checks on a contractor quotation, whatever the vendor's layout.
 *
 * Each vendor calculates in its own way; these rules are what the law asks of
 * any of them, judged on one full month:
 * - Basic + DA at least the state minimum wage for the skill;
 * - wages as the Labour Codes define them: Basic + DA, plus whatever the
 *   allowances exceed half of pay by — the base for PF, ESI and bonus;
 * - PF 12% from the worker and at least 12% from the employer, on wages up to
 *   15,000;
 * - ESI 0.75% / 3.25% while wages are up to 21,000, and not charged above it;
 * - bonus at least 8.33% where the worker is eligible;
 * - PT as the state slab gives it for the worker's gross;
 * - no line billed to the client above what the worker is paid for it.
 *
 * Findings do not stop a quotation being saved (it is what the vendor
 * charges); they make it visible.
 */

export interface ComplianceFinding {
  rule:
    | 'MINIMUM_WAGE'
    | 'LABOUR_CODE_WAGES'
    | 'PF'
    | 'ESI'
    | 'BONUS'
    | 'PT'
    | 'BILLED_ABOVE_PAID';
  severity: 'ERROR' | 'WARNING';
  message: string;
}

export interface PtSlab {
  fromAmount: number;
  toAmount: number | null;
  valueAmount: number | null;
  valuePercent: number | null;
}

export interface ComplianceContext {
  /** Working days the quotation is priced on (the month's days less weekly offs). */
  payDays: number;
  stateCode?: string | null;
  skillCategory?: string | null;
  /** The contractor's schedule of employment the minimum wage was taken for. */
  scheduledEmployment?: string | null;
  /** Monthly minimum wage for the state and skill; null when none is set up. */
  minimumMonthlyWage?: number | null;
  /** The state's PT slabs in force; null when none are set up. */
  ptSlabs?: PtSlab[] | null;
}

const PF_CEILING = 15000;
const ESI_CEILING = 21000;
const BONUS_ELIGIBILITY = 21000;
const BONUS_CALCULATION_FLOOR = 7000;

const inr = (n: number) =>
  '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 2 });

/** What the slab gives for a monthly gross (same rules as the payroll). */
export function slabAmount(slabs: PtSlab[], gross: number) {
  for (const s of slabs) {
    const inRange =
      gross >= Number(s.fromAmount) &&
      (s.toAmount == null || gross <= Number(s.toAmount));
    if (!inRange) continue;
    if (s.valueAmount != null) return Number(s.valueAmount);
    if (s.valuePercent != null) return (gross * Number(s.valuePercent)) / 100;
    return 0;
  }
  return 0;
}

// Paid lines the Code on Wages keeps out of "wages" but that are not
// allowances to weigh against the 50% limit either.
const NOT_ALLOWANCE =
  /bonus|leave|encash|overtime|\bot\b|holiday|\bnfh\b|gratuity|arrear/i;

export function quotationCompliance(
  card: ContractorRateCard,
  ctx: ComplianceContext,
): ComplianceFinding[] {
  let result: ReturnType<typeof calculateRateCard>;
  try {
    result = calculateRateCard({ ...card, divisor: ctx.payDays }, ctx.payDays);
  } catch {
    return []; // the quotation itself does not calculate; reported elsewhere
  }
  const findings: ComplianceFinding[] = [];
  const add = (
    rule: ComplianceFinding['rule'],
    severity: ComplianceFinding['severity'],
    message: string,
  ) => findings.push({ rule, severity, message });
  const amount = (code: string) => result.amounts[code] ?? 0;
  const has = (code: string) =>
    card.components.some((c) => c.code === code && c.category !== 'SUBTOTAL');
  const earnings = card.components.filter((c) => c.category === 'EARNING');

  const wage = amount('BASIC_DA') + amount('DA');
  const allowances = earnings
    .filter(
      (c) =>
        !['BASIC_DA', 'DA', 'BONUS', 'LEAVE', 'OT'].includes(c.code) &&
        !NOT_ALLOWANCE.test(c.label),
    )
    .reduce((n, c) => n + amount(c.code), 0);
  const remuneration = wage + allowances;
  const excess = Math.max(0, allowances - remuneration / 2);
  const wages = wage + excess;
  const round2 = (n: number) => Math.round(n * 100) / 100;

  // Minimum wage
  if (ctx.skillCategory) {
    if (ctx.minimumMonthlyWage == null)
      add(
        'MINIMUM_WAGE',
        'WARNING',
        `No minimum wage is set up for ${ctx.stateCode || 'this state'} / ${ctx.skillCategory}${ctx.scheduledEmployment ? ` (${ctx.scheduledEmployment})` : ''}, so it could not be checked.`,
      );
    else if (wage < ctx.minimumMonthlyWage - 0.5)
      add(
        'MINIMUM_WAGE',
        'ERROR',
        `Basic + DA ${inr(round2(wage))} is below the minimum wage ${inr(ctx.minimumMonthlyWage)} for ${ctx.skillCategory} in ${ctx.stateCode}${ctx.scheduledEmployment ? ` under "${ctx.scheduledEmployment}"` : ''}.`,
      );
  }

  // Labour Code wages
  if (excess > 0.5)
    add(
      'LABOUR_CODE_WAGES',
      'WARNING',
      `Allowances ${inr(round2(allowances))} are more than half of pay ${inr(round2(remuneration))}; under the Code on Wages ${inr(round2(excess))} counts as wages, so PF, ESI and bonus are due on ${inr(round2(wages))}.`,
    );

  // PF
  const pfBase = Math.min(wages, PF_CEILING);
  const pfDue = pfBase * 0.12;
  for (const [code, who] of [
    ['PF_EMP', 'Employee'],
    ['PF_ER', 'Employer'],
  ] as const) {
    if (!has(code)) {
      if (wages <= PF_CEILING)
        add(
          'PF',
          'WARNING',
          `No ${who.toLowerCase()} PF line: wages ${inr(round2(wages))} are within the PF limit.`,
        );
    } else if (amount(code) < pfDue - 1)
      add(
        'PF',
        'ERROR',
        `${who} PF ${inr(amount(code))} is below 12% of ${inr(round2(pfBase))} (${inr(round2(pfDue))}).`,
      );
  }

  // ESI
  if (wages <= ESI_CEILING) {
    for (const [code, who, rate] of [
      ['ESI_EMP', 'Employee', 0.0075],
      ['ESI_ER', 'Employer', 0.0325],
    ] as const) {
      const due = wages * rate;
      if (!has(code))
        add(
          'ESI',
          'WARNING',
          `No ${who.toLowerCase()} ESI line: wages ${inr(round2(wages))} are within the ESI limit.`,
        );
      else if (amount(code) < due - 0.5)
        add(
          'ESI',
          'ERROR',
          `${who} ESI ${inr(amount(code))} is below ${rate * 100}% of wages ${inr(round2(wages))} (${inr(round2(due))}).`,
        );
    }
  } else if (amount('ESI_EMP') > 0 || amount('ESI_ER') > 0)
    add(
      'ESI',
      'WARNING',
      `Wages ${inr(round2(wages))} are above the ESI limit of ${inr(ESI_CEILING)}, yet ESI of ${inr(round2(amount('ESI_EMP') + amount('ESI_ER')))} is charged. Confirm it is insurance the worker actually gets.`,
    );

  // Bonus
  if (wages <= BONUS_ELIGIBILITY) {
    const bonusLines = card.components.filter(
      (c) =>
        c.category !== 'SUBTOTAL' &&
        c.category !== 'DEDUCTION' &&
        (c.code === 'BONUS' || /bonus/i.test(c.label)),
    );
    const bonus = Math.max(0, ...bonusLines.map((c) => amount(c.code)));
    const base = Math.min(
      wages,
      Math.max(BONUS_CALCULATION_FLOOR, ctx.minimumMonthlyWage ?? 0),
    );
    const due = base * 0.0833;
    if (!bonusLines.length)
      add(
        'BONUS',
        'WARNING',
        'No bonus line: the worker is eligible for bonus.',
      );
    else if (bonus < due - 1)
      add(
        'BONUS',
        'ERROR',
        `Bonus ${inr(bonus)} is below 8.33% of ${inr(round2(base))} (${inr(round2(due))}).`,
      );
  }

  // PT
  const gross = result.earnings - amount('OT');
  if (ctx.ptSlabs?.length) {
    const due = slabAmount(ctx.ptSlabs, gross);
    if (!has('PT')) {
      if (due > 0)
        add(
          'PT',
          'WARNING',
          `No PT line: the ${ctx.stateCode} slab gives ${inr(due)} for gross ${inr(round2(gross))}.`,
        );
    } else if (Math.abs(amount('PT') - due) > 0.5)
      add(
        'PT',
        'ERROR',
        `PT ${inr(amount('PT'))} differs from the ${ctx.stateCode} slab, which gives ${inr(due)} for gross ${inr(round2(gross))}.`,
      );
  } else if (has('PT') && ctx.stateCode)
    add(
      'PT',
      'WARNING',
      `No PT slab is set up for ${ctx.stateCode}, so PT could not be checked.`,
    );

  // Billed above paid: an earning paid on one base and billed through a
  // separate line on another.
  const groups: Array<[string, RegExp]> = [
    ['Leave', /leave|encash/i],
    ['Bonus', /bonus/i],
    ['Holiday pay', /holiday|\bnfh\b/i],
  ];
  for (const [name, pattern] of groups) {
    const paid = earnings
      .filter(
        (c) => c.billable === false && pattern.test(c.label + ' ' + c.code),
      )
      .reduce((n, c) => n + amount(c.code), 0);
    if (!paid) continue;
    const billed = card.components
      .filter(
        (c) =>
          c.category === 'EMPLOYER_COST' &&
          pattern.test(c.label + ' ' + c.code),
      )
      .reduce((n, c) => n + amount(c.code), 0);
    if (billed > paid + 1)
      add(
        'BILLED_ABOVE_PAID',
        'WARNING',
        `${name} is billed at ${inr(round2(billed))} but paid at ${inr(round2(paid))}: ${inr(round2(billed - paid))} more per head per month than the worker receives.`,
      );
  }
  return findings;
}
