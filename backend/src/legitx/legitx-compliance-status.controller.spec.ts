import { ForbiddenException } from '@nestjs/common';
import { LegitxComplianceStatusController } from './legitx-compliance-status.controller';

describe('LegitxComplianceStatusController branch scoping', () => {
  const assignedBranchId = '22222222-2222-4222-8222-222222222221';
  const otherBranchId = '22222222-2222-4222-8222-222222222222';

  it('rejects a branch outside a branch user\'s mappings', async () => {
    const service = {
      getOverview: jest.fn().mockResolvedValue({}),
    };
    const branchAccess = {
      getAllowedBranchIds: jest.fn().mockResolvedValue([assignedBranchId]),
    };
    const controller = new LegitxComplianceStatusController(
      service as any,
      branchAccess as any,
      {} as any,
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

  it('honors a requested branch that is in a branch user\'s mappings', async () => {
    const service = {
      getOverview: jest.fn().mockResolvedValue({}),
    };
    const branchAccess = {
      getAllowedBranchIds: jest
        .fn()
        .mockResolvedValue([assignedBranchId, otherBranchId]),
    };
    const controller = new LegitxComplianceStatusController(
      service as any,
      branchAccess as any,
      {} as any,
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
