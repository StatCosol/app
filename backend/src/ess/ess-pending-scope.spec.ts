import { EssService } from './ess.service';

/**
 * The branch desk's pending nominations and leaves: a branch user used to get
 * every branch's items unless the screen passed a branchId.
 */
describe('EssService pending lists are held to the caller branches', () => {
  const build = () => {
    const calls: Array<[string, unknown]> = [];
    const qb: any = {
      where: jest.fn((sql, p) => (calls.push([sql, p]), qb)),
      andWhere: jest.fn((sql, p) => (calls.push([sql, p]), qb)),
      orderBy: jest.fn(() => qb),
      getMany: jest.fn(async () => []),
    };
    const repo = { createQueryBuilder: jest.fn(() => qb) };
    const none = {} as never;
    const svc = new EssService(
      none,
      none,
      repo as never,
      repo as never,
      repo as never,
      none,
      none,
      none,
      none,
      none,
      none,
      none,
      none,
      none,
      none,
      none,
    );
    return { svc, calls, qb };
  };

  it.each(['listPendingNominations', 'listPendingLeaves'] as const)(
    '%s filters to the allowed branches',
    async (method) => {
      const { svc, calls } = build();
      await svc[method]('client-a', undefined, ['b1']);
      expect(
        calls.some(([sql]) => /IN \(:\.\.\.allowedBranchIds\)/.test(sql)),
      ).toBe(true);
    },
  );

  it.each(['listPendingNominations', 'listPendingLeaves'] as const)(
    '%s returns nothing for a branch user with no branches',
    async (method) => {
      const { svc, qb } = build();
      await expect(svc[method]('client-a', undefined, [])).resolves.toEqual([]);
      expect(qb.getMany).not.toHaveBeenCalled();
    },
  );

  it('leaves a company-wide user unfiltered', async () => {
    const { svc, calls } = build();
    await svc.listPendingNominations('client-a', undefined, 'ALL');
    expect(calls.some(([sql]) => /allowedBranchIds/.test(sql))).toBe(false);
  });
});
