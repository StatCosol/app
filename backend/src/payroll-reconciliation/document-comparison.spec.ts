import { comparePayrollDocument, normalizeHeader } from './document-comparison';
const worker = {
  employeeCode: 'G001',
  daysWorked: 30,
  grossWage: 18000,
  totalEarnings: 20103,
  pfWage: 15000,
  pfDeduction: 1800,
  esiDeduction: 120,
  netSalary: 18033,
  calculationSnapshot: {
    uan: '100000000001',
    esic: '1234567890',
    pfApplicable: true,
    esiApplicable: true,
  },
};
const row = {
  employeeCode: 'G001',
  daysWorked: '30',
  grossWage: '18,000',
  totalEarnings: '20,103',
  pfDeduction: '1800',
  esiDeduction: '120',
  netSalary: '18,033',
  uan: '100000000001',
  esic: '1234567890',
};
describe('payroll evidence comparison', () => {
  it('matches gross and total earnings separately with UAN/ESI identifiers', () =>
    expect(comparePayrollDocument([row], [worker], 'WAGE').status).toBe(
      'MATCHED',
    ));
  it('records expected and uploaded values for a definite discrepancy', () => {
    const result = comparePayrollDocument(
      [{ ...row, netSalary: '18032' }],
      [worker],
      'WAGE',
    );
    expect(result.status).toBe('NC');
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'netSalary',
          expected: 18033,
          submitted: '18032',
        }),
      ]),
    );
  });
  it('matches PF records by UAN even without an employee code', () =>
    expect(
      comparePayrollDocument(
        [{ uan: row.uan, pfWage: '15000', pfDeduction: '1800' }],
        [worker],
        'PF',
      ).status,
    ).toBe('MATCHED'));
  it('marks duplicate and missing workers as NC', () => {
    expect(comparePayrollDocument([row, row], [worker], 'WAGE').status).toBe(
      'NC',
    );
    expect(
      comparePayrollDocument(
        [row],
        [worker, { ...worker, employeeCode: 'G002' }],
        'WAGE',
      ).status,
    ).toBe('NC');
  });
  it('never certifies an unreadable document or legacy snapshot', () => {
    expect(comparePayrollDocument([], [worker], 'WAGE').status).toBe(
      'NEEDS_REVIEW',
    );
    expect(
      comparePayrollDocument(
        [row],
        [{ ...worker, calculationSnapshot: null }],
        'WAGE',
      ).status,
    ).toBe('NEEDS_REVIEW');
  });
  it('does not demand nonapplicable PF/ESI identifiers', () =>
    expect(
      comparePayrollDocument(
        [{ ...row, uan: '', esic: '' }],
        [
          {
            ...worker,
            calculationSnapshot: { pfApplicable: false, esiApplicable: false },
          },
        ],
        'WAGE',
      ).status,
    ).toBe('MATCHED'));
});

it('does not infer missing workers when an identifier is ambiguous', () => {
  const result = comparePayrollDocument(
    [{ uan: row.uan, pfWage: '15000', pfDeduction: '1800' }],
    [worker, { ...worker, employeeCode: 'G002' }],
    'PF',
  );
  expect(result.status).toBe('NEEDS_REVIEW');
});

it('accepts singular PF Wage headers used by the payroll working pack', () => {
  const fields = Object.fromEntries(
    ['UAN', 'PF Wage', 'PF Deduction'].map((header, index) => [
      normalizeHeader(header),
      [row.uan, '15000', '1800'][index],
    ]),
  );
  expect(comparePayrollDocument([fields], [worker], 'PF').status).toBe(
    'MATCHED',
  );
});
