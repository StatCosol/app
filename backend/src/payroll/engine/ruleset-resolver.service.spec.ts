import { RulesetResolverService } from './ruleset-resolver.service';
const parameters = {
  find: jest.fn(async () => [{ key: 'BASIC_PERCENT', valueNum: 40 }]),
};
const params = {
  clientId: 'client-a',
  branchId: 'branch-a',
  asOfDate: '2026-09-01',
  ruleSetId: 'rules-a',
};
function make(overrides: any = {}) {
  const row = {
    id: 'rules-a',
    clientId: 'client-a',
    branchId: null,
    isActive: true,
    effectiveFrom: '2026-01-01',
    effectiveTo: null,
    ...overrides,
  };
  const repo = {
    findOne: jest.fn(async ({ where }: any) =>
      Object.entries(where).every(([key, value]) => row[key] === value)
        ? row
        : null,
    ),
    createQueryBuilder: jest.fn(),
  };
  return {
    repo,
    service: new RulesetResolverService(repo as any, parameters as any),
  };
}
describe('client-specific pinned payroll rule sets', () => {
  it('uses the assigned rule set instead of silently selecting a newer default', async () => {
    const { service, repo } = make();
    const result = await service.resolveAndLoad(params);
    expect(result?.params.get('BASIC_PERCENT')).toBe(40);
    expect(repo.createQueryBuilder).not.toHaveBeenCalled();
  });
  it.each([
    { clientId: 'client-b' },
    { isActive: false },
    { branchId: 'branch-b' },
    { effectiveFrom: '2026-10-01' },
    { effectiveTo: '2026-08-31' },
  ])('rejects a foreign or ineffective pinned rule set: %j', async (row) => {
    await expect(make(row).service.resolveAndLoad(params)).rejects.toThrow(
      'not valid',
    );
  });
});
