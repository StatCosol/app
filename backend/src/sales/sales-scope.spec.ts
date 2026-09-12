import { SalesService } from './sales.service';
describe('Sales ownership and complete aggregates', () => {
  it('enforces the signed-in owner even when a different owner is requested', async () => {
    const findAndCount = jest.fn().mockResolvedValue([[], 0]);
    const service = new SalesService(
      { findAndCount } as any,
      {} as any,
      {} as any,
    );
    await service.list(
      { id: 'a', userId: 'a', roleCode: 'SALES' },
      { ownerUserId: 'b' },
    );
    expect(findAndCount.mock.calls[0][0].where.ownerUserId).toBe('a');
    await service.list(
      { id: 'admin', userId: 'admin', roleCode: 'ADMIN' },
      { ownerUserId: 'b' },
    );
    expect(findAndCount.mock.calls[1][0].where.ownerUserId).toBe('b');
  });
  it('uses an uncapped grouped query scoped to the sales owner', async () => {
    const qb = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawMany: jest
        .fn()
        .mockResolvedValue([{ stage: 'NEW', count: 501, value: '50100' }]),
    };
    const service = new SalesService(
      { createQueryBuilder: () => qb } as any,
      {} as any,
      {} as any,
    );
    expect(
      await service.summary({ id: 'a', userId: 'a', roleCode: 'SALES' }),
    ).toEqual({ stages: [{ stage: 'NEW', count: 501, value: '50100' }] });
    expect(qb.andWhere).toHaveBeenCalledWith('lead.owner_user_id = :owner', {
      owner: 'a',
    });
    expect(qb.groupBy).toHaveBeenCalledWith('lead.stage');
  });
});
