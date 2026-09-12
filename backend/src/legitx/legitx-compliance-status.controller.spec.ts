import { ForbiddenException } from '@nestjs/common';
import { LegitxScopeService } from './legitx-scope.service';
import { LegitxComplianceStatusController } from './legitx-compliance-status.controller';

describe('LegitxComplianceStatusController branch scoping', () => {
  const assignedBranchId = '22222222-2222-4222-8222-222222222221';
  const otherBranchId = '22222222-2222-4222-8222-222222222222';

  it("rejects a branch outside a branch user's mappings", async () => {
    const service = {
      getOverview: jest.fn().mockResolvedValue({}),
    };
    const scopeService = new LegitxScopeService(
      {
        getScope: async () => ({
          level: 'branches',
          clientId: '11111111-1111-4111-8111-111111111111',
        }),
      } as any,
      { getUserBranchIds: async () => [assignedBranchId] } as any,
      {
        query: async (sql: string) =>
          sql.includes('SELECT clientid')
            ? [{ clientid: '11111111-1111-4111-8111-111111111111' }]
            : [assignedBranchId].map((id) => ({ id })),
      } as any,
    );
    const controller = new LegitxComplianceStatusController(
      service as any,
      scopeService,
    );

    await expect(
      controller.overview(
        {
          userId: '33333333-3333-4333-8333-333333333335',
          roleCode: 'CLIENT',
          userType: 'BRANCH',
          clientId: '11111111-1111-4111-8111-111111111111',
          branchIds: [assignedBranchId],
        } as any,
        { month: 8, year: 2026, branchId: otherBranchId },
      ),
    ).rejects.toThrow(ForbiddenException);

    expect(service.getOverview).not.toHaveBeenCalled();
  });

  it("honors a requested branch that is in a branch user's mappings", async () => {
    const service = {
      getOverview: jest.fn().mockResolvedValue({}),
    };
    const scopeService = new LegitxScopeService(
      {
        getScope: async () => ({
          level: 'branches',
          clientId: '11111111-1111-4111-8111-111111111111',
        }),
      } as any,
      {
        getUserBranchIds: async () => [assignedBranchId, otherBranchId],
      } as any,
      {
        query: async (sql: string) =>
          sql.includes('SELECT clientid')
            ? [{ clientid: '11111111-1111-4111-8111-111111111111' }]
            : [assignedBranchId, otherBranchId].map((id) => ({ id })),
      } as any,
    );
    const controller = new LegitxComplianceStatusController(
      service as any,
      scopeService,
    );

    await controller.overview(
      {
        userId: '33333333-3333-4333-8333-333333333335',
        roleCode: 'CLIENT',
        userType: 'BRANCH',
        clientId: '11111111-1111-4111-8111-111111111111',
        branchIds: [assignedBranchId, otherBranchId],
      } as any,
      { month: 8, year: 2026, branchId: otherBranchId },
    );

    expect(service.getOverview).toHaveBeenCalledWith(
      expect.objectContaining({ branchId: otherBranchId }),
    );
  });
});
