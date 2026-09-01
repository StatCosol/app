import { ForbiddenException } from '@nestjs/common';
import { ScopeGuard } from './scope.guard';

/**
 * Cross-tenant access control. A CRM assigned to one client was able to see
 * another client's data; these pin the boundary so it cannot quietly reopen.
 */
describe('ScopeGuard', () => {
  const guard = new ScopeGuard();

  const ctx = (user: any, req: Record<string, any> = {}) => {
    const request = { user, params: {}, query: {}, body: {}, ...req };
    return {
      switchToHttp: () => ({ getRequest: () => request }),
      request,
    } as any;
  };

  const run = (user: any, req?: Record<string, any>) => {
    const c = ctx(user, req);
    return { allowed: guard.canActivate(c), req: c.request };
  };

  it('allows an unauthenticated request through to the auth guard', () => {
    expect(run(undefined).allowed).toBe(true);
  });

  it('attaches the access scope for downstream services', () => {
    const { req } = run({
      id: 'u1',
      roleCode: 'CLIENT',
      clientId: 'client-1',
      branchIds: ['b1'],
      userType: 'MASTER',
    });
    expect(req.accessScope).toEqual({
      userId: 'u1',
      roleCode: 'CLIENT',
      clientId: 'client-1',
      branchIds: ['b1'],
      userType: 'MASTER',
    });
  });

  describe.each(['CRM', 'PAYROLL', 'AUDITOR', 'PAYDEK'])(
    'assigned role: %s',
    (roleCode) => {
      it('allows a client it is assigned to', () => {
        expect(
          run(
            { id: 'u1', roleCode, assignedClientIds: ['itc', 'other'] },
            { query: { clientId: 'itc' } },
          ).allowed,
        ).toBe(true);
      });

      it('denies a client it is not assigned to', () => {
        // The reported bug: an ITC user reaching Vedha's data.
        expect(() =>
          run(
            { id: 'u1', roleCode, assignedClientIds: ['itc'] },
            { query: { clientId: 'vedha' } },
          ),
        ).toThrow(ForbiddenException);
      });

      it('denies everything when it has no assignments at all', () => {
        // An empty array must not read as "unrestricted".
        expect(() =>
          run(
            { id: 'u1', roleCode, assignedClientIds: [] },
            { query: { clientId: 'itc' } },
          ),
        ).toThrow(ForbiddenException);
      });

      it('denies when the assignment list is missing entirely', () => {
        expect(() =>
          run({ id: 'u1', roleCode }, { params: { clientId: 'itc' } }),
        ).toThrow(ForbiddenException);
      });

      it('checks the clientId wherever it arrives', () => {
        for (const where of ['params', 'query', 'body']) {
          expect(() =>
            run(
              { id: 'u1', roleCode, assignedClientIds: ['itc'] },
              { [where]: { clientId: 'vedha' } },
            ),
          ).toThrow(ForbiddenException);
        }
      });
    },
  );

  it('does not restrict a global role', () => {
    for (const roleCode of ['ADMIN', 'CEO', 'CCO']) {
      expect(
        run({ id: 'u1', roleCode }, { query: { clientId: 'anything' } })
          .allowed,
      ).toBe(true);
    }
  });

  describe.each(['CLIENT', 'BRANCH_DESK', 'CONTRACTOR', 'EMPLOYEE'])(
    'tenant role: %s',
    (roleCode) => {
      it('allows its own client', () => {
        expect(
          run(
            { id: 'u1', roleCode, clientId: 'itc' },
            { query: { clientId: 'itc' } },
          ).allowed,
        ).toBe(true);
      });

      it('denies another company entirely', () => {
        // Previously unchecked: these roles are not assignment-based, so the
        // assignment check never applied and nothing else validated them —
        // any endpoint reading the parameter would have served the other
        // company's data.
        expect(() =>
          run(
            { id: 'u1', roleCode, clientId: 'itc' },
            { query: { clientId: 'vedha' } },
          ),
        ).toThrow(ForbiddenException);
      });

      it('denies a foreign clientId wherever it arrives', () => {
        for (const where of ['params', 'query', 'body']) {
          expect(() =>
            run(
              { id: 'u1', roleCode, clientId: 'itc' },
              { [where]: { clientId: 'vedha' } },
            ),
          ).toThrow(ForbiddenException);
        }
      });

      it('stays out of the way when the token carries no client', () => {
        // Nothing to compare against; the endpoint must scope itself.
        expect(
          run({ id: 'u1', roleCode }, { query: { clientId: 'vedha' } }).allowed,
        ).toBe(true);
      });
    },
  );

  it('cannot police a request that carries no clientId', () => {
    // Documents the guard's blind spot rather than implying coverage: an
    // endpoint returning cross-client data without a clientId parameter is
    // invisible here and must scope its own query.
    expect(
      run({ id: 'u1', roleCode: 'CRM', assignedClientIds: ['itc'] }).allowed,
    ).toBe(true);
  });
});
