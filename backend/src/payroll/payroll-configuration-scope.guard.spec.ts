import { PayrollConfigurationScopeGuard } from './payroll-configuration-scope.guard';
const A = '00000000-0000-4000-8000-000000000001',
  B = '00000000-0000-4000-8000-000000000002',
  ID = '00000000-0000-4000-8000-000000000003';
function harness({
  route = 'structures/:id',
  controller = 'payroll/engine',
  role = 'PAYROLL',
  method = 'GET',
  params = { id: ID },
  body = {},
  query = {},
  storedClient = A,
  denied = false,
}: any = {}) {
  const access = {
    assertClientAllowed: jest.fn(async (_u, c) => {
      if (denied || c !== A) throw new Error('outside assignment');
    }),
    assertCcoClientAllowed: jest.fn(),
  };
  const ds = {
    query: jest.fn(async (_sql: string) => [{ client_id: storedClient }]),
  };
  const guard = new PayrollConfigurationScopeGuard(
    ds as any,
    access as any,
    {
      get: (_k: any, target: any) =>
        target === 'handler' ? route : controller,
    } as any,
  );
  const ctx = {
    getHandler: () => 'handler',
    getClass: () => 'controller',
    switchToHttp: () => ({
      getRequest: () => ({
        user: { id: ID, roleCode: role },
        method,
        params,
        body,
        query,
      }),
    }),
  };
  return { run: () => guard.canActivate(ctx as any), access, ds };
}
describe('payroll configuration client isolation', () => {
  it('checks stored ownership when an ID is used without clientId', async () => {
    const h = harness();
    await expect(h.run()).resolves.toBe(true);
    expect(h.access.assertClientAllowed).toHaveBeenCalledWith(
      expect.anything(),
      A,
    );
  });
  it('rejects an unassigned client even if its structure ID is known', async () => {
    await expect(harness({ storedClient: B }).run()).rejects.toThrow();
  });
  it('does not allow a claimed client to disguise another owner', async () => {
    await expect(harness({ query: { clientId: B } }).run()).rejects.toThrow(
      'same client',
    );
  });
  it('checks CCO managed-client scope in addition to generic access', async () => {
    const h = harness({ role: 'CCO' });
    await h.run();
    expect(h.access.assertCcoClientAllowed).toHaveBeenCalledWith(
      expect.anything(),
      A,
    );
  });
  it('rejects foreign components in bulk structure edits', async () => {
    const h = harness({
      route: 'structures/:structureId/items/bulk',
      method: 'POST',
      params: { structureId: ID },
      body: { items: [{ componentId: ID }] },
    });
    h.ds.query
      .mockResolvedValueOnce([{ client_id: A }])
      .mockResolvedValueOnce([{ client_id: B }]);
    await expect(h.run()).rejects.toThrow('same client');
  });
  it('propagates denial from the managed CCO scope', async () => {
    const h = harness({ role: 'CCO' });
    h.access.assertCcoClientAllowed.mockRejectedValueOnce(
      new Error('CCO client denied'),
    );
    await expect(h.run()).rejects.toThrow('CCO client denied');
  });
  it('protects the separate client-structure calculator', async () => {
    const h = harness({
      controller: 'payroll/client-structures',
      route: ':id/calculate',
      method: 'POST',
    });
    await h.run();
    expect(h.ds.query.mock.calls[0][0]).toContain('payroll_client_structures');
  });
  it('protects nested parameters through their owning rule set', async () => {
    const h = harness({
      route: 'rule-sets/:ruleSetId/parameters',
      params: { ruleSetId: ID },
    });
    await h.run();
    expect(h.ds.query.mock.calls[0][0]).toContain('pay_rule_sets');
  });
  it('rejects non-admin modification of global templates', async () => {
    await expect(
      harness({
        route: 'formula-templates/:id',
        method: 'PUT',
        storedClient: null,
      }).run(),
    ).rejects.toThrow('administrator');
  });
  it('allows shared templates to be read', async () => {
    await expect(
      harness({ route: 'formula-templates/:id', storedClient: null }).run(),
    ).resolves.toBe(true);
  });
});

describe.each([
  { field: 'departmentId', table: 'departments', scopeType: 'DEPARTMENT' },
  { field: 'gradeId', table: 'grades', scopeType: 'GRADE' },
])('$scopeType salary structure ownership', ({ field, table, scopeType }) => {
  const targetId = '00000000-0000-4000-8000-000000000004';
  const request = (method: string, resourceId = targetId) =>
    harness({
      route: method === 'POST' ? 'structures' : 'structures/:id',
      method,
      params: method === 'POST' ? {} : { id: ID },
      body: { clientId: A, scopeType, [field]: resourceId },
    });
  it.each(['POST', 'PUT'])(
    '%s permits a target owned by the structure client',
    async (method) => {
      const h = request(method);
      await expect(h.run()).resolves.toBe(true);
      expect(h.ds.query).toHaveBeenCalledWith(
        'SELECT client_id AS client_id FROM ' + table + ' WHERE id=$1',
        [targetId],
      );
      expect(h.access.assertClientAllowed).toHaveBeenCalledWith(
        expect.anything(),
        A,
      );
    },
  );
  it.each(['POST', 'PUT'])(
    '%s rejects a target belonging to another client',
    async (method) => {
      const h = request(method);
      h.ds.query.mockImplementation(async (sql) => [
        { client_id: sql.includes('FROM ' + table + ' ') ? B : A },
      ]);
      await expect(h.run()).rejects.toThrow('same client');
      expect(h.access.assertClientAllowed).not.toHaveBeenCalled();
    },
  );
  it.each(['POST', 'PUT'])(
    '%s rejects a nonexistent target',
    async (method) => {
      const h = request(method);
      h.ds.query.mockImplementation(async (sql) =>
        sql.includes('FROM ' + table + ' ') ? [] : [{ client_id: A }],
      );
      await expect(h.run()).rejects.toThrow('Payroll resource not found');
      expect(h.access.assertClientAllowed).not.toHaveBeenCalled();
    },
  );
  it.each(['POST', 'PUT'])(
    '%s rejects malformed target IDs',
    async (method) => {
      const h = request(method, 'not-a-uuid');
      await expect(h.run()).rejects.toThrow('Invalid payroll resource ID');
      expect(h.access.assertClientAllowed).not.toHaveBeenCalled();
    },
  );
  it('validates a partial update against the stored structure owner', async () => {
    const h = harness({ method: 'PUT', body: { [field]: targetId } });
    h.ds.query.mockImplementation(async (sql) => [
      { client_id: sql.includes('FROM ' + table + ' ') ? B : A },
    ]);
    await expect(h.run()).rejects.toThrow('same client');
  });
});

/**
 * payroll/setup relied on the global ScopeGuard alone. That checks the path's
 * :clientId against the caller's assignment — but the rule and slab routes act
 * on componentId / ruleId only, so a PAYROLL user could name their OWN client
 * and another client's rule id and list, edit or delete that client's rules and
 * slabs. The guard resolves each id to its stored owner instead.
 */
describe('payroll/setup client isolation', () => {
  const C = '00000000-0000-4000-8000-00000000000c';
  const R = '00000000-0000-4000-8000-00000000000d';
  const setup = (over: any = {}) =>
    harness({
      controller: 'payroll/setup',
      route: ':clientId/components/:componentId/rules/:ruleId/slabs',
      method: 'POST',
      params: { clientId: A, componentId: C, ruleId: R },
      ...over,
    });

  it('rejects a client outside the caller assignment', async () => {
    await expect(setup({ params: { clientId: B } }).run()).rejects.toThrow(
      'outside assignment',
    );
  });

  it('rejects a rule owned by another client behind the caller own clientId', async () => {
    const h = setup();
    h.ds.query.mockImplementation(async (sql: string) =>
      sql.includes('payroll_component_rules')
        ? [{ component_id: C, client_id: B }]
        : [{ client_id: A }],
    );
    await expect(h.run()).rejects.toThrow('same client');
  });

  it('rejects a rule that belongs to a different component than the path says', async () => {
    const h = setup();
    h.ds.query.mockImplementation(async (sql: string) =>
      sql.includes('payroll_component_rules')
        ? [{ component_id: ID, client_id: A }]
        : [{ client_id: A }],
    );
    await expect(h.run()).rejects.toThrow('not found');
  });

  it('allows the caller own rule and checks that client', async () => {
    const h = setup();
    h.ds.query.mockImplementation(async (sql: string) =>
      sql.includes('payroll_component_rules')
        ? [{ component_id: C, client_id: A }]
        : [{ client_id: A }],
    );
    await expect(h.run()).resolves.toBe(true);
    expect(h.access.assertClientAllowed).toHaveBeenCalledWith(
      expect.anything(),
      A,
    );
  });

  it('checks the path client on setup routes with no resource id', async () => {
    const h = setup({
      route: ':clientId',
      method: 'GET',
      params: { clientId: A },
    });
    await expect(h.run()).resolves.toBe(true);
    expect(h.ds.query).not.toHaveBeenCalled();
    expect(h.access.assertClientAllowed).toHaveBeenCalledWith(
      expect.anything(),
      A,
    );
  });
});
