import { AuditListingService } from './audit-listing.service';
import { actualAuditSql } from '../common/actual-records';
import { StatutoryAuditEntryService } from './statutory-audit-entry.service';

describe('Contractor audit record isolation', () => {
  function setup() {
    const qb: any = {};
    for (const name of [
      'leftJoinAndSelect',
      'leftJoin',
      'where',
      'andWhere',
      'addSelect',
      'orderBy',
      'addOrderBy',
      'skip',
      'take',
    ])
      qb[name] = jest.fn().mockReturnValue(qb);
    qb.getManyAndCount = jest.fn().mockResolvedValue([[], 0]);
    const repo = { createQueryBuilder: jest.fn(() => qb) };
    const service = new AuditListingService(
      repo as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    const user: any = {
      userId: 'vendor',
      clientId: 'client',
      roleCode: 'CONTRACTOR',
    };
    return { qb, repo, service, user };
  }
  it.each([undefined, 'ACTUAL', 'TEST'] as const)(
    'filters %s before pagination and counts without weakening vendor ownership',
    async (recordScope) => {
      const t = setup();
      await t.service.listForContractor(t.user, {
        recordScope,
        page: 2,
        pageSize: 10,
        year: 2099,
        branchId: 'branch',
      });
      expect(t.qb.addSelect).toHaveBeenCalledWith(['contractor.id', 'contractor.name']);
      expect(t.qb.where).toHaveBeenCalledWith(
        expect.stringContaining('a.contractorUserId = :uid'),
        {
          uid: 'vendor',
          clientId: 'client',
          contractorAuditType: 'CONTRACTOR',
        },
      );
      expect(t.qb.where.mock.calls[0][0]).toContain(
        'bc.contractor_user_id = :uid',
      );
      expect(t.qb.andWhere).toHaveBeenCalledWith(
        recordScope === 'TEST'
          ? `NOT ${actualAuditSql('a')}`
          : actualAuditSql('a'),
      );
      expect(t.qb.andWhere).toHaveBeenCalledWith('a.branchId = :bid', {
        bid: 'branch',
      });
      expect(t.qb.andWhere).toHaveBeenCalledWith('a.periodYear = :yy', {
        yy: 2099,
      });
      expect(t.qb.skip).toHaveBeenCalledWith(10);
      expect(t.qb.andWhere.mock.invocationCallOrder.at(-1)).toBeLessThan(
        t.qb.getManyAndCount.mock.invocationCallOrder[0],
      );
    },
  );
  it('rejects invalid scopes before reading audits', async () => {
    const t = setup();
    await expect(
      t.service.listForContractor(t.user, { recordScope: 'ALL' } as any),
    ).rejects.toThrow('Invalid audit record scope');
    expect(t.repo.createQueryBuilder).not.toHaveBeenCalled();
  });
  it('rejects other roles even with Test scope', async () => {
    const t = setup();
    await expect(
      t.service.listForContractor(
        { ...t.user, roleCode: 'CLIENT' },
        { recordScope: 'TEST' },
      ),
    ).rejects.toThrow();
    expect(t.repo.createQueryBuilder).not.toHaveBeenCalled();
  });
  it('also excludes synthetic online assignments from the vendor Audit Documents selector', async () => {
    const qb: any = {};
    for (const name of [
      'innerJoin',
      'leftJoinAndSelect',
      'where',
      'andWhere',
      'orderBy',
    ])
      qb[name] = jest.fn().mockReturnValue(qb);
    qb.getMany = jest.fn().mockResolvedValue([]);
    const service = new StatutoryAuditEntryService(
      { getRepository: () => ({ createQueryBuilder: () => qb }) } as any,
      {} as any,
    );
    await service.auditeeAssignments({
      userId: 'vendor',
      roleCode: 'CONTRACTOR',
    } as any);
    expect(qb.where).toHaveBeenCalledWith('a.contractorUserId=:uid', {
      uid: 'vendor',
    });
    expect(qb.andWhere).toHaveBeenCalledWith(actualAuditSql('a'));
    expect(qb.innerJoin).toHaveBeenCalledWith(
      'audit_entry_sessions',
      's',
      expect.stringContaining("s.audit_mode='ONLINE'"),
    );
  });
});
