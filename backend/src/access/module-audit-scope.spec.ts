import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { EmployeeDocumentService } from '../employees/employee-document.service';
import { SalaryRevisionService } from '../employees/salary-revision.service';
import { TdsController } from '../payroll/tds.controller';
import { ClraAccessService } from '../contractor/clra-access.service';
import { ClraAssignmentsController } from '../contractor/clra-assignments.controller';
import { ApplicabilityScopeGuard } from '../applicability/applicability-scope.guard';
import { ComplianceNotificationCenterService } from '../returns/services/compliance-notification-center.service';
import { ReqUser } from './access-scope.service';

/**
 * Regressions for the 2026-09-19 module audit: records reachable by id, and
 * lists that returned every client when the caller named none. Each case pins
 * the refusal and the caller's own access.
 */
const user = (roleCode: string, extra: Partial<ReqUser> = {}): ReqUser =>
  ({
    id: 'u-1',
    userId: 'u-1',
    roleCode,
    clientId: roleCode === 'CLIENT' ? 'client-a' : null,
    branchIds: [],
    assignedClientIds: [],
    ...extra,
  }) as unknown as ReqUser;

const deny = () => {
  throw new ForbiddenException('out of scope');
};

describe('employees: documents and salary revisions by id', () => {
  const access = { assertDocumentInScope: jest.fn() };
  const doc = { id: 'd-1', clientId: 'client-b', employeeId: 'e-1' };
  const repo = {
    findOne: jest.fn(async () => ({ ...doc })),
    save: jest.fn(async (v) => v),
    remove: jest.fn(),
  };
  const empRepo = {
    findOne: jest.fn(async () => ({ id: 'e-1', branchId: 'br-9' })),
  };
  const svc = new EmployeeDocumentService(
    repo as never,
    empRepo as never,
    access as never,
  );
  beforeEach(() => {
    jest.clearAllMocks();
    access.assertDocumentInScope.mockImplementation(async () => undefined);
  });

  it('checks the document client and the employee branch', async () => {
    await svc.findForUser('d-1', user('CLIENT'));
    expect(access.assertDocumentInScope).toHaveBeenCalledWith(
      expect.anything(),
      { clientId: 'client-b', branchId: 'br-9' },
    );
  });

  it('refuses download, verify and delete outside scope', async () => {
    access.assertDocumentInScope.mockImplementation(deny);
    await expect(svc.findForUser('d-1', user('CLIENT'))).rejects.toThrow(
      ForbiddenException,
    );
    await expect(svc.verify('d-1', user('CLIENT'))).rejects.toThrow(
      ForbiddenException,
    );
    await expect(svc.remove('d-1', user('CLIENT'))).rejects.toThrow(
      ForbiddenException,
    );
    expect(repo.save).not.toHaveBeenCalled();
    expect(repo.remove).not.toHaveBeenCalled();
  });

  it('refuses a salary revision outside scope', async () => {
    const revRepo = {
      findOne: jest.fn(async () => ({
        id: 'r-1',
        clientId: 'client-b',
        employeeId: 'e-1',
      })),
    };
    const revs = new SalaryRevisionService(
      revRepo as never,
      empRepo as never,
      { assertDocumentInScope: jest.fn(deny) } as never,
    );
    await expect(revs.findForUser('r-1', user('PAYROLL'))).rejects.toThrow(
      ForbiddenException,
    );
  });
});

describe('payroll: TDS eligible employees', () => {
  const scopeFor = (scope: object) => {
    const empRepo = { find: jest.fn(async () => []) };
    const ctl = new TdsController(
      { calculate: jest.fn() } as never,
      empRepo as never,
      { getScope: jest.fn(async () => scope) } as never,
    );
    return { ctl, empRepo };
  };
  const whereOf = (empRepo: { find: jest.Mock }) =>
    empRepo.find.mock.calls[0][0].where;

  it('pins a CLIENT to its own company even when it names another', async () => {
    const { ctl, empRepo } = scopeFor({
      level: 'client',
      clientId: 'client-a',
    });
    await ctl.eligible(user('CLIENT'), 'client-b');
    expect(whereOf(empRepo).clientId).toBe('client-a');
  });

  it('limits PAYROLL to its assignments when no client is named', async () => {
    const { ctl, empRepo } = scopeFor({
      level: 'clients',
      clientIds: ['c1', 'c2'],
    });
    await ctl.eligible(user('PAYROLL'));
    expect(whereOf(empRepo).clientId).toEqual(
      expect.objectContaining({ _value: ['c1', 'c2'] }),
    );
  });

  it('answers nothing for an unassigned client', async () => {
    const { ctl, empRepo } = scopeFor({ level: 'clients', clientIds: ['c1'] });
    const out = await ctl.eligible(user('PAYROLL'), 'c9');
    expect(out.employees).toEqual([]);
    expect(empRepo.find).not.toHaveBeenCalled();
  });

  it('leaves ADMIN unfiltered', async () => {
    const { ctl, empRepo } = scopeFor({ level: 'all' });
    await ctl.eligible(user('ADMIN'));
    expect(whereOf(empRepo).clientId).toBeUndefined();
  });
});

describe('CLRA access', () => {
  const build = (rows: Record<string, unknown[]>, scope: object) => {
    const ds = {
      query: jest.fn(async (sql: string) => {
        for (const [k, v] of Object.entries(rows))
          if (sql.includes(k)) return v;
        return [];
      }),
    };
    const access = {
      getScope: jest.fn(async () => scope),
      assertDocumentInScope: jest.fn(async (_u, o: { clientId: string }) => {
        if (o.clientId !== 'client-a') throw new ForbiddenException('no');
      }),
      assertClientAllowed: jest.fn(async (_u, c: string) => {
        if (c !== 'client-a') throw new ForbiddenException('no');
      }),
    };
    return new ClraAccessService(ds as never, access as never);
  };
  const clientScope = { level: 'client', clientId: 'client-a' };

  it('refuses a record whose PE belongs to another company', async () => {
    const svc = build(
      {
        'FROM clra_wage_periods': [{ client_id: 'client-b', branch_id: null }],
      },
      clientScope,
    );
    await expect(svc.assertWagePeriod(user('CLIENT'), 'wp')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('allows a contractor assigned at one of the caller PEs', async () => {
    const svc = build(
      {
        'FROM clra_contractors': [{}],
        'SELECT DISTINCT pe.client_id': [
          { client_id: 'client-b', branch_id: null },
          { client_id: 'client-a', branch_id: null },
        ],
      },
      clientScope,
    );
    await expect(
      svc.assertContractor(user('CLIENT'), 'c'),
    ).resolves.toBeUndefined();
  });

  it('lets CRM, but not CLIENT, work on an unassigned contractor', async () => {
    const rows = {
      'FROM clra_contractors': [{}],
      'SELECT DISTINCT pe.client_id': [],
    };
    await expect(
      build(rows, {
        level: 'clients',
        clientIds: ['client-a'],
      }).assertContractor(user('CRM'), 'c'),
    ).resolves.toBeUndefined();
    await expect(
      build(rows, clientScope).assertContractor(user('CLIENT'), 'c'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('checks every id a body points at', async () => {
    const svc = build(
      {
        'FROM clra_pe_establishments pe WHERE': [
          { client_id: 'client-b', branch_id: null },
        ],
      },
      clientScope,
    );
    await expect(
      svc.assertBodyRefs(user('CRM'), { peEstablishmentId: 'pe-b' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('refuses to list every worker when no contractor is named', async () => {
    const scope = {
      listScope: jest.fn(async () => ({ clientIds: ['client-a'] })),
    };
    const ctl = new ClraAssignmentsController({} as never, scope as never);
    await expect(ctl.listWorkers(user('CLIENT'))).rejects.toThrow(
      'contractorId is required',
    );
  });
});

describe('applicability: /ae/units scope guard', () => {
  const ctx = (req: object) =>
    ({ switchToHttp: () => ({ getRequest: () => req }) }) as never;
  const U = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

  it('checks a unit by its branch when it has one, else by tenant', async () => {
    const access = {
      assertBranchAllowed: jest.fn(),
      assertClientAllowed: jest.fn(),
    };
    const withBranch = new ApplicabilityScopeGuard(
      {
        query: jest.fn(async () => [{ tenant_id: 't', branch_id: 'br' }]),
      } as never,
      access as never,
    );
    await withBranch.canActivate(
      ctx({ user: user('CRM'), params: { unitId: U } }),
    );
    expect(access.assertBranchAllowed).toHaveBeenCalledWith(
      expect.anything(),
      'br',
    );

    const noBranch = new ApplicabilityScopeGuard(
      {
        query: jest.fn(async () => [{ tenant_id: 't', branch_id: null }]),
      } as never,
      access as never,
    );
    await noBranch.canActivate(
      ctx({ user: user('CRM'), params: { unitId: U } }),
    );
    expect(access.assertClientAllowed).toHaveBeenCalledWith(
      expect.anything(),
      't',
    );
  });

  it('refuses when the unit is out of scope', async () => {
    const guard = new ApplicabilityScopeGuard(
      {
        query: jest.fn(async () => [{ tenant_id: 't', branch_id: 'br' }]),
      } as never,
      { assertBranchAllowed: jest.fn(deny) } as never,
    );
    await expect(
      guard.canActivate(ctx({ user: user('CRM'), params: { unitId: U } })),
    ).rejects.toThrow(ForbiddenException);
  });

  it('404s an unknown task rather than acting on it', async () => {
    const guard = new ApplicabilityScopeGuard(
      { query: jest.fn(async () => []) } as never,
      {} as never,
    );
    await expect(
      guard.canActivate(ctx({ user: user('CRM'), params: { taskId: U } })),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('compliance notifications', () => {
  const build = (scope: object, item: object | null) => {
    const qb = {
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn(async () => []),
    };
    const repo = {
      createQueryBuilder: jest.fn(() => qb),
      findOne: jest.fn(async () => item),
      save: jest.fn(async (v) => v),
    };
    const access = {
      getScope: jest.fn(async () => scope),
      assertClientAllowed: jest.fn(async (_u, c: string) => {
        if (c !== 'client-a') throw new ForbiddenException('no');
      }),
    };
    return {
      svc: new ComplianceNotificationCenterService(
        repo as never,
        access as never,
      ),
      qb,
      repo,
    };
  };

  it('filters an assigned role to its clients when none is named', async () => {
    const { svc, qb } = build({ level: 'clients' }, null);
    await svc.getNotifications('CRM', undefined, undefined, ['client-a']);
    expect(qb.andWhere).toHaveBeenCalledWith(
      'n.clientId IN (:...scopeClientIds)',
      { scopeClientIds: ['client-a'] },
    );
  });

  it('will not mark another client’s notification read', async () => {
    const { svc, repo } = build(
      { level: 'clients' },
      { id: 'n1', role: 'CRM', clientId: 'client-b' },
    );
    await expect(svc.markRead('n1', user('CRM'))).rejects.toThrow(
      ForbiddenException,
    );
    expect(repo.save).not.toHaveBeenCalled();
  });
});
