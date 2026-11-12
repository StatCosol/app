import { contractorScopeReadiness } from './contractor-audit-scope';

describe('contractor readiness checklist', () => {
  it.each([
    [null, null, false],
    ['branch', null, false],
    [null, 'vendor', false],
    [' ', 'vendor', false],
    ['branch', 'vendor', true],
  ])(
    'requires branch %s and contractor %s',
    (branchId, contractorUserId, ready) => {
      const items = contractorScopeReadiness({
        auditType: 'CONTRACTOR',
        branchId: branchId,
        contractorUserId: contractorUserId,
      });
      expect(items).toHaveLength(2);
      expect(items.every((item) => item.ok)).toBe(ready);
    },
  );
  it('preserves company-wide non-contractor audit readiness', () => {
    expect(contractorScopeReadiness({ auditType: 'FACTORY' })).toEqual([]);
  });
});
