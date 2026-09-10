import { AccessScopeService } from './access-scope.service';

/**
 * A payroll user sees the clients they are assigned to, and no others.
 *
 * PAYROLL used to sit in GLOBAL_ROLES, so getScope() answered `level: 'all'`
 * and every scoped query passed unfiltered — while JwtStrategy was loading
 * getPayrollAssignedClientIds() for that same role and FilesService was
 * checking payroll_client_assignments before serving a payroll file. The rest
 * of the system already treated payroll as assignment-scoped; this list
 * disagreed, and it was the one that decided.
 */
describe('getScope — PAYROLL', () => {
  function makeService(assignments: Array<{ clientId: string }>) {
    const find = jest.fn().mockResolvedValue(assignments);
    const svc = new AccessScopeService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { find } as any,
    );
    return { svc, find };
  }

  const payrollUser = {
    id: 'payroll-1',
    userId: 'payroll-1',
    roleCode: 'PAYROLL',
    clientId: null,
    assignedClientIds: [],
    branchIds: [],
  } as any;

  it('resolves to the assigned clients', async () => {
    const { svc } = makeService([
      { clientId: 'client-a' },
      { clientId: 'client-b' },
    ]);

    await expect(svc.getScope(payrollUser)).resolves.toEqual({
      level: 'clients',
      clientIds: ['client-a', 'client-b'],
    });
  });

  it('is no longer global', async () => {
    const { svc } = makeService([{ clientId: 'client-a' }]);
    const scope = await svc.getScope(payrollUser);
    expect(scope.level).not.toBe('all');
  });

  it('resolves to nothing when there are no active assignments', async () => {
    // applyToQb and listAllowedBranches both emit `1 = 0` for an empty list,
    // so this is a closed door rather than an open one.
    const { svc } = makeService([]);
    await expect(svc.getScope(payrollUser)).resolves.toEqual({
      level: 'clients',
      clientIds: [],
    });
  });

  it('only counts ACTIVE, un-ended assignments', async () => {
    const { svc, find } = makeService([{ clientId: 'client-a' }]);
    await svc.getScope(payrollUser);

    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          payrollUserId: 'payroll-1',
          status: 'ACTIVE',
        }),
      }),
    );
  });

  it('reads the assignment table rather than the token field', async () => {
    // FilesController and the /uploads middleware each build their own ReqUser
    // with an empty assignedClientIds, so trusting that field would drop access
    // on exactly the paths this scoping guards.
    const { svc, find } = makeService([{ clientId: 'client-a' }]);

    const scope = await svc.getScope({
      ...payrollUser,
      assignedClientIds: ['client-from-token'],
    });

    expect(find).toHaveBeenCalled();
    expect(scope.clientIds).toEqual(['client-a']);
  });

  it('leaves ADMIN global', async () => {
    const { svc } = makeService([]);
    await expect(
      svc.getScope({ ...payrollUser, roleCode: 'ADMIN' }),
    ).resolves.toEqual({ level: 'all' });
  });
});
