import { PayrollRunsService } from './payroll-runs.service';

describe('Payroll source list branch identity', () => {
  it('selects and returns branch-specific and explicit company-wide scope', async () => {
    const rows = [
      {
        id: 'branch-run',
        title: 'March primary payroll',
        clientId: 'client',
        branchId: 'branch',
        periodYear: '2026',
        periodMonth: '3',
        status: 'APPROVED',
        approvedAt: '2026-04-01',
      },
      {
        id: 'company-run',
        clientId: 'client',
        branchId: null,
        periodYear: '2026',
        periodMonth: '3',
        status: 'APPROVED',
        approvedAt: '2026-04-01',
      },
    ];
    const chain = (result: unknown[]) => {
      const qb: any = { getRawMany: jest.fn(async () => result) };
      for (const key of [
        'select',
        'addSelect',
        'where',
        'andWhere',
        'innerJoin',
        'orderBy',
        'groupBy',
      ])
        qb[key] = jest.fn(() => qb);
      return qb;
    };
    const runs = chain(rows),
      clients = chain([{ id: 'client' }]),
      employees = chain([{ runId: 'branch-run', cnt: '2' }]);
    const service = new PayrollRunsService(
      { createQueryBuilder: () => runs } as any,
      { createQueryBuilder: () => employees } as any,
      {} as any,
      { createQueryBuilder: () => clients } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    const result = await service.listPayrollRuns(
      { id: 'admin', roleCode: 'ADMIN' } as any,
      { clientId: 'client' },
    );
    expect(runs.addSelect).toHaveBeenCalledWith('r.branch_id', 'branchId');
    expect(result.map((r) => r.branchId)).toEqual(['branch', null]);
    expect(result[0].employeeCount).toBe(2);
    expect(result[0].title).toBe('March primary payroll');
    expect(runs.andWhere).toHaveBeenCalledWith('r.client_id = :cid', {
      cid: 'client',
    });
  });
});
