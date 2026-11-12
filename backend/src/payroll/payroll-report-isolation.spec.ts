import { PayrollReportsService } from './payroll-reports.service';

describe('Operational payroll report isolation', () => {
  function setup(assignments = [{ clientId: 'client-a' }]) {
    const predicates: string[] = [];
    const params: Record<string, any> = {};
    const qb: any = {};
    for (const name of [
      'select',
      'innerJoin',
      'groupBy',
      'orderBy',
      'addOrderBy',
    ])
      qb[name] = jest.fn(() => qb);
    for (const name of ['where', 'andWhere'])
      qb[name] = jest.fn((sql, values) => {
        predicates.push(sql);
        Object.assign(params, values);
        return qb;
      });
    const verifyScope = () => {
      expect(predicates.join(' ')).toContain('NOT (COALESCE(r.title');
      expect(predicates.join(' ')).toContain('COALESCE(r.approvalComments');
      expect(params.payrollTestMarker).toContain('SYNTHETIC TEST ONLY');
      expect(params.reportableStatuses).toEqual(['APPROVED']);
      return [];
    };
    qb.getMany = jest.fn(async () => verifyScope());
    qb.getRawMany = jest.fn(async () => verifyScope());
    const service = new PayrollReportsService(
      {} as any,
      { createQueryBuilder: () => qb } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { find: async () => assignments } as any,
    );
    return { service, qb, predicates, params };
  }
  const user = { id: 'staff', roleCode: 'PAYROLL' } as any;
  it.each(['bank', 'muster', 'cost', 'tds'])(
    'filters test runs before %s rows or totals are read',
    async (type) => {
      const { service, params } = setup();
      const result =
        type === 'bank'
          ? await service.generateBankStatement(
              user,
              undefined,
              'client-a',
              2025,
              12,
            )
          : type === 'muster'
            ? await service.generateMusterRoll(user, 'client-a', 2025, 12)
            : type === 'cost'
              ? await service.generateCostAnalysis(user, 'client-a', 2025)
              : await service.generateForm16Summary(
                  user,
                  'client-a',
                  '2025-26',
                );
      expect(params.clientId).toBe('client-a');
      expect(result.csv.split('\n')).toHaveLength(1);
    },
  );
  it('does not bypass isolation for an explicit run id', async () => {
    const { service, params } = setup();
    await service.generateBankStatement(user, 'test-run');
    expect(params.runId).toBe('test-run');
    expect(params.scopeClientIds).toEqual(['client-a']);
  });
  it('rejects another client before querying report rows', async () => {
    const { service, qb } = setup();
    await expect(
      service.generateBankStatement(user, undefined, 'client-b'),
    ).rejects.toThrow('access');
    expect(qb.getMany).not.toHaveBeenCalled();
  });
});
