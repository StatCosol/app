import { isTestPayrollRecord } from './payroll-operational-records';

describe('Explicit payroll test markers', () => {
  it.each([
    'TEST_RUN',
    'test-run',
    ' TEST ONLY',
    'SYNTHETIC TEST ONLY: verification',
    '\tTest Only - payroll',
  ])('excludes %s', (value) => {
    expect(isTestPayrollRecord(null, value)).toBe(true);
  });
  it.each([
    null,
    '',
    'December payroll',
    'Testing Services payroll',
    'TEST ONLYING',
    'Approved after test review',
  ])('preserves actual/unmarked value %s', (value) => {
    expect(isTestPayrollRecord(value)).toBe(false);
  });
});
