import { AuditListingService } from './audit-listing.service';
import { actualAuditSql } from '../common/actual-records';

describe('Auditor assigned audit record scope', () => {
  function setup() {
    const qb: any = {};
    for (const key of [
      'leftJoinAndSelect',
      'where',
      'andWhere',
      'addSelect',
      'orderBy',
      'addOrderBy',
      'skip',
      'take',
    ])
      qb[key] = jest.fn().mockReturnValue(qb);
    qb.getManyAndCount = jest.fn().mockResolvedValue([[], 0]);
    const repo = { createQueryBuilder: jest.fn(() => qb), findOne: jest.fn() };
    const service = new AuditListingService(
      repo as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    return {
      service,
      qb,
      repo,
      user: { userId: 'assigned-auditor', roleCode: 'AUDITOR' } as any,
    };
  }
  it.each([undefined, 'ACTUAL', 'TEST'] as const)(
    'applies %s scope before assigned audit pagination and totals',
    async (recordScope) => {
      const t = setup();
      await t.service.listForAuditor(t.user, {
        recordScope,
        page: 2,
        pageSize: 10,
        branchId: 'branch-a',
        clientId: 'client-a',
        contractorUserId: 'contractor-a',
        year: 2026,
      } as any);
      expect(t.qb.where).toHaveBeenCalledWith('a.assignedAuditorId = :uid', {
        uid: 'assigned-auditor',
      });
      expect(t.qb.andWhere).toHaveBeenCalledWith(
        recordScope === 'TEST'
          ? `NOT ${actualAuditSql('a')}`
          : actualAuditSql('a'),
      );
      for (const [sql, params] of [
        ['a.branchId = :bid', { bid: 'branch-a' }],
        ['a.clientId = :cid', { cid: 'client-a' }],
        ['a.contractorUserId = :kid', { kid: 'contractor-a' }],
        ['a.periodYear = :yy', { yy: 2026 }],
      ] as const)
        expect(t.qb.andWhere).toHaveBeenCalledWith(sql, params);
      expect(t.qb.andWhere.mock.invocationCallOrder[0]).toBeLessThan(
        t.qb.getManyAndCount.mock.invocationCallOrder[0],
      );
      expect(t.qb.skip).toHaveBeenCalledWith(10);
      expect(t.qb.take).toHaveBeenCalledWith(10);
    },
  );
  it('rejects unsupported scope without querying any records', async () => {
    const t = setup();
    await expect(
      t.service.listForAuditor(t.user, { recordScope: 'ALL' } as any),
    ).rejects.toThrow('Invalid audit record scope');
    expect(t.repo.createQueryBuilder).not.toHaveBeenCalled();
  });
  it('does not broaden role access in test scope', async () => {
    const t = setup();
    await expect(
      t.service.listForAuditor({ ...t.user, roleCode: 'CLIENT' }, {
        recordScope: 'TEST',
      } as any),
    ).rejects.toThrow('Auditor access only');
    expect(t.repo.createQueryBuilder).not.toHaveBeenCalled();
  });
  it('preserves assigned test evidence and denies another auditor direct access', async () => {
    const t = setup();
    const audit = {
      id: 'test-audit',
      assignedAuditorId: 'assigned-auditor',
      notes: 'TEST ONLY fixture',
    };
    t.qb.getManyAndCount.mockResolvedValue([[audit], 1]);
    expect(
      await t.service.listForAuditor(t.user, { recordScope: 'TEST' } as any),
    ).toMatchObject({ data: [audit], total: 1 });
    t.repo.findOne.mockResolvedValue(audit);
    expect(await t.service.getForAuditor(t.user, audit.id)).toBe(audit);
    await expect(
      t.service.getForAuditor({ ...t.user, userId: 'other-auditor' }, audit.id),
    ).rejects.toThrow('Not your audit');
  });
});
