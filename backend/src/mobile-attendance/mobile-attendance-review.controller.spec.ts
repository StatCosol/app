import { MobileAttendanceReviewController } from './mobile-attendance-review.controller';

describe('MobileAttendanceReviewController', () => {
  const clientUser = {
    id: 'user-1',
    clientId: 'client-1',
    roleCode: 'CLIENT',
  };

  it('lists federated review items for entitled clients', async () => {
    const federation = {
      listFederated: jest.fn().mockResolvedValue({
        summary: { mobileBorderlinePending: 1, facedeskVerificationPending: 0, totalPending: 1 },
        items: [],
      }),
    };
    const reviewAction = { actOnFederatedItem: jest.fn() };
    const entitlements = {
      assertAnyModule: jest.fn().mockResolvedValue(undefined),
      assertModule: jest.fn().mockResolvedValue(undefined),
      hasModule: jest
        .fn()
        .mockImplementation(async (_clientId: string, module: string) =>
          module === 'MOBILE_ATTENDANCE',
        ),
    };
    const controller = new MobileAttendanceReviewController(
      federation as any,
      reviewAction as any,
      entitlements as any,
    );

    await controller.listFederated(clientUser as any);

    expect(entitlements.assertAnyModule).toHaveBeenCalledWith('client-1', [
      'MOBILE_ATTENDANCE',
      'CONTRACTOR_FACE_ATTENDANCE',
    ]);
    expect(federation.listFederated).toHaveBeenCalledWith(
      'client-1',
      expect.objectContaining({
        includeMobile: true,
        includeFacedesk: false,
        branchIds: null,
      }),
    );
  });

  it('omits mobile queue for FaceDesk-only clients', async () => {
    const federation = {
      listFederated: jest.fn().mockResolvedValue({
        summary: {
          mobileBorderlinePending: 0,
          facedeskVerificationPending: 2,
          totalPending: 2,
        },
        items: [],
      }),
    };
    const reviewAction = { actOnFederatedItem: jest.fn() };
    const entitlements = {
      assertAnyModule: jest.fn().mockResolvedValue(undefined),
      assertModule: jest.fn().mockResolvedValue(undefined),
      hasModule: jest
        .fn()
        .mockImplementation(async (_clientId: string, module: string) =>
          module === 'CONTRACTOR_FACE_ATTENDANCE',
        ),
    };
    const controller = new MobileAttendanceReviewController(
      federation as any,
      reviewAction as any,
      entitlements as any,
    );

    await controller.listFederated(clientUser as any);

    expect(federation.listFederated).toHaveBeenCalledWith(
      'client-1',
      expect.objectContaining({
        includeMobile: false,
        includeFacedesk: true,
      }),
    );
  });

  it('routes federated review actions through the action service', async () => {
    const federation = { listFederated: jest.fn() };
    const reviewAction = {
      actOnFederatedItem: jest
        .fn()
        .mockResolvedValue({ ok: true, decision: 'REVIEW_APPROVED' }),
    };
    const entitlements = {
      assertAnyModule: jest.fn().mockResolvedValue(undefined),
      assertModule: jest.fn().mockResolvedValue(undefined),
      hasModule: jest.fn().mockResolvedValue(true),
    };
    const controller = new MobileAttendanceReviewController(
      federation as any,
      reviewAction as any,
      entitlements as any,
    );

    await controller.actOnFederatedItem(
      clientUser as any,
      'MOBILE_BORDERLINE',
      'punch-1',
      { action: 'APPROVE', note: 'ok' },
    );

    expect(entitlements.assertModule).toHaveBeenCalledWith(
      'client-1',
      'MOBILE_ATTENDANCE',
    );
    expect(reviewAction.actOnFederatedItem).toHaveBeenCalledWith(
      'client-1',
      'MOBILE_BORDERLINE',
      'punch-1',
      'user-1',
      { action: 'APPROVE', note: 'ok' },
      null,
    );
  });
});
