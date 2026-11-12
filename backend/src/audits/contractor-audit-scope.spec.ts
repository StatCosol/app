import { assertContractorAuditScope } from './contractor-audit-scope';
describe('contractor audit execution scope', () => {
  it.each([
    [null, null],
    ['branch', null],
    [null, 'vendor'],
    [' ', 'vendor'],
  ])('rejects incomplete branch/vendor scope', (branch, vendor) =>
    expect(() =>
      assertContractorAuditScope('CONTRACTOR', branch, vendor),
    ).toThrow('separate branch-contractor audits'),
  );
  it('accepts an explicit scope', () =>
    expect(() =>
      assertContractorAuditScope('CONTRACTOR', 'branch', 'vendor'),
    ).not.toThrow());
  it('does not change other audit types', () =>
    expect(() =>
      assertContractorAuditScope('FACTORY', null, null),
    ).not.toThrow());
});
