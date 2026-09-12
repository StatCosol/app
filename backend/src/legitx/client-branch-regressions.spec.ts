import { LegitxScopeService } from './legitx-scope.service';
import { LegitxDashboardService } from './legitx-dashboard.service';
import { LegitxAssistantService } from './legitx-assistant.service';
import { LegitxComplianceStatusService } from './legitx-compliance-status.service';

const user = {
  id: 'u',
  userId: 'u',
  roleCode: 'CLIENT',
  userType: 'BRANCH',
  clientId: 'c',
  branchIds: ['b1', 'b2'],
} as any;
function scopeService(level = 'branches', branches = ['b1', 'b2']) {
  return new LegitxScopeService(
    {
      getScope: async () => ({ level, clientId: 'c', clientIds: ['c'] }),
    } as any,
    { getUserBranchIds: async () => branches } as any,
    {
      query: async (sql: string, params: any[]) =>
        sql.includes('SELECT clientid')
          ? [{ clientid: params[0] === 'foreign' ? 'other' : 'c' }]
          : branches.map((id) => ({ id })),
    } as any,
  );
}
describe('Client and Branch Desk scope', () => {
  it('preserves every live branch assignment without an explicit filter', async () => {
    expect(await scopeService().resolve(user, {})).toEqual({
      clientId: 'c',
      branchId: null,
      allowedBranchIds: ['b1', 'b2'],
    });
  });
  it('accepts the second assigned branch', async () => {
    expect(
      (await scopeService().resolve(user, { branchId: 'b2' })).branchId,
    ).toBe('b2');
  });
  it('rejects another branch in the same company', async () => {
    await expect(
      scopeService().resolve(user, { branchId: 'b3' }),
    ).rejects.toThrow('not in scope');
  });
  it('rejects cross-company branch access even for master users', async () => {
    await expect(
      scopeService('client').resolve(
        { ...user, userType: 'MASTER' },
        { branchId: 'foreign' },
      ),
    ).rejects.toThrow('not in company');
  });
  it('fails closed when all mappings have been removed', async () => {
    await expect(
      scopeService('branches', []).resolve(user, {}),
    ).rejects.toThrow('No assigned branches');
  });
  it('rejects a conflicting company parameter', async () => {
    await expect(
      scopeService().resolve(user, { clientId: 'other' }),
    ).rejects.toThrow('Company not in scope');
  });
  it('scopes every dashboard SQL query and binds every placeholder', async () => {
    const calls: Array<[string, unknown[]]> = [];
    const db = {
      one: async (sql: string, params: unknown[]) => {
        calls.push([sql, params]);
        return undefined;
      },
      many: async (sql: string, params: unknown[]) => {
        calls.push([sql, params]);
        return [];
      },
    };
    await new LegitxDashboardService(db as any).getSummary(
      'u',
      { month: 9, year: 2026 },
      'c',
      ['b1', 'b2'],
    );
    expect(calls.length).toBeGreaterThan(10);
    for (const [sql, params] of calls) {
      expect(params).toContainEqual(['b1', 'b2']);
      expect(sql).toMatch(/ANY\(\$\d+::uuid\[\]\)/);
      const indexes = [...sql.matchAll(/\$(\d+)/g)].map((m) => Number(m[1]));
      expect(Math.max(...indexes)).toBe(params.length);
    }
    expect(calls.find(([sql]) => sql.includes('FROM audits a'))?.[0]).toContain(
      'a.branch_id = ANY',
    );
    expect(
      calls.find(([sql]) => sql.includes('JOIN scoped_runs'))?.[0],
    ).toContain('pre.branch_id = ANY');
    expect(
      calls.find(([sql]) => sql.includes('ORDER BY percent'))?.[0],
    ).not.toContain('LIMIT 10');
  });
  it.each([LegitxDashboardService, LegitxComplianceStatusService])(
    'surfaces database failure instead of false zero totals',
    async (Service) => {
      const service = new Service({
        one: async () => {
          throw new Error('offline');
        },
        many: async () => {
          throw new Error('offline');
        },
      } as any);
      await expect(
        (service as any).getSummary(
          Service === LegitxDashboardService
            ? 'u'
            : { month: 9, year: 2026, clientId: 'c' },
          { month: 9, year: 2026 },
          'c',
        ),
      ).rejects.toThrow('unavailable');
    },
  );
});

describe('Recurring task pagination', () => {
  it('retains separate weekly tasks for the same compliance and branch', async () => {
    const many = jest.fn().mockResolvedValue([
      { task_id: 1, compliance_id: 7, branch_id: 'b1', due_date: null },
      { task_id: 2, compliance_id: 7, branch_id: 'b1', due_date: null },
    ]);
    const rows = await new LegitxComplianceStatusService({
      many,
    } as any).getTasks({
      month: 9,
      year: 2026,
      clientId: 'c',
      allowedBranchIds: ['b1'],
      limit: 2,
      offset: 2,
    });
    expect(rows.map((r) => r.taskId)).toEqual([1, 2]);
    expect(many.mock.calls[0][1].slice(-2)).toEqual([2, 2]);
  });
});

describe('Compliance assistant', () => {
  function setup(ready = false, content = '{}') {
    const task = {
      taskId: 1,
      title: 'Evidence required',
      status: 'OVERDUE',
      branchId: 'b2',
      branchName: 'Branch Two',
      dueDate: '2026-09-01',
      remarks: 'private reviewer note',
    };
    const resolve = jest.fn().mockResolvedValue({
      clientId: 'c',
      branchId: null,
      allowedBranchIds: ['b1', 'b2'],
    });
    const getTasks = jest
      .fn()
      .mockImplementation(async (p) => (p.status === 'OVERDUE' ? [task] : []));
    const completeWithTracking = jest.fn().mockResolvedValue({ content });
    const service = new LegitxAssistantService(
      { resolve } as any,
      { getTasks } as any,
      { isReady: async () => ready, completeWithTracking } as any,
    );
    return { service, resolve, getTasks, completeWithTracking };
  }
  it('returns factual actions without calling an unconfigured provider', async () => {
    const { service, completeWithTracking, getTasks } = setup();
    const result = await service.plan(user, { month: 9, year: 2026 });
    expect(result.mode).toBe('RULES');
    expect(result.actions[0].queryParams).toEqual({
      month: 9,
      year: 2026,
      branchId: 'b2',
      status: 'OVERDUE',
    });
    expect(result.actions[0].route).toBe('/branch/compliance/status');
    expect(getTasks).toHaveBeenCalledWith(
      expect.objectContaining({ allowedBranchIds: ['b1', 'b2'] }),
    );
    expect(completeWithTracking).not.toHaveBeenCalled();
  });
  it('uses AI explanations only for known IDs and never trusts model routes', async () => {
    const { service, completeWithTracking } = setup(
      true,
      JSON.stringify({
        actions: [
          {
            id: '1',
            explanation: 'Recorded overdue task.',
            nextAction: 'Review the evidence.',
            route: '/admin',
          },
          { id: 'foreign', explanation: 'Other tenant' },
        ],
      }),
    );
    const result = await service.plan(user, {});
    expect(result.mode).toBe('AI');
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].route).toBe('/branch/compliance/status');
    expect(completeWithTracking.mock.calls[0][1]).not.toContain(
      'private reviewer note',
    );
    expect(completeWithTracking.mock.calls[0][1]).not.toContain('Branch Two');
  });
  it('falls back honestly when AI output cannot be parsed', async () => {
    const { service } = setup(true, 'invalid JSON');
    expect((await service.plan(user, {})).mode).toBe('RULES');
  });
  it('does not load evidence or call AI when scope validation fails', async () => {
    const { service, resolve, getTasks, completeWithTracking } = setup(true);
    resolve.mockRejectedValue(new Error('not in scope'));
    await expect(service.plan(user, {})).rejects.toThrow('not in scope');
    expect(getTasks).not.toHaveBeenCalled();
    expect(completeWithTracking).not.toHaveBeenCalled();
  });
  it('does not generate an empty reassurance when the evidence request fails', async () => {
    const { service, getTasks, completeWithTracking } = setup(true);
    getTasks.mockRejectedValue(new Error('offline'));
    await expect(service.plan(user, {})).rejects.toThrow('offline');
    expect(completeWithTracking).not.toHaveBeenCalled();
  });
});
