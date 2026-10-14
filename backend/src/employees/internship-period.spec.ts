import { validateInternshipPeriod } from './internship-period';
describe('Internship period', () => {
  it('accepts a complete internship period and regular employees without one', () => {
    expect(() =>
      validateInternshipPeriod({
        payrollCategory: 'INTERN',
        internshipStartDate: '2026-10-01',
        internshipEndDate: '2027-03-31',
      }),
    ).not.toThrow();
    expect(() =>
      validateInternshipPeriod({ payrollCategory: 'REGULAR' }),
    ).not.toThrow();
  });
  it.each([
    {},
    { internshipStartDate: '2026-10-01' },
    { internshipStartDate: '2026-10-01', internshipEndDate: '2026-09-30' },
    { internshipStartDate: '2026-02-30', internshipEndDate: '2026-03-31' },
  ])('rejects an incomplete, reversed or invalid period %s', (period) => {
    expect(() =>
      validateInternshipPeriod({ payrollCategory: 'INTERN', ...period }),
    ).toThrow('internship start and end date');
  });
});
