import { validate } from 'class-validator';
import { AuditListingService } from './audit-listing.service';
import { AuditListQueryDto } from './dto/audit-query.dto';
import { actualAuditSql } from '../common/actual-records';

describe('CRM audit record scope', () => {
  function setup() {
    const qb: any = {};
    for (const method of [
      'leftJoinAndSelect',
      'where',
      'andWhere',
      'addSelect',
      'orderBy',
      'addOrderBy',
      'skip',
      'take',
    ])
      qb[method] = jest.fn().mockReturnValue(qb);
    qb.getManyAndCount = jest.fn().mockResolvedValue([[], 0]);
    const repo = { createQueryBuilder: jest.fn(() => qb), findOne: jest.fn() };
    const assignments = {
      getAssignedClientsForCrm: jest
        .fn()
        .mockResolvedValue([{ id: 'assigned-client' }]),
      isClientAssignedToCrm: jest.fn().mockResolvedValue(true),
    };
    const ds = { query: jest.fn().mockResolvedValue([]) };
    const service = new AuditListingService(
      repo as any,
      {} as any,
      assignments as any,
      {} as any,
      ds as any,
    );
    const user = { userId: 'crm-user', roleCode: 'CRM' } as any;
    return { service, user, qb, repo, assignments, ds };
  }

  it.each([undefined, 'ACTUAL', 'TEST'] as const)(
    'scopes records before pagination and counting (%s)',
    async (recordScope) => {
      const { service, user, qb } = setup();
      await service.listForCrm(user, {
        recordScope,
        page: 2,
        pageSize: 10,
        clientId: 'other-client',
        year: 2099,
      });
      expect(qb.where).toHaveBeenCalledWith('a.clientId IN (:...clientIds)', {
        clientIds: ['assigned-client'],
      });
      expect(qb.andWhere).toHaveBeenCalledWith(
        recordScope === 'TEST'
          ? `NOT ${actualAuditSql('a')}`
          : actualAuditSql('a'),
      );
      expect(qb.andWhere).toHaveBeenCalledWith('a.clientId = :cid', {
        cid: 'other-client',
      });
      expect(qb.andWhere).toHaveBeenCalledWith('a.periodYear = :yy', {
        yy: 2099,
      });
      expect(qb.andWhere.mock.invocationCallOrder[0]).toBeLessThan(
        qb.getManyAndCount.mock.invocationCallOrder[0],
      );
      expect(qb.skip).toHaveBeenCalledWith(10);
      expect(qb.take).toHaveBeenCalledWith(10);
    },
  );

  it('rejects invalid scope in both DTO and service', async () => {
    const dto = Object.assign(new AuditListQueryDto(), { recordScope: 'ALL' });
    expect((await validate(dto)).map((x) => x.property)).toContain(
      'recordScope',
    );
    const { service, user, repo } = setup();
    await expect(
      service.listForCrm(user, { recordScope: 'ALL' as any }),
    ).rejects.toThrow('Invalid audit record scope');
    expect(repo.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('preserves assignment and role restrictions in test scope', async () => {
    const t = setup();
    await expect(
      t.service.listForCrm(
        { ...t.user, roleCode: 'CLIENT' },
        { recordScope: 'TEST' },
      ),
    ).rejects.toThrow('CRM access only');
    t.assignments.getAssignedClientsForCrm.mockResolvedValue([]);
    expect(await t.service.listForCrm(t.user, { recordScope: 'TEST' })).toEqual(
      { data: [], total: 0 },
    );
    expect(t.repo.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('retains assigned test-audit details and report metadata', async () => {
    const t = setup();
    const audit = {
      id: 'fixture',
      clientId: 'assigned-client',
      notes: 'TEST ONLY synthetic',
    };
    t.qb.getManyAndCount.mockResolvedValue([[audit], 1]);
    t.ds.query.mockResolvedValue([
      { audit_id: 'fixture', status: 'SUBMITTED', held_at: '2026-11-14' },
    ] as never);
    const result = await t.service.listForCrm(t.user, { recordScope: 'TEST' });
    expect(result.data).toEqual([
      { ...audit, reportStatus: 'SUBMITTED', reportHeld: true },
    ]);
    t.repo.findOne.mockResolvedValue(audit);
    expect(await t.service.getForCrm(t.user, 'fixture')).toBe(audit);
    t.assignments.isClientAssignedToCrm.mockResolvedValue(false);
    await expect(t.service.getForCrm(t.user, 'fixture')).rejects.toThrow(
      'Client not assigned',
    );
  });
});
