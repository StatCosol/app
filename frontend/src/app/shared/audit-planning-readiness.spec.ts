import { describe, expect, it } from 'vitest';
import { contractorScopeReadiness } from './audit-planning-readiness';

describe('contractor audit planning readiness', () => {
  it.each([
    [null, null, false], ['branch', null, false], [null, 'vendor', false],
    [' ', 'vendor', false], ['branch', 'vendor', true],
  ])('requires both branch %s and vendor %s', (branchId, contractorUserId, ready) => {
    const items = contractorScopeReadiness({ auditType: 'CONTRACTOR', branchId: branchId as string | null, contractorUserId: contractorUserId as string | null });
    expect(items).toHaveLength(2);
    expect(items.every(item => item.ok)).toBe(ready);
  });
  it('does not require a contractor for other audit types', () => {
    expect(contractorScopeReadiness({ auditType: 'FACTORY' })).toEqual([]);
  });
});
