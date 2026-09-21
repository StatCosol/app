import {
  calculateRateCard,
  calculateRateCardSegments,
  proratedEarningsDayRate,
  ContractorRateCard,
  validateRateCard,
} from './contractor-rate-card';
const fixed = (code: string, value: number, category: any = 'EARNING') => ({
  code,
  label: code,
  method: 'FIXED' as const,
  value,
  category,
  prorate: true,
});
const sample = (): ContractorRateCard => ({
  divisor: 30,
  rounding: 'RUPEE',
  components: [
    fixed('BASIC_DA', 16000),
    fixed('SITE', 2000),
    fixed('BONUS', 1333),
    fixed('LEAVE', 770),
    {
      code: 'PF_EMP',
      label: 'Employee PF',
      category: 'DEDUCTION',
      method: 'PERCENT',
      basis: ['BASIC_DA'],
      ceiling: 15000,
      value: 12,
      prorate: false,
    },
    {
      code: 'ESI_EMP',
      label: 'Quoted employee ESI',
      category: 'DEDUCTION',
      method: 'PERCENT',
      basis: ['BASIC_DA'],
      value: 0.75,
      prorate: false,
    },
    fixed('PT', 150, 'DEDUCTION'),
    fixed('PF_ER', 1950, 'EMPLOYER_COST'),
    fixed('ESI_ER', 520, 'EMPLOYER_COST'),
    fixed('NFH', 461, 'EMPLOYER_COST'),
    fixed('UNIFORM', 450, 'BILLING_FEE'),
  ],
});
describe('explicit contractor quotation components', () => {
  it('reconciles supplied guard pay without counting bonus/leave twice in billing', () => {
    const result = calculateRateCard(sample(), 30);
    expect(result.earnings).toBe(20103);
    expect(result.deductions).toBe(2070);
    expect(result.netPay).toBe(18033);
    expect(result.billingTotal).toBe(23484);
  });
  it('prorates monthly amounts and calculates percentages on earned wages once', () => {
    const result = calculateRateCard(sample(), 15);
    expect(result.amounts.BASIC_DA).toBe(8000);
    expect(result.amounts.PF_EMP).toBe(960);
  });
  it('excludes nonapplicable statutory components before dependent calculations', () => {
    expect(
      calculateRateCard(sample(), 30, ['PF_EMP', 'PF_ER']).amounts.PF_EMP,
    ).toBe(0);
  });
  it('rejects duplicate codes, forward references and repeated proration', () => {
    const card = sample();
    card.components.push({ ...card.components[0] });
    expect(() => validateRateCard(card)).toThrow('duplicate');
    const forward = sample();
    forward.components[4].basis = ['MISSING'];
    expect(() => validateRateCard(forward)).toThrow('preceding');
    const double = sample();
    double.components[4].prorate = true;
    expect(() => validateRateCard(double)).toThrow('twice');
  });
  it('preserves paisa rounding when configured', () => {
    const card = sample();
    card.rounding = 'PAISE';
    card.components.push(fixed('LWF_ER', 0.42, 'EMPLOYER_COST'));
    expect(calculateRateCard(card, 30).amounts.LWF_ER).toBe(0.42);
  });
});

it('shares a monthly PF ceiling across dated quotation revisions', () => {
  const first = sample(),
    second = sample();
  second.components[0].value = 20000;
  const result = calculateRateCardSegments([
    { card: first, days: 15, hours: 0 },
    { card: second, days: 15, hours: 0 },
  ]);
  expect(result.amounts.BASIC_DA).toBe(18000);
  expect(result.amounts.PF_EMP).toBe(1800);
  expect(result.bases.PF_EMP).toBe(15000);
});
it('pays hourly overtime once and charges an unprorated monthly component once', () => {
  const card = sample();
  card.components.push({
    code: 'OT',
    label: 'Overtime',
    category: 'EARNING',
    method: 'HOURLY',
    value: 100,
    prorate: false,
  });
  card.components.find((c) => c.code === 'PT')!.prorate = false;
  const result = calculateRateCardSegments([
    { card, days: 15, hours: 4 },
    { card, days: 15, hours: 2 },
  ]);
  expect(result.amounts.OT).toBe(600);
  expect(result.amounts.PT).toBe(150);
});

it('reconciles the supplied supervisor monthly wage breakup', () => {
  const card = sample();
  const values = { BASIC_DA: 20000, SITE: 2150, BONUS: 1666, LEAVE: 962 };
  for (const component of card.components)
    if (component.code in values) component.value = values[component.code];
  const result = calculateRateCard(card, 30);
  expect(result.earnings).toBe(24778);
  expect(result.deductions).toBe(2100);
  expect(result.netPay).toBe(22678);
});

describe('formula quotations across a mid-month revision', () => {
  const card = (
    basic: number,
    pfRate: string,
    extra: any[] = [],
  ): ContractorRateCard => ({
    divisor: 26,
    rounding: 'PAISE',
    components: [
      {
        code: 'BASIC_DA',
        label: 'Basic',
        category: 'EARNING',
        method: 'FIXED',
        value: basic,
        prorate: true,
      },
      {
        code: 'PF_EMP',
        label: 'Employee PF',
        category: 'DEDUCTION',
        method: 'FORMULA',
        value: 0,
        formula: `MIN(BASIC_DA, 15000) * ${pfRate}`,
        prorate: false,
      },
      ...extra,
    ],
  });

  it('shares a formula PF ceiling across the revision', () => {
    // 13 + 13 days: basic 8,000 + 10,000 = 18,000; PF capped at 15,000.
    const r = calculateRateCardSegments([
      { card: card(16000, '12%'), days: 13, hours: 0 },
      { card: card(20000, '12%'), days: 13, hours: 0 },
    ]);
    expect(r.amounts.BASIC_DA).toBe(18000);
    expect(r.amounts.PF_EMP).toBe(1800);
  });

  it('matches the whole month when nothing changes but the split', () => {
    const whole = calculateRateCard(card(16000, '12%'), 26);
    const split = calculateRateCardSegments([
      { card: card(16000, '12%'), days: 10, hours: 0 },
      { card: card(16000, '12%'), days: 16, hours: 0 },
    ]);
    expect(split.amounts).toEqual(whole.amounts);
    expect(split.netPay).toBe(whole.netPay);
  });

  it('applies a changed rate only to the days it covers', () => {
    // Below the cap: 5,000 at 12% then 5,000 at 13% = 600 + 650.
    const r = calculateRateCardSegments([
      { card: card(10000, '12%'), days: 13, hours: 0 },
      { card: card(10000, '13%'), days: 13, hours: 0 },
    ]);
    expect(r.amounts.PF_EMP).toBe(1250);
  });

  it('judges a threshold on the month, not on each part', () => {
    // ESI stops above 21,000 a month: 13 days at 24,000 + 13 at 20,000
    // earn 22,000 — above the limit, although each part is below it.
    const esi = {
      code: 'ESI_EMP',
      label: 'Employee ESI',
      category: 'DEDUCTION',
      method: 'FORMULA',
      value: 0,
      formula: 'IF(BASIC_DA > 21000, 0, BASIC_DA * 0.75%)',
      prorate: false,
    };
    const r = calculateRateCardSegments([
      { card: card(24000, '12%', [esi]), days: 13, hours: 0 },
      { card: card(20000, '12%', [esi]), days: 13, hours: 0 },
    ]);
    expect(r.amounts.ESI_EMP).toBe(0);
  });

  it('counts attendance-derived earnings in the Sunday day rate', () => {
    const quote = card(15600, '12%', [
      {
        code: 'HRA',
        label: 'HRA',
        category: 'EARNING',
        method: 'FORMULA',
        value: 0,
        formula: 'BASIC_DA * 40%',
        prorate: false,
      },
      {
        code: 'BONUS',
        label: 'Bonus',
        category: 'EARNING',
        method: 'FORMULA',
        value: 0,
        formula: 'BASIC_DA * 8.33%',
        prorate: false,
      },
      {
        code: 'OT',
        label: 'Overtime',
        category: 'EARNING',
        method: 'FORMULA',
        value: 0,
        formula: '100 * OT_HOURS',
        prorate: false,
      },
      {
        code: 'UNIFORM',
        label: 'Uniform allowance',
        category: 'EARNING',
        method: 'FIXED',
        value: 260,
        prorate: false,
      },
    ]);
    // (15,600 + 6,240) / 26: bonus, overtime and a flat monthly amount excluded.
    expect(proratedEarningsDayRate(quote)).toBe(840);
  });
});
