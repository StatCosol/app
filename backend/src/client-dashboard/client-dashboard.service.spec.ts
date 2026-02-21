import { ClientDashboardService } from './client-dashboard.service';
import { ClientDashboardQueryDto } from './dto/dashboard-query.dto';

// Minimal chainable query builder mock
const qb = <T>(options: {
  counts?: number[];
  raws?: any[][];
}) => {
  let countIdx = 0;
  let rawIdx = 0;
  const builder: any = {
    where: () => builder,
    andWhere: () => builder,
    select: () => builder,
    addSelect: () => builder,
    groupBy: () => builder,
    leftJoin: () => builder,
    leftJoinAndSelect: () => builder,
    clone: () => builder,
    getCount: jest.fn(async () => options.counts?.[countIdx++] ?? 0),
    getRawMany: jest.fn(async () => options.raws?.[rawIdx++] ?? []),
  };
  return builder as any;
};

const mockUsersService = {
  getMe: jest.fn().mockResolvedValue({
    userId: 'u1',
    clientId: 'c1',
    branchIds: ['b1'],
    isMasterUser: false,
  }),
};

describe('ClientDashboardService', () => {
  it('computes PF/ESI summary with branch scoping', async () => {
    const employeesRepo: any = {
      createQueryBuilder: jest.fn(() =>
        qb({
          counts: [2, 3],
          raws: [
            [
              {
                id: 'e1',
                employeeCode: 'E001',
                firstName: 'Ravi',
                lastName: null,
                dateOfJoining: '2099-01-01',
                pfApplicableFrom: null,
              },
            ],
            [
              {
                id: 'e2',
                employeeCode: 'E002',
                firstName: 'Suresh',
                lastName: 'K',
                dateOfJoining: '2099-01-01',
                esiApplicableFrom: null,
              },
            ],
          ],
        }),
      ),
    };

    const svc = new ClientDashboardService(
      employeesRepo,
      {} as any,
      {} as any,
      {} as any,
      mockUsersService as any,
    );

    const dto: ClientDashboardQueryDto = { month: '2026-02' } as any;
    const res = await svc.getPfEsiSummary({ roleCode: 'CLIENT', userId: 'u1' }, dto);

    expect(res.pf.registered).toBe(2);
    expect(res.pf.notRegisteredApplicable).toBe(1);
    expect(res.esi.registered).toBe(3);
    expect(res.esi.notRegisteredApplicable).toBe(1);
    expect(employeesRepo.createQueryBuilder).toHaveBeenCalled();
  });

  it('computes contractor upload percent with top/bottom lists', async () => {
    const requiredRows = [{ contractorId: 'cA', expected: '10' }];
    const uploadedRows = [{ contractorId: 'cA', uploaded: '5' }];

    const requiredRepo: any = {
      createQueryBuilder: jest.fn(() => qb({ raws: [requiredRows] })),
    };

    const docsRepo: any = {
      createQueryBuilder: jest.fn(() => qb({ raws: [uploadedRows] })),
    };

    const usersRepo: any = {
      find: jest.fn().mockResolvedValue([{ id: 'cA', name: 'ACME' }]),
    };

    const svc = new ClientDashboardService(
      {} as any,
      docsRepo,
      requiredRepo,
      usersRepo,
      mockUsersService as any,
    );

    const dto: ClientDashboardQueryDto = { month: '2026-02' } as any;
    const res = await svc.getContractorUploadSummary(
      { roleCode: 'CLIENT', userId: 'u1' },
      dto,
    );

    expect(res.overallPercent).toBe(50);
    expect(res.contractors[0]).toMatchObject({
      contractorId: 'cA',
      name: 'ACME',
      uploaded: 5,
      expected: 10,
      percent: 50,
    });
    expect(res.top10.length).toBe(1);
    expect(res.bottom10.length).toBe(1);
    expect(requiredRepo.createQueryBuilder).toHaveBeenCalled();
    expect(docsRepo.createQueryBuilder).toHaveBeenCalled();
    expect(usersRepo.find).toHaveBeenCalled();
  });
});
