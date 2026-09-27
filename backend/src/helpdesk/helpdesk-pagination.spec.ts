import { BadRequestException } from '@nestjs/common';
import { HelpdeskService } from './helpdesk.service';

function setup() {
  const qb: any = {
    getCount: jest.fn().mockResolvedValue(123),
    getRawAndEntities: jest.fn().mockResolvedValue({ raw: [], entities: [] }),
  };
  for (const method of [
    'leftJoinAndSelect',
    'leftJoin',
    'addSelect',
    'andWhere',
    'orderBy',
    'addOrderBy',
    'offset',
    'limit',
  ]) {
    qb[method] = jest.fn().mockReturnValue(qb);
  }
  const repo = { createQueryBuilder: jest.fn(() => qb) };
  return {
    qb,
    repo,
    service: new HelpdeskService(repo as any, {} as any, {} as any, {} as any),
  };
}
describe('Helpdesk pagination validation', () => {
  it.each(['NaN', 'Infinity', '-1', '0', '1.5', '', '9007199254740992'])(
    'rejects invalid page/limit %s before querying',
    async (input) => {
      const h = setup();
      const queries: Record<string, string>[] = [
        { page: input },
        { limit: input },
      ];
      for (const query of queries) {
        await expect(h.service.adminListTickets(query)).rejects.toBeInstanceOf(
          BadRequestException,
        );
      }
      expect(h.repo.createQueryBuilder).not.toHaveBeenCalled();
    },
  );
  it('rejects unsafe offsets even when each input is an integer', async () => {
    const h = setup();
    await expect(
      h.service.adminListTickets({
        page: String(Number.MAX_SAFE_INTEGER),
        limit: '100',
      }),
    ).rejects.toThrow('out of range');
    expect(h.repo.createQueryBuilder).not.toHaveBeenCalled();
  });
  it('keeps default response shape and a unique ordering for equal timestamps', async () => {
    const h = setup();
    await expect(h.service.adminListTickets({})).resolves.toEqual({
      data: [],
      total: 123,
      page: 1,
      limit: 20,
    });
    expect(h.qb.orderBy).toHaveBeenCalledWith('t.created_at', 'DESC');
    expect(h.qb.addOrderBy).toHaveBeenCalledWith('t.id', 'DESC');
  });
  it('caps page size and applies filters before paging', async () => {
    const h = setup();
    await expect(
      h.service.adminListTickets({ page: '2', limit: '999', category: 'PF' }),
    ).resolves.toMatchObject({ page: 2, limit: 100 });
    expect(h.qb.offset).toHaveBeenCalledWith(100);
    expect(h.qb.limit).toHaveBeenCalledWith(100);
    expect(h.qb.andWhere).toHaveBeenCalledWith('t.category = :cat', {
      cat: 'PF',
    });
  });
});
