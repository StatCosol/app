import { PayrollService } from './payroll.service';
import { PayrollRunsService } from './payroll-runs.service';
import { PayrollClientScopeService } from './payroll-client-scope.service';
function query(result: any = []) {
  const q: any = {};
  for (const k of [
    'select',
    'addSelect',
    'where',
    'andWhere',
    'innerJoin',
    'orderBy',
    'groupBy',
  ])
    q[k] = jest.fn(() => q);
  q.getRawMany = jest.fn(async () => result);
  q.getMany = jest.fn(async () => result);
  return q;
}
describe('readiness payroll scope and persisted totals', () => {
  it.each(['CRM', 'PAYROLL', 'ADMIN', 'CEO', 'CCO'])(
    'uses shared assignment scope for %s client lists',
    async (roleCode) => {
      const s: any = Object.create(PayrollService.prototype);
      const q = query([{ id: 'allowed' }]);
      s.clientRepo = { createQueryBuilder: () => q };
      s.scopeService = {
        getAssignedClientIds: jest.fn(async () => ['allowed']),
      };
      expect(await s.getAssignedClients({ id: 'user', roleCode })).toEqual([
        { id: 'allowed' },
      ]);
      expect(q.where).toHaveBeenCalledWith('c.id IN (:...ids)', {
        ids: ['allowed'],
      });
    },
  );
  it('does not query all clients for an unassigned CRM', async () => {
    const s: any = Object.create(PayrollService.prototype);
    s.clientRepo = { createQueryBuilder: jest.fn() };
    s.scopeService = { getAssignedClientIds: async () => [] };
    expect(await s.getAssignedClients({ id: 'u', roleCode: 'CRM' })).toEqual(
      [],
    );
    expect(s.clientRepo.createQueryBuilder).not.toHaveBeenCalled();
  });
  it('keeps CRM PF/ESI summary inside the same scope', async () => {
    const s: any = Object.create(PayrollService.prototype);
    s.scopeService = { getAssignedClientIds: jest.fn(async () => []) };
    const r = await s.getPfEsiSummary({ id: 'u', roleCode: 'CRM' });
    expect(r.clients).toEqual([]);
    expect(s.scopeService.getAssignedClientIds).toHaveBeenCalled();
  });
  it('scopes payroll runs and aggregates persisted earnings instead of inventing zeros', async () => {
    const runs = query([
      {
        id: 'run',
        periodYear: '2025',
        periodMonth: '12',
        clientId: 'allowed',
        status: 'APPROVED',
      },
    ]);
    const amounts = query([{ runId: 'run', cnt: '3', grossTotal: '60000.75' }]);
    const s: any = Object.create(PayrollRunsService.prototype);
    s.scope = { getAssignedClientIds: async () => ['allowed'] };
    s.runRepo = { createQueryBuilder: () => runs };
    s.runEmployeeRepo = { createQueryBuilder: () => amounts };
    const [r] = await s.listPayrollRuns({ id: 'u', roleCode: 'CRM' }, {});
    expect(r).toMatchObject({
      periodYear: 2025,
      periodMonth: 12,
      employeeCount: 3,
      grossTotal: 60000.75,
    });
    expect(runs.where).toHaveBeenCalledWith('r.client_id IN (:...ids)', {
      ids: ['allowed'],
    });
    expect(amounts.addSelect).toHaveBeenCalledWith(
      'SUM(e.gross_earnings)',
      'grossTotal',
    );
  });
  it('does not use a requested foreign client to expand the run scope', async () => {
    const q = query([]);
    const s: any = Object.create(PayrollRunsService.prototype);
    s.scope = { getAssignedClientIds: async () => ['allowed'] };
    s.runRepo = { createQueryBuilder: () => q };
    s.runEmployeeRepo = {};
    await s.listPayrollRuns(
      { id: 'u', roleCode: 'CRM' },
      { clientId: 'foreign' },
    );
    expect(q.where).toHaveBeenCalledWith('r.client_id IN (:...ids)', {
      ids: ['allowed'],
    });
    expect(q.andWhere).toHaveBeenCalledWith('r.client_id = :cid', {
      cid: 'foreign',
    });
  });
  it('returns no runs for an unassigned CRM', async () => {
    const s: any = Object.create(PayrollRunsService.prototype);
    s.scope = { getAssignedClientIds: async () => [] };
    expect(await s.listPayrollRuns({ id: 'u', roleCode: 'CRM' }, {})).toEqual(
      [],
    );
  });
  it('preserves global CEO visibility without widening CRM access', async () => {
    const q = query([{ id: 'one' }]);
    const s = new PayrollClientScopeService(
      { createQueryBuilder: () => q } as any,
      {} as any,
    );
    expect(
      await s.getAssignedClientIds({ id: 'ceo', roleCode: 'CEO' } as any),
    ).toEqual(['one']);
  });
});
it('requires a CRM assignment rather than another assignment type', async () => {
  const manager = {
    query: jest.fn(async (_sql: string, _params: any[]) => [
      { client_id: 'allowed' },
    ]),
  };
  const s = new PayrollClientScopeService({ manager } as any, {} as any);
  expect(
    await s.getAssignedClientIds({ id: 'crm', roleCode: 'CRM' } as any),
  ).toEqual(['allowed']);
  expect(manager.query.mock.calls[0][0]).toContain("a.assignment_type = 'CRM'");
});
