import {
  BadRequestException,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { ApplicabilityScopeGuard } from './applicability-scope.guard';

describe('ApplicabilityScopeGuard unit creation', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const branchId = '22222222-2222-4222-8222-222222222222';
  let ds: { query: jest.Mock };
  let access: {
    assertClientAllowed: jest.Mock;
    assertBranchAllowed: jest.Mock;
  };
  let guard: ApplicabilityScopeGuard;

  const context = (roleCode: string, body: Record<string, unknown>) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'POST',
          params: {},
          user: { userId: 'user-1', roleCode },
          body,
        }),
      }),
    }) as ExecutionContext;

  beforeEach(() => {
    ds = { query: jest.fn().mockResolvedValue([]) };
    access = {
      assertClientAllowed: jest.fn().mockResolvedValue(undefined),
      assertBranchAllowed: jest.fn().mockResolvedValue(undefined),
    };
    guard = new ApplicabilityScopeGuard(ds as any, access as any);
  });

  it.each(['CRM', 'ADMIN'])(
    'rejects a branch from another tenant even when %s can access both',
    async (role) => {
      await expect(
        guard.canActivate(context(role, { tenantId, branchId })),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(access.assertClientAllowed).toHaveBeenCalledWith(
        expect.anything(),
        tenantId,
      );
      expect(access.assertBranchAllowed).toHaveBeenCalledWith(
        expect.anything(),
        branchId,
      );
      expect(ds.query).toHaveBeenCalledWith(
        expect.stringContaining('clientid = $2 AND isdeleted = false'),
        [branchId, tenantId],
      );
    },
  );

  it('allows a branch belonging to the selected tenant', async () => {
    ds.query.mockResolvedValue([{ id: branchId }]);
    await expect(
      guard.canActivate(context('CRM', { tenantId, branchId })),
    ).resolves.toBe(true);
  });

  it('allows tenant-only units without requiring a branch', async () => {
    await expect(guard.canActivate(context('CRM', { tenantId }))).resolves.toBe(
      true,
    );
    expect(ds.query).not.toHaveBeenCalled();
  });

  it('denies an unassigned CRM before querying the branch', async () => {
    access.assertClientAllowed.mockRejectedValue(new ForbiddenException());
    await expect(
      guard.canActivate(context('CRM', { tenantId, branchId })),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(ds.query).not.toHaveBeenCalled();
  });
});
