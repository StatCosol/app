import { ForbiddenException, ConflictException } from '@nestjs/common';
import {
  ContractorPayrollWorkflowService,
  PayrollVersion,
} from './contractor-payroll-workflow.service';
import { ReqUser } from '../access/access-scope.service';
import { ContractorComputationService } from './contractor-computation.service';

const user = (roleCode: string, id = roleCode): ReqUser =>
  ({ roleCode, id, clientId: 'client', branchIds: ['branch'] }) as ReqUser;
const version = (status: string, overrides = {}): PayrollVersion => ({
  id: 'version',
  client_id: 'client',
  contractor_user_id: 'CONTRACTOR',
  branch_id: 'branch',
  period_month: '2026-09',
  version: 1,
  is_current: true,
  status,
  created_by: 'CONTRACTOR',
  approved_by: 'CRM',
  verified_by: null,
  rows_snapshot: [{ matchStatus: 'MATCHED', netSalary: 100 } as any],
  ...overrides,
});
function makeWorkflow(record = version('SUBMITTED')) {
  const query = jest.fn(async (sql: string) =>
    sql.startsWith('SELECT *') ? [record] : [],
  );
  const manager: any = { query };
  manager.transaction = (fn: any) => fn(manager);
  const scope: any = {
    assertClientAllowed: jest.fn(),
    assertCcoClientAllowed: jest.fn(),
    assertCcoBranchAllowed: jest.fn(),
    getCcoClientIds: jest.fn().mockResolvedValue(['client']),
    listAllowedClients: jest
      .fn()
      .mockResolvedValue([{ id: 'client' }, { id: 'other' }]),
    resolveClientId: jest.fn().mockReturnValue('client'),
    assertBranchAllowed: jest.fn(),
    getScope: jest
      .fn()
      .mockResolvedValue({ level: 'client', clientId: 'client' }),
  };
  return {
    service: new ContractorPayrollWorkflowService({ manager } as any, scope),
    query,
    scope,
  };
}
describe('contractor payroll approval authority', () => {
  it.each([
    'CLIENT',
    'BRANCH_DESK',
    'CONTRACTOR',
    'AUDITOR',
    'ADMIN',
    'CCO',
    'CEO',
  ])('%s cannot approve submitted payroll', async (role) => {
    const { service, query } = makeWorkflow();
    await expect(
      service.transition(
        user(role),
        'version',
        'approve',
        'Reviewed attendance',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(query.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(
      false,
    );
  });
  it('CRM cannot certify its own work after a role change', () => {
    const { service } = makeWorkflow();
    expect(
      service.allowedActions(version('CRM_APPROVED'), user('AUDITOR', 'CRM')),
    ).toEqual([]);
    expect(
      service.allowedActions(
        version('CRM_APPROVED'),
        user('AUDITOR', 'CONTRACTOR'),
      ),
    ).toEqual([]);
    expect(
      service.allowedActions(version('CRM_APPROVED'), user('AUDITOR')),
    ).toEqual(['verify', 'return']);
  });
  it('only controlled reopening can change a verified payroll', () => {
    const { service } = makeWorkflow();
    expect(
      service.allowedActions(version('VERIFIED_LOCKED'), user('CRM')),
    ).toEqual([]);
    expect(
      service.allowedActions(version('VERIFIED_LOCKED'), user('CONTRACTOR')),
    ).toEqual([]);
    expect(
      service.allowedActions(version('VERIFIED_LOCKED'), user('CCO')),
    ).toEqual(['reopen']);
    expect(
      service.allowedActions(version('REOPENED'), user('CONTRACTOR')),
    ).toEqual([]);
    expect(
      service.allowedActions(
        version('SUBMITTED', { is_current: false }),
        user('CRM'),
      ),
    ).toEqual([]);
  });
  it('blocks unresolved exceptions at CRM approval', async () => {
    const { service } = makeWorkflow(
      version('SUBMITTED', {
        rows_snapshot: [{ matchStatus: 'NO_QUOTATION' }],
      }),
    );
    await expect(
      service.transition(
        user('CRM'),
        'version',
        'approve',
        'Reviewed attendance',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
  it('rejects missing review reasons', async () => {
    const { service, query } = makeWorkflow();
    await expect(
      service.transition(user('CRM'), 'version', 'approve', ''),
    ).rejects.toThrow('review reason');
    expect(query).not.toHaveBeenCalled();
  });
  it('allows generated draft reports but denies other contractors', async () => {
    const { service } = makeWorkflow(version('DRAFT'));
    await expect(
      service.pack(user('CONTRACTOR'), 'version'),
    ).resolves.toMatchObject({
      version: { status: 'DRAFT', canDownload: true },
    });
    await expect(
      service.pack(user('CONTRACTOR', 'OTHER'), 'version'),
    ).rejects.toThrow('another contractor');
  });
  it('denies branch users with no assigned branch', async () => {
    const { service, scope } = makeWorkflow(version('CRM_APPROVED'));
    scope.getScope.mockResolvedValue({ level: 'branches', branchIds: [] });
    await expect(service.pack(user('BRANCH_DESK'), 'version')).rejects.toThrow(
      'assigned branches',
    );
  });
});

describe('contractor attendance authority', () => {
  const input = () => ({
    clientId: 'client',
    contractorUserId: 'CONTRACTOR',
    branchId: 'branch',
    periodMonth: '2026-09',
    rows: [{ employee_code: 'E001', days_worked: 20 }],
  });
  function makeService() {
    const svc: any = new (ContractorComputationService as any)(
      ...new Array(12).fill({}),
    );
    svc.scope = {
      assertClientAllowed: jest.fn(),
      assertBranchAllowed: jest.fn(),
    };
    svc.assertContractorLinked = jest.fn();
    svc.workflow = { saveDraft: jest.fn() };
    return svc;
  }
  it.each([
    { periodMonth: '2026-13' },
    { branchId: null },
    { rows: [] },
    { rows: [{ employee_code: 'E001', days_worked: -1 }] },
    { rows: [{ employee_code: 'E001', days_worked: 31 }] },
    {
      rows: [
        { employee_code: 'E001', days_worked: 1 },
        { employee_code: 'e001', days_worked: 2 },
      ],
    },
    { rows: [{ employee_code: 'E001', days_worked: 20, basic_wage: 1 }] },
    { rows: [{ employee_code: 'E001', days_worked: 20, daily_wage: 9999 }] },
    {
      rows: [
        { employee_code: 'E001', days_worked: 20, other_deductions: -1000 },
      ],
    },
  ])(
    'rejects invalid or wage-controlling input before replacing payroll: %j',
    async (overrides) => {
      const svc = makeService();
      await expect(
        svc.computeMcdRows(user('CONTRACTOR'), { ...input(), ...overrides }),
      ).rejects.toThrow();
      expect(svc.workflow.saveDraft).not.toHaveBeenCalled();
    },
  );
  it('does not substitute a name match when the employee code is wrong', async () => {
    const svc = makeService();
    svc.employeeRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      createQueryBuilder: jest.fn(),
    };
    expect(
      await svc.findEmployee(
        'client',
        'CONTRACTOR',
        'branch',
        'WRONG',
        'Same Name',
      ),
    ).toBeNull();
    expect(svc.employeeRepo.createQueryBuilder).not.toHaveBeenCalled();
  });
  it('rejects inactive employees even when the employee code matches', async () => {
    const svc = makeService();
    svc.employeeRepo = {
      findOne: jest
        .fn()
        .mockResolvedValue({ isActive: false, status: 'INACTIVE' }),
    };
    expect(
      await svc.findEmployee('client', 'CONTRACTOR', 'branch', 'E001', ''),
    ).toBeNull();
  });
});

describe('payroll review corrections', () => {
  it('requires a new calculation after a return', async () => {
    const { service, query } = makeWorkflow(version('RETURNED'));
    expect(
      service.allowedActions(version('RETURNED'), user('CONTRACTOR')),
    ).toEqual([]);
    await expect(
      service.transition(
        user('CONTRACTOR'),
        'version',
        'submit',
        'Resubmit unchanged payroll',
      ),
    ).rejects.toThrow('not available');
    expect(query.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(
      false,
    );
  });
  it('limits CCO company options to managed CRM clients', async () => {
    const { service, scope } = makeWorkflow();
    expect(await service.clients(user('CCO'))).toEqual([{ id: 'client' }]);
    expect(scope.getCcoClientIds).toHaveBeenCalledWith('CCO');
    scope.getCcoClientIds.mockResolvedValue([]);
    scope.listAllowedClients.mockClear();
    expect(await service.clients(user('CCO'))).toEqual([]);
    expect(scope.listAllowedClients).not.toHaveBeenCalled();
  });
  it.each(['list', 'pack', 'history', 'reopen'])(
    'denies CCO access outside its management span: %s',
    async (operation) => {
      const { service, scope, query } = makeWorkflow(
        version('VERIFIED_LOCKED'),
      );
      scope.assertCcoClientAllowed.mockRejectedValue(
        new ForbiddenException('Client not in CCO scope'),
      );
      const result =
        operation === 'list'
          ? service.list(user('CCO'), {})
          : operation === 'pack'
            ? service.pack(user('CCO'), 'version')
            : operation === 'history'
              ? service.history(user('CCO'), 'version')
              : service.transition(
                  user('CCO'),
                  'version',
                  'reopen',
                  'Correction requested',
                );
      await expect(result).rejects.toThrow('CCO scope');
      expect(query.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(
        false,
      );
    },
  );
  it('also enforces the CCO branch check', async () => {
    const { service, scope } = makeWorkflow(version('VERIFIED_LOCKED'));
    scope.assertCcoBranchAllowed.mockRejectedValue(
      new ForbiddenException('Branch not in CCO scope'),
    );
    await expect(
      service.transition(
        user('CCO'),
        'version',
        'reopen',
        'Correction requested',
      ),
    ).rejects.toThrow('Branch not in CCO scope');
  });
  it('keeps the computation row endpoint inside the same CCO scope', async () => {
    const svc: any = new (ContractorComputationService as any)(
      ...new Array(12).fill({}),
    );
    svc.scope = {
      resolveClientId: () => 'client',
      assertClientAllowed: jest.fn(),
      assertCcoClientAllowed: jest
        .fn()
        .mockRejectedValue(new ForbiddenException('Client not in CCO scope')),
    };
    await expect(svc.listComputationsForScope(user('CCO'), {})).rejects.toThrow(
      'CCO scope',
    );
    await expect(
      svc.listQuotations(user('CCO'), { clientId: 'client' }),
    ).rejects.toThrow('CCO scope');
  });
});
