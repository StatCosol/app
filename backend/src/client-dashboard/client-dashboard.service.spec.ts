import { ClientDashboardService } from './client-dashboard.service';
import { ClientDashboardQueryDto } from './dto/dashboard-query.dto';
import { ReqUser } from '../access/access-scope.service';

// Minimal chainable query builder mock
const qb = <_T>(options: { counts?: number[]; raws?: any[][] }) => {
  let countIdx = 0;
  let rawIdx = 0;
  const builder: any = {
    where: () => builder,
    andWhere: () => builder,
    select: () => builder,
    addSelect: () => builder,
    groupBy: () => builder,
    addGroupBy: () => builder,
    leftJoin: () => builder,
    leftJoinAndSelect: () => builder,
    clone: () => builder,
    getCount: jest.fn(async () => options.counts?.[countIdx++] ?? 0),
    getRawMany: jest.fn(async () => options.raws?.[rawIdx++] ?? []),
  };
  return builder;
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
  const clientUser: ReqUser = {
    id: 'u1',
    userId: 'u1',
    roleCode: 'CLIENT',
    email: 'client@example.com',
    clientId: 'c1',
    userType: 'BRANCH',
    employeeId: null,
    branchIds: ['b1'],
    assignedClientIds: ['c1'],
  };

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
      {} as any,
      mockUsersService as any,
    );

    const dto: ClientDashboardQueryDto = { month: '2026-02' } as any;
    const res: any = await svc.getPfEsiSummary(clientUser, dto);

    expect(res.pf.registered).toBe(2);
    expect(res.pf.notRegisteredApplicable).toBe(1);
    expect(res.esi.registered).toBe(3);
    expect(res.esi.notRegisteredApplicable).toBe(1);
    expect(employeesRepo.createQueryBuilder).toHaveBeenCalled();
  });

  it('counts someone registered whose pay has left them out of the wage ceiling', async () => {
    // A rise past the ESI ceiling makes an employee no longer applicable while
    // they stay registered and covered. Requiring both hid them from the
    // figure, so the registered counts must not mention applicability.
    const clauses: string[] = [];
    const recording: any = {
      where: () => recording,
      andWhere: (c: string) => {
        clauses.push(c);
        return recording;
      },
      select: () => recording,
      clone: () => recording,
      getCount: jest.fn(async () => 0),
      getRawMany: jest.fn(async () => []),
    };
    const employeesRepo: any = {
      createQueryBuilder: jest.fn(() => recording),
    };
    const svc = new ClientDashboardService(
      employeesRepo,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      mockUsersService as any,
    );

    await svc.getPfEsiSummary(clientUser, { month: '2026-02' } as any);

    const registeredClauses = clauses.filter(
      (c) => /_registered = TRUE/.test(c) && !/FALSE|IS NULL/.test(c),
    );
    expect(registeredClauses).toEqual([
      'e.pf_registered = TRUE',
      'e.esi_registered = TRUE',
    ]);
    for (const clause of registeredClauses)
      expect(clause).not.toMatch(/_applicable/);
    // The pending counts stay scoped to who it currently applies to.
    expect(
      clauses.some((c) => /pf_applicable = TRUE/.test(c) && /FALSE/.test(c)),
    ).toBe(true);
  });

  it('computes contractor upload percent with top/bottom lists', async () => {
    // branch_contractor returns contractor IDs + names (source of truth)
    const bcRows = [{ contractorId: 'cA', name: 'ACME' }];
    const requiredRows = [{ contractorId: 'cA', expected: '10' }];
    const uploadedRows = [{ contractorId: 'cA', uploaded: '5' }];

    const branchContractorRepo: any = {
      createQueryBuilder: jest.fn(() => qb({ raws: [bcRows] })),
    };

    const requiredRepo: any = {
      createQueryBuilder: jest.fn(() => qb({ raws: [requiredRows] })),
    };

    const docsRepo: any = {
      createQueryBuilder: jest.fn(() => qb({ raws: [uploadedRows] })),
    };

    const svc = new ClientDashboardService(
      {} as any,
      docsRepo,
      requiredRepo,
      branchContractorRepo,
      {} as any,
      mockUsersService as any,
    );

    const dto: ClientDashboardQueryDto = { month: '2026-02' } as any;
    const res: any = await svc.getContractorUploadSummary(clientUser, dto);

    expect(res.overallPercent).toBe(50);
    expect(res.contractors[0]).toMatchObject({
      contractorUserId: 'cA',
      name: 'ACME',
      uploaded: 5,
      expected: 10,
      percent: 50,
    });
    expect(res.top10.length).toBe(1);
    expect(res.bottom10.length).toBe(1);
    expect(branchContractorRepo.createQueryBuilder).toHaveBeenCalled();
    expect(requiredRepo.createQueryBuilder).toHaveBeenCalled();
    expect(docsRepo.createQueryBuilder).toHaveBeenCalled();
  });
});
