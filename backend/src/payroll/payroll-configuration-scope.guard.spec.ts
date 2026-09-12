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
