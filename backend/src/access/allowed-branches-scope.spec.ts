import { ForbiddenException } from '@nestjs/common';
import { AccessScopeService } from './access-scope.service';

/**
 * Which branches a dropdown may offer.
 *
 * Two ways this failed open. A supplied clientId was trusted as given, so a CRM
 * assigned to one client could ask for another client's id and get its
 * branches — the dropdown was the whole authorization. And the branch filter
 * was guarded on `branchIds?.length`, so a branch user whose assignment list
 * was empty got no filter at all and saw every branch of the client.
 */
describe('listAllowedBranches', () => {
  /** Captures the where-clauses so a missing filter is visible, not inferred. */
  function makeService(scope: any) {
    const wheres: string[] = [];
    const qb: any = {
      select: () => qb,
      where: (w: string) => {
        wheres.push(w);
        return qb;
      },
      andWhere: (w: string) => {
        wheres.push(w);
        return qb;
      },
      orderBy: () => qb,
      getMany: async () => [],
    };

    // branchRepo is the 4th argument; the others are unused here.
    const svc = new AccessScopeService(
      {} as any,
      {} as any,
      {} as any,
      { createQueryBuilder: () => qb } as any,
    );
    jest.spyOn(svc, 'getScope').mockResolvedValue(scope);
    return { svc, wheres };
  }

  const user = { id: 'u1', userId: 'u1' } as any;

  it('refuses a clientId the caller is not assigned to', async () => {
    const { svc } = makeService({
      level: 'clients',
      clientIds: ['client-a'],
    });

    await expect(
      svc.listAllowedBranches(user, 'client-b'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('allows a clientId the caller is assigned to', async () => {
    const { svc, wheres } = makeService({
      level: 'clients',
      clientIds: ['client-a'],
    });

    await expect(
      svc.listAllowedBranches(user, 'client-a'),
    ).resolves.toEqual([]);
    expect(wheres.join(' ')).toContain('b.clientId = :cid');
  });

  it('refuses a branch user asking for another client', async () => {
    const { svc } = makeService({
      level: 'branches',
      clientId: 'client-a',
      branchIds: ['branch-1'],
    });

    await expect(
      svc.listAllowedBranches(user, 'client-b'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('returns nothing for a branch user with no assignments', async () => {
    // Previously this produced no branch filter at all, so they saw every
    // branch of the client.
    const { svc, wheres } = makeService({
      level: 'branches',
      clientId: 'client-a',
      branchIds: [],
    });

    await expect(svc.listAllowedBranches(user)).resolves.toEqual([]);
    expect(wheres).toContain('1 = 0');
  });

  it('still filters to the assigned branches when there are some', async () => {
    const { svc, wheres } = makeService({
      level: 'branches',
      clientId: 'client-a',
      branchIds: ['branch-1'],
    });

    await svc.listAllowedBranches(user);
    expect(wheres.join(' ')).toContain('b.id IN (:...bids)');
  });

  it('lets a global-scope user through', async () => {
    const { svc } = makeService({ level: 'all' });
    await expect(
      svc.listAllowedBranches(user, 'any-client'),
    ).resolves.toEqual([]);
  });
});
