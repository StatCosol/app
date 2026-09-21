import * as ExcelJS from 'exceljs';
import { calculateRateCard } from './contractor-rate-card';
import {
  effectiveDateFrom,
  readVendorSheet,
  translate,
  VendorSheetQuotation,
} from './contractor-vendor-sheet';

/**
 * Breakups laid out the way real vendors send them (labels down a column or
 * across a row, a "%" column of rates, labels shifted a column over, a
 * billing summary built from other columns). Only the totals carry cached
 * results, as the check compares every figure that has one.
 */
type Value = number | string | { f: string; r?: number } | null;
function sheet(rows: Record<string, Value>) {
  const ws = new ExcelJS.Workbook().addWorksheet('Breakup');
  for (const [address, v] of Object.entries(rows)) {
    if (v == null) continue;
    ws.getCell(address).value =
      typeof v === 'object'
        ? ({ formula: v.f, result: v.r } as ExcelJS.CellFormulaValue)
        : v;
  }
  return ws;
}
const line = (q: VendorSheetQuotation, code: string) =>
  q.components.find((c) => c.code === code)!;
const cardOf = (q: VendorSheetQuotation) => ({
  divisor: q.payDays,
  rounding: 'PAISE' as const,
  components: q.components,
});

describe('reading a vendor breakup as sent', () => {
  it('reads a labels-down breakup with one column per role', () => {
    const col = (
      c: string,
      perDay: number,
      minimum: Value,
      ctc: number,
      net: number,
    ) => ({
      [`${c}1`]: 'Manual Packing',
      [`${c}2`]: c === 'B' ? 'Female' : 'Male',
      [`${c}3`]: 'UN SKILLED',
      [`${c}4`]: 26,
      [`${c}5`]: perDay,
      [`${c}6`]: minimum,
      [`${c}7`]: { f: `${c}6` },
      [`${c}8`]: { f: `(${c}7+${c}9)*8.33%` },
      [`${c}9`]: { f: `1.5*${c}5` },
      [`${c}10`]: 765,
      [`${c}11`]: {
        f: `ROUND(IF(${c}7<=15000,${c}7*13%,IF(${c}7>15001,1950)),0)`,
      },
      [`${c}12`]: { f: `(${c}7+${c}8+${c}9)*3.25%` },
      [`${c}13`]: { f: `SUM(${c}7:${c}12)`, r: ctc },
      [`${c}15`]: {
        f: `ROUND(IF(${c}7<=15000,${c}7*12%,IF(${c}7>15001,1800)),0)`,
      },
      [`${c}16`]: { f: `(${c}7+${c}8+${c}9)*0.75%` },
      [`${c}17`]: 150,
      [`${c}18`]: { f: `SUM(${c}15:${c}17)` },
      [`${c}19`]: { f: `+${c}7+${c}8+${c}9-${c}18`, r: net },
    });
    const labels = [
      'Department',
      'Gender',
      'Category',
      'Salary Pay days',
      'Per day Min. Wage',
      'Minimum Wage',
      'Basic+DA',
      'Bonus',
      'Leave Encashment',
      'service Charge',
      'Employer PF',
      'Employer ESIC',
      'Total CTC',
      '',
      'Employee PF',
      'Employee ESIC',
      'PT',
      'Deduction',
      'Net Pay',
    ];
    const ws = sheet({
      ...Object.fromEntries(labels.map((l, i) => [`A${i + 1}`, l || null])),
      ...col('B', 577, { f: 'B5*26' }, 20462.91, 15110.34),
      ...col('C', 615, 16000, 21642.94, 16244.65),
    });
    const { orientation, quotations } = readVendorSheet(ws);
    expect(orientation).toBe('columns');
    expect(quotations.map((q) => q.designation)).toEqual([
      'MANUAL PACKING - FEMALE',
      'MANUAL PACKING - MALE',
    ]);
    const [female] = quotations;
    expect(female).toMatchObject({ skillCategory: 'UNSKILLED', payDays: 26 });
    expect(female.duplicateOf).toBeUndefined();
    expect(female.check.ok).toBe(true);
    expect(line(female, 'BASIC_DA')).toMatchObject({
      category: 'EARNING',
      prorate: true,
      formula: 'MINIMUM_WAGE',
    });
    expect(line(female, 'LEAVE')).toMatchObject({
      category: 'EARNING',
      prorate: true,
      formula: '1.5*PER_DAY_MIN_WAGE',
    });
    expect(line(female, 'BONUS')).toMatchObject({
      category: 'EARNING',
      prorate: false,
    });
    expect(line(female, 'SERVICE_CHARGE').category).toBe('BILLING_FEE');
    for (const code of ['PF_ER', 'ESI_ER'])
      expect(line(female, code).category).toBe('EMPLOYER_COST');
    for (const code of ['PF_EMP', 'ESI_EMP', 'PT'])
      expect(line(female, code).category).toBe('DEDUCTION');
    expect(line(female, 'TOTAL_CTC').category).toBe('SUBTOTAL');
    // Half a month, worked out by hand from the vendor's rules.
    const half = calculateRateCard(cardOf(female), 13);
    expect(half.netPay).toBe(7480.17);
    expect(half.billingTotal).toBe(10613.96);
  });

  it('follows labels shifted a column over, forward references, a rate column and dated revisions', () => {
    const rows: Record<string, Value> = {
      E4: 'Revised w.e.f Apr-26',
      F4: 'Revised w.e.f 01.06.26',
      B7: 'Details',
      C7: 'Category Name',
      E7: 'HK Staff',
      F7: 'HK Staff',
      C12: 'Basic',
      C17: 'Conveyance Allowance',
      C18: 'Total Salary',
      B19: 'Statutory',
      C19: 'PF',
      D19: 0.12,
      C20: 'Bonus',
      D20: 0.0833,
      C21: 'Leaves',
      D21: 0.0481,
      C22: 'Total Manpower Cost',
      C23: 'Service Fee (PROFIT)',
      D23: 0.1,
      C24: 'Rates chargeable',
      C26: 'Bonus',
      C27: 'Leaves',
      C28: 'PF',
      C29: 'Net In hand',
      B30: 'Derived Wages',
    };
    for (const [c, basic] of [
      ['E', 12778],
      ['F', 15000],
    ] as const) {
      const pf = basic * 0.12,
        bonus = basic * 0.0833;
      const leaves = (basic + 1500 + pf + bonus) * 0.0481;
      const manpower = basic + 1500 + pf + bonus + leaves;
      Object.assign(rows, {
        [`${c}12`]: basic,
        [`${c}17`]: 1500,
        [`${c}18`]: { f: `${c}12+${c}17` },
        [`${c}19`]: { f: `IF(${c}30>15000,$D$19*15000,${c}30*$D$19)` },
        [`${c}20`]: { f: `IF(${c}30<7000,7000*$D$20,$D$20*${c}30)` },
        [`${c}21`]: { f: `SUM(${c}18:${c}20)*$D$21` },
        [`${c}22`]: { f: `${c}18+${c}19+${c}20+${c}21` },
        [`${c}23`]: { f: `${c}22*$D$23` },
        [`${c}24`]: { f: `${c}22+${c}23`, r: manpower * 1.1 },
        [`${c}26`]: { f: `${c}20` },
        [`${c}27`]: { f: `${c}30*$D$21` },
        [`${c}28`]: { f: `${c}19` },
        [`${c}29`]: {
          f: `(${c}18+${c}26+${c}27)-${c}28`,
          r: basic + 1500 + bonus + basic * 0.0481 - pf,
        },
        [`${c}30`]: { f: `${c}12` },
      });
    }
    const { quotations } = readVendorSheet(sheet(rows));
    expect(
      quotations.map((q) => [q.key, q.effectiveFrom, q.duplicateOf]),
    ).toEqual([
      ['E', '2026-04-01', undefined],
      ['F', '2026-06-01', undefined],
    ]);
    const [april] = quotations;
    expect(april.designation).toBe('HK STAFF');
    expect(april.check.ok).toBe(true);
    // PF reads the derived wage worked out further down, not a cached figure.
    expect(line(april, 'PF_ER').formula).toBe(
      'IF(DERIVED_WAGES>15000,0.12*15000,DERIVED_WAGES*0.12)',
    );
    expect(line(april, 'PF_EMP')).toMatchObject({
      category: 'DEDUCTION',
      formula: 'PF_ER',
    });
    // Bonus is billed through the statutory line and paid through its copy.
    expect(line(april, 'BONUS')).toMatchObject({
      category: 'EARNING',
      billable: false,
    });
    expect(line(april, 'BONUS_2').category).toBe('EMPLOYER_COST');
    expect(line(april, 'SERVICE_FEE_PROFIT').category).toBe('BILLING_FEE');
    const codes = april.components.map((c) => c.code);
    expect(codes.indexOf('DERIVED_WAGES')).toBeLessThan(codes.indexOf('PF_ER'));
    expect(calculateRateCard(cardOf(april), 13).amounts.PF_EMP).toBe(766.68);
  });

  it('reads a labels-across breakup, drops a column built from another row, and flags repeats', () => {
    const header = [
      'Job Title',
      'Category',
      'Per day minimum wage',
      'Minimum Wage',
      'Basic+DA',
      'Special Allowance',
      'Bonus',
      'Leave Encashment',
      'Employer PF',
      'Employer ESIC',
      'Total CTC',
      'Service Charge',
      'Total',
      'Netpay',
      'Gross Salary',
      'Employee PF',
      'Employee ESIC',
      'PT',
      'Deduction',
      'Net Pay',
    ];
    const rows: Record<string, Value> = Object.fromEntries(
      header.map((h, i) => [String.fromCharCode(65 + i) + '1', h]),
    );
    for (const r of [2, 3])
      Object.assign(rows, {
        [`A${r}`]: 'HOUSE KEEPING',
        [`B${r}`]: 'UNSKILLED',
        [`C${r}`]: 615,
        [`D${r}`]: { f: `ROUNDUP(C${r}*26,0)` },
        [`E${r}`]: { f: `D${r}` },
        [`F${r}`]: 1500,
        [`G${r}`]: { f: `+(E${r}+H${r})*8.33%` },
        [`H${r}`]: { f: `E${r}*5%` },
        [`I${r}`]: 1950,
        [`J${r}`]: { f: `(E${r}+F${r}+G${r}+H${r})*3.25%` },
        [`K${r}`]: { f: `SUM(E${r}:J${r})` },
        [`L${r}`]: 800,
        [`M${r}`]: { f: `K${r}+L${r}`, r: 23077.93 },
        [`N${r}`]: { f: `K${r}-(G${r + 1}+H${r + 1}+I${r}+J${r})` },
        [`O${r}`]: { f: `E${r}+F${r}` },
        [`P${r}`]: {
          f: `ROUND(IF((E${r})<=15000,(E${r})*12%,IF((E${r})>15001,1800)),0)`,
        },
        [`Q${r}`]: { f: `+(E${r}+G${r}+H${r}+F${r})*0.75%` },
        [`R${r}`]: 150,
        [`S${r}`]: { f: `SUM(P${r}:R${r})` },
        [`T${r}`]: { f: `(O${r}+G${r}+H${r})-S${r}`, r: 17590.4 },
      });
    const { orientation, quotations } = readVendorSheet(sheet(rows));
    expect(orientation).toBe('rows');
    expect(quotations.map((q) => q.key)).toEqual(['2', '3']);
    const [first, second] = quotations;
    expect(first.designation).toBe('HOUSE KEEPING');
    expect(second.duplicateOf).toBe('2');
    expect(first.vendorTotals.billing?.label).toBe('Total');
    expect(first.vendorTotals.netPay?.label).toBe('Net Pay');
    expect(first.excluded.map((e) => e.label)).toEqual(['Netpay']);
    expect(line(first, 'SPECIAL_ALLOWANCE')).toMatchObject({
      category: 'EARNING',
      prorate: true,
    });
    expect(first.check.ok).toBe(true);
  });

  it('keeps a billing-only quotation to one head and ignores the headcount summary', () => {
    const rows: Record<string, Value> = {
      A1: 'Sub components',
      B1: '%',
      C1: 'Security Guard',
      D1: 'Supervisor',
      A2: '08 hrs / 26 days',
      A3: 'Basic + DA',
      C3: 16000,
      D3: 20000,
      A4: 'Site allowance',
      C4: 2000,
      D4: 2150,
      A5: 'Gross Salary',
      C5: { f: 'SUM(C3:C4)' },
      D5: { f: 'SUM(D3:D4)' },
      A6: 'PF',
      B6: 0.13,
      C6: 1950,
      D6: 1950,
      A7: 'ESI/ Medical Insurance',
      B7: 0.0325,
      C7: { f: 'C3*B7' },
      D7: { f: 'D3*B7' },
      A8: 'Uniform',
      B8: 450,
      C8: { f: 'B8', r: 450 },
      D8: { f: 'C8', r: 450 },
      A9: 'Sub Total',
      C9: { f: 'SUM(C5:C8)' },
      D9: { f: 'SUM(D5:D8)' },
      A10: 'Management Fee',
      B10: 0.0651,
      C10: { f: 'C9*$B10' },
      D10: { f: 'D9*$B10' },
      A11: 'Total CTC',
      C11: { f: 'SUM(C9:C10)', r: 22281.89 },
      D11: { f: 'SUM(D9:D10)', r: 26840.52 },
      A12: 'Guards',
      B12: 42,
      C12: { f: 'C11' },
      D12: { f: 'C12*B12', r: 935839.38 },
      A13: 'Total',
      D13: { f: 'D12', r: 935839.38 },
    };
    const { quotations } = readVendorSheet(sheet(rows));
    const supervisor = quotations.find((q) => q.key === 'D')!;
    expect(supervisor.vendorTotals.billing).toMatchObject({
      label: 'Total CTC',
    });
    expect(supervisor.excluded.map((e) => e.label).sort()).toEqual([
      'Guards',
      'Total',
    ]);
    expect(line(supervisor, 'UNIFORM')).toMatchObject({
      method: 'FIXED',
      value: 450,
    });
    expect(line(supervisor, 'UNIFORM').note).toMatch(/another role/);
    expect(line(supervisor, 'MANAGEMENT_FEE').category).toBe('BILLING_FEE');
    expect(supervisor.warnings.join(' ')).toMatch(/No Net Pay line/);
    expect(supervisor.check).toMatchObject({
      ok: true,
      billingTotal: 26840.52,
    });
  });
});

describe('translating Excel formulas', () => {
  const resolve = (row: number, col: number) =>
    col === 2 ? `__L${row}__` : col === 3 ? '0.5' : null;
  it('expands ranges, inlines rates and keeps functions', () => {
    expect(translate('SUM(B2:B4)*$C$1+ROUND(B5,0)', resolve)).toBe(
      'SUM(__L2__, __L3__, __L4__)*0.5+ROUND(__L5__,0)',
    );
    expect(translate('IF(TRUE,B2,FALSE)', resolve)).toBe('IF(1,__L2__,0)');
    expect(translate('LOG10(B2)', resolve)).toBe('LOG10(__L2__)');
  });
  it('refuses text, other sheets and references to labels', () => {
    for (const f of ['"x"&B2', 'Sheet2!B2', 'D2+1'])
      expect(() => translate(f, resolve)).toThrow();
  });
});

describe('effective dates in headings', () => {
  it.each([
    ['Revised w.e.f 01.06.26', '2026-06-01'],
    ['w.e.f Apr-26', '2026-04-01'],
    ['WEF: 15/10/2026', '2026-10-15'],
    ['w.e.f. 1 July 2026', '2026-07-01'],
    ['Rates for Hyderabad', null],
  ])('%s', (text, expected) => {
    expect(effectiveDateFrom([text])).toBe(expected);
  });
});
