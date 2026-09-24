import { describe, it, expect } from 'vitest';
import { safePortalReturnUrl } from './return-url';
describe('Login continuation', () => {
  it('preserves portal record and period context', () => {
    expect(safePortalReturnUrl('/client/payroll?month=2026-08')).toBe('/client/payroll?month=2026-08');
    expect(safePortalReturnUrl('/auditor/observations?auditId=sample')).toContain('auditId=sample');
  });
  it.each(['https://example.invalid','//example.invalid','/login?returnUrl=/login','/client\\example.invalid','/client\nmalicious','javascript:alert(1)',null,{}])('rejects unsafe destinations: %s', value => {
    expect(safePortalReturnUrl(value)).toBeNull();
  });
});
