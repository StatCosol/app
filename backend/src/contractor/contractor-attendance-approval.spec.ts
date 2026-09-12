import { ContractorComputationService } from './contractor-computation.service';
import { ConflictException, ForbiddenException } from '@nestjs/common';

const branch = {
  id: 'reviewer',
  clientId: 'client',
  roleCode: 'BRANCH_DESK',
  branchIds: ['branch'],
} as any;
const vendor = {
  id: 'vendor',
  clientId: 'client',
  roleCode: 'CONTRACTOR',
} as any;
const record = () => ({
  id: 'batch',
  client_id: 'client',
  branch_id: 'branch',
  contractor_user_id: 'vendor',
  period_month: '2026-09',
  is_current: true,
  status: 'PENDING',
  rows_snapshot: [{ employee_code: 'G001', days_worked: 30 }],
});
function setup(batch = record()) {
  const service: any = new (ContractorComputationService as any)(
    ...new Array(13).fill({}),
  );
  const query = jest.fn(async (sql: string) => {
    if (sql.startsWith('SELECT * FROM contractor_attendance')) return [batch];
    if (sql.startsWith('INSERT INTO contractor_attendance'))
      return [{ id: 'batch', status: 'PENDING' }];
    return [];
  });
  const manager: any = { query };
  manager.transaction = (fn: any) => fn(manager);
  service.computationRepo = { manager };
  service.scope = {
    assertBranchAllowed: jest.fn(),
    assertClientAllowed: jest.fn(),
    resolveClientId: () => 'client',
  };
  service.assertContractorLinked = jest.fn();
  service.findEmployee = jest
    .fn()
    .mockResolvedValue({ employeeCode: 'G001', name: 'Sample guard' });
  service.computeOne = jest
    .fn()
    .mockResolvedValue({ netSalary: 18033, matchStatus: 'MATCHED' });
  service.userRepo = {
    findOne: jest.fn().mockResolvedValue({ name: 'Sample vendor' }),
  };
  service.notifications = {
    createSystemNotification: jest.fn().mockResolvedValue({}),
  };
  service.workflow = {
    lock: jest.fn(),
    saveDraft: jest.fn(async (_user, _key, calculate, before) => {
      await before(manager);
      return { saved: await calculate(), version: { id: 'payroll' } };
    }),
  };
  return { service, query, manager };
}
describe('branch-approved contractor attendance', () => {
  it.each(['CONTRACTOR', 'CRM', 'ADMIN', 'AUDITOR', 'CLIENT', 'CCO'])(
    '%s cannot approve attendance',
    async (role) => {
      const { service, query } = setup();
      await expect(
        service.reviewAttendance(
          { ...branch, roleCode: role },
          'batch',
          'approve',
          'Checked attendance',
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(query).not.toHaveBeenCalled();
    },
  );
  it('denies another branch even in the same client', async () => {
    const { service } = setup();
    await expect(
      service.reviewAttendance(
        { ...branch, branchIds: ['other'] },
        'batch',
        'approve',
        'Checked attendance',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(service.computeOne).not.toHaveBeenCalled();
  });
  it.each([
    { status: 'APPROVED' },
    { status: 'RETURNED' },
    { is_current: false },
  ])('rejects stale review %j', async (patch) => {
    const { service } = setup({ ...record(), ...patch });
    await expect(
      service.reviewAttendance(
        branch,
        'batch',
        'approve',
        'Checked attendance',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(service.computeOne).not.toHaveBeenCalled();
  });
  it('calculates the stored snapshot only after branch approval', async () => {
    const { service, query } = setup();
    const result = await service.reviewAttendance(
      branch,
      'batch',
      'approve',
      'Checked attendance',
    );
    expect(result.status).toBe('APPROVED');
    expect(
      query.mock.calls.some(([sql]) =>
        sql.startsWith('UPDATE contractor_attendance'),
      ),
    ).toBe(true);
    expect(service.computeOne).toHaveBeenCalledWith(
      'client',
      'vendor',
      'branch',
      '2026-09',
      null,
      1,
      { employee_code: 'G001', days_worked: 30 },
    );
  });
  it('returns attendance without calculating payroll', async () => {
    const { service } = setup();
    await service.reviewAttendance(
      branch,
      'batch',
      'return',
      'Missing payable days',
    );
    expect(service.workflow.saveDraft).not.toHaveBeenCalled();
  });
  it('submits registered employees for approval without computing wages', async () => {
    const { service, query } = setup();
    const result = await service.computeMcdRows(vendor, {
      branchId: 'branch',
      periodMonth: '2026-09',
      rows: [{ employee_code: 'G001', days_worked: 30 }],
    });
    expect(result.status).toBe('PENDING');
    expect(service.computeOne).not.toHaveBeenCalled();
    const call = query.mock.calls.find(([sql]) =>
      sql.startsWith('INSERT INTO contractor_attendance'),
    ) as any;
    expect(JSON.parse(call[1][4])).toEqual([
      { employee_code: 'G001', employee_name: 'Sample guard', days_worked: 30 },
    ]);
    expect(call[1][6]).toBe('EXCEL');
  });
  it('rejects unregistered workers before persisting', async () => {
    const { service, query } = setup();
    service.findEmployee.mockResolvedValue(null);
    await expect(
      service.computeMcdRows(vendor, {
        branchId: 'branch',
        periodMonth: '2026-09',
        rows: [{ employee_code: 'G001', days_worked: 30 }],
      }),
    ).rejects.toThrow('Register');
    expect(query).not.toHaveBeenCalled();
  });
  it('applies every assigned branch when listing pending attendance', async () => {
    const { service, query } = setup();
    await service.listAttendance(
      { ...branch, branchIds: ['branch', 'branch2'] },
      { periodMonth: '2026-09' },
    );
    expect((query.mock.calls[0] as any)[1]).toEqual([
      'client',
      ['branch', 'branch2'],
      '2026-09',
    ]);
  });
});

describe('CRM alerts after branch approval', () => {
  it.each(['NO_QUOTATION', 'MISMATCH'])(
    'alerts CRM for committed %s rows only',
    async (status) => {
      const { service } = setup();
      const mismatch = {
        rowNumber: 2,
        employeeName: 'Sample guard',
        matchStatus: status,
        mismatchReason: 'Quotation requires CRM review',
      };
      let commit: (result: any) => void;
      service.workflow.saveDraft.mockImplementation(
        () =>
          new Promise((resolve) => {
            commit = resolve;
          }),
      );
      const approval = service.reviewAttendance(
        branch,
        'batch',
        'approve',
        'Attendance checked',
      );
      // Let scope checks finish and the transaction begin without resolving it.
      await new Promise((resolve) => setImmediate(resolve));
      expect(
        service.notifications.createSystemNotification,
      ).not.toHaveBeenCalled();
      commit!({
        saved: [
          {
            rowNumber: 1,
            employeeName: 'Matched worker',
            matchStatus: 'MATCHED',
          },
          mismatch,
        ],
        version: { id: 'payroll' },
      });
      await approval;
      expect(
        service.notifications.createSystemNotification,
      ).toHaveBeenCalledTimes(1);
      expect(
        service.notifications.createSystemNotification,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          clientId: 'client',
          branchId: 'branch',
          priority: 1,
          subject: 'Contractor MCD wage mismatch - Sample vendor - 2026-09',
          message: 'Row 2: Sample guard - Quotation requires CRM review',
        }),
      );
    },
  );
  it('does not alert for matched payroll', async () => {
    const { service } = setup();
    await service.reviewAttendance(
      branch,
      'batch',
      'approve',
      'Attendance checked',
    );
    expect(
      service.notifications.createSystemNotification,
    ).not.toHaveBeenCalled();
  });
  it('does not alert when payroll fails to commit', async () => {
    const { service } = setup();
    service.workflow.saveDraft.mockRejectedValue(
      new Error('Calculation failed'),
    );
    await expect(
      service.reviewAttendance(
        branch,
        'batch',
        'approve',
        'Attendance checked',
      ),
    ).rejects.toThrow('Calculation failed');
    expect(
      service.notifications.createSystemNotification,
    ).not.toHaveBeenCalled();
  });
  it('does not alert when attendance is returned', async () => {
    const { service } = setup();
    await service.reviewAttendance(
      branch,
      'batch',
      'return',
      'Attendance incomplete',
    );
    expect(
      service.notifications.createSystemNotification,
    ).not.toHaveBeenCalled();
  });
});
