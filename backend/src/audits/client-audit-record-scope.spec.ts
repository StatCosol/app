import { AuditListingService } from './audit-listing.service';
import { actualAuditSql } from '../common/actual-records';

describe('Client audit test-data separation', () => {
  function setup() {
    const qb: any = {};
    for (const method of [
      'leftJoinAndSelect',
      'where',
      'andWhere',
      'select',
      'addSelect',
      'groupBy',
      'orderBy',
      'addOrderBy',
    ]) {
      qb[method] = jest.fn().mockReturnValue(qb);
    }
    qb.getMany = jest.fn().mockResolvedValue([]);
    qb.getRawMany = jest.fn().mockResolvedValue([]);
    const repo = { createQueryBuilder: jest.fn(() => qb) };
    const service = new AuditListingService(
      repo as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    const user: any = {
      id: 'client-user',
      userId: 'client-user',
      roleCode: 'CLIENT',
      clientId: 'client',
      userType: 'MASTER',
    };
    return { service, qb, repo, user };
  }

  it.each([undefined, 'ACTUAL', 'TEST'] as const)(
    'filters %s before returning rows while keeping tenant and period scope',
    async (recordScope) => {
      const t = setup();
      await t.service.listForClient(t.user, {
        recordScope,
        year: 2099,
        status: 'IN_PROGRESS',
        frequency: 'MONTHLY',
      });
      expect(t.qb.where).toHaveBeenCalledWith('a.clientId = :clientId', {
        clientId: 'client',
      });
      expect(t.qb.andWhere).toHaveBeenCalledWith(
        recordScope === 'TEST'
          ? `NOT ${actualAuditSql('a')}`
          : actualAuditSql('a'),
      );
      expect(t.qb.andWhere).toHaveBeenCalledWith('a.periodYear = :yy', {
        yy: 2099,
      });
      expect(t.qb.andWhere).toHaveBeenCalledWith('a.status = :st', {
        st: 'IN_PROGRESS',
      });
      expect(t.qb.andWhere.mock.invocationCallOrder[0]).toBeLessThan(
        t.qb.getMany.mock.invocationCallOrder[0],
      );
    },
  );

  it('retains branch assignment restrictions in the test list', async () => {
    const t = setup();
    await t.service.listForClient(
      { ...t.user, userType: 'BRANCH' },
      { recordScope: 'TEST' },
    );
    expect(t.qb.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('portal_ub.branch_id=a.branchId'),
      { portalUser: 'client-user', portalClient: 'client' },
    );
  });

  it('rejects invalid scopes before accessing records', async () => {
    const t = setup();
    await expect(
      t.service.listForClient(t.user, { recordScope: 'ALL' } as any),
    ).rejects.toThrow('Invalid audit record scope');
    expect(t.repo.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('keeps the legacy summary actual-only', async () => {
    const t = setup();
    t.qb.getRawMany.mockResolvedValue([{ status: 'IN_PROGRESS', count: '2' }]);
    expect(await t.service.getSummaryForClient(t.user)).toEqual({
      total: 2,
      inProgress: 2,
      completed: 0,
      planned: 0,
    });
    expect(t.qb.andWhere).toHaveBeenCalledWith(actualAuditSql('a'));
  });
});
