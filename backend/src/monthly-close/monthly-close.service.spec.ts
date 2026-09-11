import { ForbiddenException, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { validate } from 'class-validator';
import { AccessScopeService, ReqUser } from '../access/access-scope.service';
import { ServiceEntitlementsService } from '../service-entitlements/service-entitlements.service';
import { MonthlyCloseService } from './monthly-close.service';
import { MonthlyCloseQueryDto } from './monthly-close.dto';

const query = {
  clientId: '00000000-0000-4000-8000-000000000001',
  branchId: '00000000-0000-4000-8000-000000000002',
  month: '2026-09',
};
const user = {
  id: 'user',
  userId: 'user',
  roleCode: 'CLIENT',
  userType: 'MASTER',
  clientId: query.clientId,
  branchIds: [query.branchId],
} as ReqUser;

describe('MonthlyCloseService', () => {
  let db: { query: jest.Mock };
  let access: {
    assertClientAllowed: jest.Mock;
    listAllowedBranches: jest.Mock;
  };
  let entitlements: { getCurrentForClient: jest.Mock };
  let service: MonthlyCloseService;
  beforeEach(() => {
    db = { query: jest.fn().mockResolvedValue([]) };
    access = {
      assertClientAllowed: jest.fn().mockResolvedValue(undefined),
      listAllowedBranches: jest
        .fn()
        .mockResolvedValue([{ id: query.branchId, branchName: 'Branch A' }]),
    };
    entitlements = {
      getCurrentForClient: jest.fn().mockResolvedValue({ enabledModules: [] }),
    };
    service = new MonthlyCloseService(
      db as unknown as DataSource,
      access as unknown as AccessScopeService,
      entitlements as unknown as ServiceEntitlementsService,
    );
  });
  it('rejects another tenant before querying source records', async () => {
    access.assertClientAllowed.mockRejectedValue(new ForbiddenException());
    await expect(service.get(user, query)).rejects.toThrow(ForbiddenException);
    expect(db.query).not.toHaveBeenCalled();
    expect(entitlements.getCurrentForClient).not.toHaveBeenCalled();
  });
  it('rejects mismatched client/branch and an empty branch assignment list', async () => {
    access.listAllowedBranches.mockResolvedValue([]);
    await expect(service.get(user, query)).rejects.toThrow(ForbiddenException);
    expect(db.query).not.toHaveBeenCalled();
  });
  it('never queries disabled service modules or claims an empty workspace is ready', async () => {
    const result = await service.get(user, query);
    expect(result.stages).toEqual([]);
    expect(result.needsVerification).toBe(true);
    expect(db.query).not.toHaveBeenCalled();
  });
  it('treats absent payroll as unknown, not approved', async () => {
    entitlements.getCurrentForClient.mockResolvedValue({
      enabledModules: ['PAYROLL'],
    });
    const result = await service.get(user, query);
    expect(result.stages[0].state).toBe('UNKNOWN');
    expect(result.needsVerification).toBe(true);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('branch_id = $2'),
      [query.clientId, query.branchId, '2026-09-01'],
    );
  });
  it.each([
    {},
    { allowBranchPayrollAccess: false },
    {
      allowBranchPayrollAccess: true,
      payrollBranchScope: 'SELECTED',
      payrollAllowedBranchIds: [],
    },
  ])('honors branch payroll restrictions: %j', async (settings) => {
    entitlements.getCurrentForClient.mockResolvedValue({
      enabledModules: ['PAYROLL'],
    });
    db.query.mockResolvedValue([{ settings }]);
    const result = await service.get({ ...user, userType: 'BRANCH' }, query);
    expect(result.stages[0].state).toBe('UNAVAILABLE');
    expect(db.query).toHaveBeenCalledTimes(1);
    expect(result.stages[0].issues).toEqual([]);
  });
  it('distinguishes approved payroll from pending payroll without exposing amounts', async () => {
    entitlements.getCurrentForClient.mockResolvedValue({
      enabledModules: ['PAYROLL'],
    });
    db.query.mockResolvedValue([
      { id: 'run1', status: 'APPROVED' },
      { id: 'run2', status: 'SUBMITTED' },
    ]);
    const result = await service.get(user, query);
    expect(result.stages[0].outstanding).toBe(1);
    expect(result.stages[0].issues[0].sourceId).toBe('run2');
    expect(result.stages[0].state).toBe('REVIEW');
  });
  it('does not turn a failed check into zero outstanding and clear', async () => {
    const log = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    entitlements.getCurrentForClient.mockResolvedValue({
      enabledModules: ['PAYROLL', 'EMPLOYEE_COMPLIANCE'],
    });
    db.query
      .mockRejectedValueOnce(new Error('database unavailable'))
      .mockResolvedValueOnce([]);
    const result = await service.get(user, query);
    expect(result.stages.map((s) => s.state)).toEqual([
      'UNAVAILABLE',
      'UNKNOWN',
    ]);
    expect(result.needsVerification).toBe(true);
    log.mockRestore();
  });
  it('returns actionable latest-document gaps and preserves full totals beyond the visible page', async () => {
    entitlements.getCurrentForClient.mockResolvedValue({
      enabledModules: ['CONTRACTOR_DOCUMENTS'],
    });
    db.query.mockResolvedValue([
      {
        id: 'requirement',
        document_id: null,
        contractor_name: 'Vendor',
        doc_type: 'WAGE_REGISTER',
        check_state: 'MISSING',
        total: 140,
        outstanding: 120,
      },
    ]);
    const result = await service.get(user, query);
    const stage = result.stages[0];
    expect(stage.total).toBe(140);
    expect(stage.outstanding).toBe(120);
    expect(stage.truncated).toBe(true);
    expect(stage.issues[0].reason).toContain('No submission');
    expect(stage.issues[0].sourceId).toBeNull();
  });
  it('validates month bounds and rejects malformed identifiers', async () => {
    for (const month of [
      '2026-00',
      '2026-13',
      '2026-9',
      '2026-09-01',
      '0000-01',
    ]) {
      const dto = Object.assign(new MonthlyCloseQueryDto(), {
        ...query,
        month,
      });
      expect((await validate(dto)).length).toBeGreaterThan(0);
    }
    expect(
      await validate(Object.assign(new MonthlyCloseQueryDto(), query)),
    ).toEqual([]);
    expect(
      (
        await validate(
          Object.assign(new MonthlyCloseQueryDto(), {
            ...query,
            branchId: 'bad',
          }),
        )
      ).length,
    ).toBeGreaterThan(0);
  });
});
