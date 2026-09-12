import {
  calculateRateCard,
  calculateRateCardSegments,
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
