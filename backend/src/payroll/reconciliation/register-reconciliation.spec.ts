import {
  parseRegister,
  reconcileRegister,
  paise,
  money,
  ExpectedRow,
} from './register-reconciliation';
const header = 'employee_code,period,gross_earnings,net_pay';
const parse = (text: string) => parseRegister(Buffer.from(text), '2026-09');
const expected: ExpectedRow[] = [
  {
    employeeCode: '001',
    values: {
      gross_earnings: '100.10',
      net_pay: '90.00',
      pf_employee: null,
      esi_employee: '0.00',
    },
  },
];

describe('Wage register parsing and matching', () => {
  it('preserves leading-zero employee codes and accepts BOM, quotes and CRLF', () => {
    const result = parse(
      '\uFEFF' + header + '\r\n"001",2026-09,"100.10",90\r\n',
    );
    expect(result.rows[0].employeeCode).toBe('001');
    expect(result.rows[0].line).toBe(2);
    expect(reconcileRegister(expected, result).summary.matched).toBe(1);
    expect(result.uncheckedFields).toEqual(['pf_employee', 'esi_employee']);
  });
  it('compares one paisa differences exactly', () => {
    const result = reconcileRegister(
      expected,
      parse(header + '\n001,2026-09,100.11,90'),
    );
    expect(result.summary.mismatched).toBe(1);
    expect(result.rows[0].comparisons[0].difference).toBe('0.01');
  });
  it('handles negative amounts and the largest supported values without precision loss', () => {
    expect(money(paise('-999999999999.99')!)).toBe('-999999999999.99');
    expect(money(paise('999999999999.99')! - paise('999999999999.98')!)).toBe(
      '0.01',
    );
    expect(money(paise('-0.00')!)).toBe('0.00');
  });
  it('never substitutes zero for blank required amounts or absent baseline values', () => {
    const result = reconcileRegister(
      expected,
      parse(header + ',pf_employee\n001,2026-09,,90,0'),
    );
    expect(result.rows[0].status).toBe('UNVERIFIABLE');
    expect(result.rows[0].comparisons[0].actual).toBeNull();
    expect(result.rows[0].comparisons[2].expected).toBeNull();
    expect(result.totals[0].actual).toEqual({ amount: null, missingValues: 1 });
    expect(result.summary.matched).toBe(0);
  });
  it('detects missing and extra employees even when totals agree', () => {
    const result = reconcileRegister(
      expected,
      parse(header + '\nOTHER,2026-09,100.10,90'),
    );
    expect(result.summary.missingInFile).toBe(1);
    expect(result.summary.extraInFile).toBe(1);
    expect(result.summary.matched).toBe(0);
    expect(result.totals[0].actual.amount).toBe(
      result.totals[0].expected.amount,
    );
    expect(
      result.rows.find((r) => r.employeeCode === '001')?.sourceLine,
    ).toBeNull();
  });
  it('retains unknown values alongside mismatches', () => {
    const result = reconcileRegister(
      expected,
      parse(header + '\n001,2026-09,101,'),
    );
    expect(result.summary.mismatched).toBe(1);
    expect(result.summary.unverifiable).toBe(1);
  });
  it.each([
    'NaN',
    'Infinity',
    '1e3',
    '=SUM(A1)',
    '₹100',
    '1,000.00',
    '100.001',
    '9999999999999',
  ])('rejects ambiguous or invalid money %s', (value) => {
    expect(() => parse(header + `\n001,2026-09,"${value}",90`)).toThrow(
      'Invalid gross_earnings',
    );
  });
  it.each([
    [header + '\n001,2026-08,100,90', 'reporting period'],
    [header + '\n001,2026-09,100,90\n001,2026-09,100,90', 'Duplicate employee'],
    [header + '\n,2026-09,100,90', 'employee code'],
    [header + '\n001,2026-09,100', 'Column count'],
    [header + '\n"001,2026-09,100,90', 'unclosed'],
    [header + '\n"001"x,2026-09,100,90', 'quoting'],
    [
      'employee_code,period,gross_earnings,gross_earnings\n001,2026-09,100,90',
      'duplicate',
    ],
    ['employee_code,period,net_pay\n001,2026-09,90', 'Missing column'],
    [header, 'at least one employee'],
  ])('rejects invalid register input', (text, message) =>
    expect(() => parse(text)).toThrow(message),
  );
  it('rejects invalid UTF8, binary and oversize content', () => {
    expect(() => parseRegister(Buffer.from([0xff]), '2026-09')).toThrow(
      'UTF-8',
    );
    expect(() => parse('a\0b')).toThrow('Binary');
    expect(() =>
      parseRegister(Buffer.alloc(1024 * 1024 + 1), '2026-09'),
    ).toThrow('1 MB');
  });
  it('enforces the 5,000 employee limit', () => {
    const lines = Array.from(
      { length: 5001 },
      (_, i) => `${i},2026-09,100,90`,
    ).join('\n');
    expect(() => parse(header + '\n' + lines)).toThrow('5,000');
  });
  it('does not report success for an empty or duplicate baseline', () => {
    const upload = parse(header + '\n001,2026-09,100,90');
    expect(() => reconcileRegister([], upload)).toThrow('no employee amounts');
    expect(() => reconcileRegister([...expected, ...expected], upload)).toThrow(
      'duplicate employee',
    );
  });
});
