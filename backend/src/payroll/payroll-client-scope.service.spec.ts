import { ForbiddenException } from '@nestjs/common';
import { PayrollClientScopeService } from './payroll-client-scope.service';
import { PayrollQueryService } from './payroll-query.service';
import { PayrollPayslipsService } from './payroll-payslips.service';
import { ClientComplianceDocsController } from '../branch-compliance/controllers/client-compliance-docs.controller';
import { ReqUser } from '../access/access-scope.service';

const user = (roleCode: string, extra: Partial<ReqUser> = {}): ReqUser => ({
  id: `${roleCode.toLowerCase()}-1`,
  userId: `${roleCode.toLowerCase()}-1`,
  roleCode,
  email: 'someone@example.com',
  clientId: null,
  userType: null,
  employeeId: null,
  branchIds: [],
  assignedClientIds: [],
  ...extra,
});

/** Scope service backed by fake repositories. */
function makeScope(opts: {
  crmAssigned?: string[];
  allClients?: string[];
  payrollAssigned?: string[];
}) {
  const allClients = opts.allClients ?? ['client-itc', 'client-vedha'];
  const clientRepo: any = {
    manager: {
      query: jest.fn(async () =>
        (opts.crmAssigned ?? []).map((client_id) => ({ client_id })),
      ),
    },
    createQueryBuilder: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getMany: jest.fn(async () => allClients.map((id) => ({ id }))),
    })),
  };
  const assignRepo: any = {
    exist: jest.fn(async ({ where }) =>
      (opts.payrollAssigned ?? []).includes(where.clientId),
    ),
    createQueryBuilder: jest.fn(() => {
      const qb: any = {
        innerJoin: jest.fn(() => qb),
        select: jest.fn(() => qb),
        where: jest.fn(() => qb),
        andWhere: jest.fn(() => qb),
        getRawMany: jest.fn(async () =>
          (opts.payrollAssigned ?? []).map((clientId) => ({ clientId })),
        ),
      };
      return qb;
    }),
  };
  return {
    scope: new PayrollClientScopeService(clientRepo, assignRepo),
    clientRepo,
  };
}

describe('Payroll client scope', () => {
  describe('getAssignedClientIds', () => {
    it('limits a CRM to its assigned clients instead of every client', async () => {
      const { scope } = makeScope({ crmAssigned: ['client-itc'] });
      await expect(scope.getAssignedClientIds(user('CRM'))).resolves.toEqual([
        'client-itc',
      ]);
    });

    it('gives a CRM with no assignments no clients', async () => {
      const { scope } = makeScope({ crmAssigned: [] });
      await expect(scope.getAssignedClientIds(user('CRM'))).resolves.toEqual(
        [],
      );
    });

    it('keeps ADMIN and CCO across all clients', async () => {
      const { scope } = makeScope({});
      await expect(scope.getAssignedClientIds(user('ADMIN'))).resolves.toEqual([
        'client-itc',
        'client-vedha',
      ]);
      await expect(scope.getAssignedClientIds(user('CCO'))).resolves.toEqual([
        'client-itc',
        'client-vedha',
      ]);
    });
  });

  describe('assertPayrollAccessToClient read-only', () => {
    it("denies a CRM read-only access to another client's payroll", async () => {
      const { scope } = makeScope({ crmAssigned: ['client-itc'] });
      await expect(
        scope.assertPayrollAccessToClient(user('CRM'), 'client-vedha', {
          allowReadOnly: true,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('allows a CRM read-only access to an assigned client', async () => {
      const { scope } = makeScope({ crmAssigned: ['client-itc'] });
      await expect(
        scope.assertPayrollAccessToClient(user('CRM'), 'client-itc', {
          allowReadOnly: true,
        }),
      ).resolves.toBeUndefined();
    });

    it('keeps CEO and CCO read-only access unchanged', async () => {
      const { scope } = makeScope({});
      await expect(
        scope.assertPayrollAccessToClient(user('CEO'), 'client-vedha', {
          allowReadOnly: true,
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe('payroll query write actions', () => {
    function makeQueryService(queryClientId: string) {
      const { scope } = makeScope({ payrollAssigned: ['client-itc'] });
      const queryRepo: any = {
        findOne: jest.fn(async () => ({ id: 'q1', clientId: queryClientId })),
        update: jest.fn(async () => undefined),
      };
      const queryMsgRepo: any = {
        create: jest.fn((m) => m),
        save: jest.fn(async (m) => m),
      };
      return {
        svc: new PayrollQueryService(queryRepo, queryMsgRepo, scope),
        queryRepo,
        queryMsgRepo,
      };
    }

    it.each([
      [
        'updateQueryStatus',
        (s: PayrollQueryService) =>
          s.updateQueryStatus(user('PAYROLL'), 'q1', 'CLOSED'),
      ],
      [
        'resolveQuery',
        (s: PayrollQueryService) =>
          s.resolveQuery(user('PAYROLL'), 'q1', 'done'),
      ],
      [
        'addQueryMessage',
        (s: PayrollQueryService) =>
          s.addQueryMessage(user('PAYROLL'), 'q1', 'hello'),
      ],
    ])(
      "%s refuses another client's query and changes nothing",
      async (_n, call) => {
        const { svc, queryRepo, queryMsgRepo } =
          makeQueryService('client-vedha');
        await expect(call(svc)).rejects.toBeInstanceOf(ForbiddenException);
        expect(queryRepo.update).not.toHaveBeenCalled();
        expect(queryMsgRepo.save).not.toHaveBeenCalled();
      },
    );

    it('updateQueryStatus works for an assigned client', async () => {
      const { svc, queryRepo } = makeQueryService('client-itc');
      await expect(
        svc.updateQueryStatus(user('PAYROLL'), 'q1', 'CLOSED'),
      ).resolves.toEqual({ success: true });
      expect(queryRepo.update).toHaveBeenCalledWith('q1', { status: 'CLOSED' });
    });
  });

  describe('payslip listing', () => {
    function makePayslips(assigned: string[]) {
      const { scope } = makeScope({ crmAssigned: assigned });
      const clauses: Array<[string, unknown]> = [];
      const qb: any = {
        where: jest.fn(
          (sql: string, p: unknown) => (clauses.push([sql, p]), qb),
        ),
        andWhere: jest.fn(
          (sql: string, p: unknown) => (clauses.push([sql, p]), qb),
        ),
        orderBy: jest.fn(() => qb),
        take: jest.fn(() => qb),
        getMany: jest.fn(async () => []),
      };
      const svc = Object.create(PayrollPayslipsService.prototype);
      Object.assign(svc, {
        scope,
        payslipArchiveRepo: { createQueryBuilder: jest.fn(() => qb) },
        logger: { error: jest.fn() },
      });
      return { svc: svc as PayrollPayslipsService, clauses, qb };
    }

    it('restricts payslips to the caller’s clients when no client is chosen', async () => {
      const { svc, clauses } = makePayslips(['client-itc']);
      await svc.listPayslips(user('CRM'), {});
      expect(clauses).toContainEqual([
        'p.client_id IN (:...scopeIds)',
        { scopeIds: ['client-itc'] },
      ]);
    });

    it('returns no payslips for a CRM without assignments', async () => {
      const { svc, qb } = makePayslips([]);
      await expect(svc.listPayslips(user('CRM'), {})).resolves.toEqual({
        items: [],
        total: 0,
      });
      expect(qb.getMany).not.toHaveBeenCalled();
    });
  });

  describe('client compliance dashboard endpoints', () => {
    it("ignores a companyId naming another company and uses the user's own", () => {
      const svc: any = {
        getClientDashboardKpis: jest.fn(),
        getLowestComplianceBranches: jest.fn(),
        getComplianceTrend: jest.fn(),
      };
      const ctrl = new ClientComplianceDocsController(svc);
      const me = user('CLIENT', { clientId: 'client-itc' });
      const q = { companyId: 'client-vedha', year: '2026' };

      void ctrl.dashboardKpis(me, q);
      void ctrl.lowestBranches(me, q);
      void ctrl.companyTrend(me, q);

      expect(svc.getClientDashboardKpis).toHaveBeenCalledWith(
        me,
        'client-itc',
        2026,
        undefined,
      );
      expect(svc.getLowestComplianceBranches).toHaveBeenCalledWith(
        'client-itc',
        2026,
        10,
      );
      expect(svc.getComplianceTrend).toHaveBeenCalledWith(
        '',
        'client-itc',
        2026,
      );
    });
  });
});
