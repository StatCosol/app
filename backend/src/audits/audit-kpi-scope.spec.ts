import { ForbiddenException } from '@nestjs/common';
import { AuditKpiController } from './audits.controller';
import { ReqUser } from '../access/access-scope.service';

describe.each(['CRM', 'AUDITOR'])('Audit KPI %s branch scope', (roleCode) => {
  const user = { id: 'user', userId: 'user', roleCode } as ReqUser;
  const branchId = 'branch';
  const service = () => ({
    getBranchAuditKpi: jest.fn(),
    getBranchAuditKpiSingle: jest.fn(),
  });
  it('checks both KPI routes before reading another company branch', async () => {
    const svc = service();
    const access = {
      assertBranchAllowed: jest
        .fn()
        .mockRejectedValue(new ForbiddenException()),
    };
    const controller = new AuditKpiController(
      svc as any,
      {} as any,
      access as any,
    );
    await expect(
      controller.getBranchKpi(user, branchId, '2026-09', '2026-09'),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      controller.getBranchKpiSingle(user, branchId, '2026-09'),
    ).rejects.toThrow(ForbiddenException);
    expect(access.assertBranchAllowed).toHaveBeenCalledWith(user, branchId);
    expect(svc.getBranchAuditKpi).not.toHaveBeenCalled();
    expect(svc.getBranchAuditKpiSingle).not.toHaveBeenCalled();
  });

  it('preserves reads from currently assigned companies', async () => {
    const svc = service();
    const controller = new AuditKpiController(
      svc as any,
      {} as any,
      { assertBranchAllowed: jest.fn() } as any,
    );
    await controller.getBranchKpi(user, branchId, '2026-09', '2026-09');
    await controller.getBranchKpiSingle(user, branchId, '2026-09');
    expect(svc.getBranchAuditKpi).toHaveBeenCalledWith(
      branchId,
      '2026-09',
      '2026-09',
    );
    expect(svc.getBranchAuditKpiSingle).toHaveBeenCalledWith(
      branchId,
      '2026-09',
    );
  });
});
