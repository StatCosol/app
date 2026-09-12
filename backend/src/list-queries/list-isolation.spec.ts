import { DocListService } from './doc-list.service';
import { AuditListService } from './audit-list.service';
import { ThreadListService } from './thread-list.service';
import { EscalationListService } from './escalation-list.service';
import { validate } from 'class-validator';
import { ScopedListQueryDto } from '../common/dto/scoped-list-query.dto';

function setup(Service: any) {
  const where: Array<[string, unknown]> = [];
  const qb: any = {};
  for (const method of [
    'leftJoinAndSelect',
    'orderBy',
    'addOrderBy',
    'skip',
    'take',
  ])
    qb[method] = () => qb;
  qb.andWhere = (sql: string, args: unknown) => {
    where.push([sql, args]);
    return qb;
  };
  qb.getManyAndCount = jest.fn().mockResolvedValue([[], 0]);
  const scope = {
    getScope: async () => ({ level: 'client', clientId: 'c' }),
    applyToQb: jest.fn(),
    resolveClientId: () => 'c',
    resolveBranchId: (_u: any, b: string) => b,
  };
  return {
    service: new Service(
      { getRepository: () => ({ createQueryBuilder: () => qb }) },
      scope,
    ),
    where,
    qb,
  };
}
describe('List ownership, selected branch and reporting period', () => {
  it('binds contractor owner even inside the same company', async () => {
    const { service, where } = setup(DocListService);
    await service.listContractorDocs(
      { id: 'owner', roleCode: 'CONTRACTOR' },
      {},
    );
    expect(where).toContainEqual([
      'cd.contractorUserId = :ownerId',
      { ownerId: 'owner' },
    ]);
  });
  it('rejects an absent contractor identity before reading data', async () => {
    const { service, qb } = setup(DocListService);
    await expect(
      service.listContractorDocs({ roleCode: 'CONTRACTOR' }, {}),
    ).rejects.toThrow('identity');
    expect(qb.getManyAndCount).not.toHaveBeenCalled();
  });
  it('uses exact audit periods, including quarterly/half-year/annual coverage', async () => {
    const { service, where } = setup(AuditListService);
    await service.list({ roleCode: 'CLIENT' }, { month: '2026-02' });
    expect(where).toContainEqual([
      'a.periodCode IN (:...periodCodes)',
      { periodCodes: ['2026-02', '2026-Q1', '2026-H1', '2026'] },
    ]);
    expect(where.some(([sql]) => sql.includes('LIKE'))).toBe(false);
  });
  it.each([
    [ThreadListService, 'listThreads', 'th'],
    [ThreadListService, 'listHelpdesk', 'hd'],
    [EscalationListService, 'list', 'e'],
  ])('retains requested branch for %p %s', async (Service, method, alias) => {
    const { service, where } = setup(Service);
    await service[method]({ id: 'u', roleCode: 'CLIENT' }, { branchId: 'b2' });
    expect(where).toContainEqual([`${alias}.branchId = :bid`, { bid: 'b2' }]);
  });
  it.each(['2026-00', '2026-13', '2026-99'])(
    'rejects impossible month %s',
    async (month) => {
      const dto = Object.assign(new ScopedListQueryDto(), { month });
      expect((await validate(dto)).some((e) => e.property === 'month')).toBe(
        true,
      );
    },
  );
});
