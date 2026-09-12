import { AccessScopeService, ScopeResult } from './access-scope.service';

describe('Shared query scope cannot widen missing assignments', () => {
  const service = new AccessScopeService(
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );
  it.each([
    { level: 'branches', clientId: 'c', branchIds: [] },
    { level: 'branches', clientId: 'c' },
    { level: 'branches', branchIds: ['b'] },
    { level: 'clients', clientIds: [] },
    { level: 'client' },
  ] as ScopeResult[])('denies incomplete scope %j', (scope) => {
    const qb = { andWhere: jest.fn() };
    service.applyToQb(qb as any, scope);
    expect(qb.andWhere).toHaveBeenCalledWith('1 = 0');
  });
  it('preserves every branch and company with custom entity paths', () => {
    const qb = { andWhere: jest.fn() };
    service.applyToQb(
      qb as any,
      { level: 'branches', clientId: 'c', branchIds: ['b1', 'b2'] },
      { clientPath: 'doc.companyId', branchPath: 'doc.branchId' },
    );
    expect(qb.andWhere).toHaveBeenCalledWith('doc.companyId = :scopeCid', {
      scopeCid: 'c',
    });
    expect(qb.andWhere).toHaveBeenCalledWith(
      'doc.branchId IN (:...scopeBids)',
      { scopeBids: ['b1', 'b2'] },
    );
  });
});
