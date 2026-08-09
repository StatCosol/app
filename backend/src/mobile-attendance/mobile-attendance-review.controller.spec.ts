import { BadRequestException } from '@nestjs/common';
import { MobileAttendanceReviewController } from './mobile-attendance-review.controller';

describe('MobileAttendanceReviewController', () => {
  const clientUser = {
    id: 'user-1',
    clientId: 'client-1',
    roleCode: 'CLIENT',
  };

  it('lists FaceDesk-only federated review items', async () => {
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
      assertModule: jest.fn().mockResolvedValue(undefined),
    };
    const controller = new MobileAttendanceReviewController(
      federation as any,
      reviewAction as any,
      entitlements as any,
    );

    await controller.listFederated(clientUser as any);

    expect(entitlements.assertModule).toHaveBeenCalledWith(
      'client-1',
      'CONTRACTOR_FACE_ATTENDANCE',
    );
    expect(federation.listFederated).toHaveBeenCalledWith(
      'client-1',
      expect.objectContaining({
        includeMobile: false,
        includeFacedesk: true,
        branchIds: null,
      }),
    );
  });

  it('rejects retired mobile borderline review actions', async () => {
    const federation = { listFederated: jest.fn() };
    const reviewAction = { actOnFederatedItem: jest.fn() };
    const entitlements = {
      assertModule: jest.fn().mockResolvedValue(undefined),
    };
    const controller = new MobileAttendanceReviewController(
      federation as any,
      reviewAction as any,
      entitlements as any,
    );

    await expect(
      controller.actOnFederatedItem(
        clientUser as any,
        'MOBILE_BORDERLINE',
        'punch-1',
        { action: 'APPROVE', note: 'ok' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(reviewAction.actOnFederatedItem).not.toHaveBeenCalled();
  });

  it('routes FaceDesk verification actions through the action service', async () => {
    const federation = { listFederated: jest.fn() };
    const reviewAction = {
      actOnFederatedItem: jest
        .fn()
        .mockResolvedValue({ ok: true, decision: 'REVIEW_APPROVED' }),
    };
    const entitlements = {
      assertModule: jest.fn().mockResolvedValue(undefined),
    };
    const controller = new MobileAttendanceReviewController(
      federation as any,
      reviewAction as any,
      entitlements as any,
    );

    await controller.actOnFederatedItem(
      clientUser as any,
      'FACEDESK_VERIFICATION',
      'review-1',
      { action: 'APPROVE', note: 'ok' },
    );

    expect(reviewAction.actOnFederatedItem).toHaveBeenCalledWith(
      'client-1',
      'FACEDESK_VERIFICATION',
      'review-1',
      'user-1',
      { action: 'APPROVE', note: 'ok' },
      null,
    );
  });
});
