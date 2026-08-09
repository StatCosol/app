import { MobileAttendanceEnrollmentFederationController } from './mobile-attendance-enrollment-federation.controller';

describe('MobileAttendanceEnrollmentFederationController', () => {
  const clientUser = {
    id: 'user-1',
    clientId: 'client-1',
    roleCode: 'CLIENT',
  };

  it('lists federated enrollment status for FaceDesk clients', async () => {
    const federation = {
      listFederated: jest.fn().mockResolvedValue({
        summary: { totalEmployees: 2, mobileEnrolledActive: 0, facedeskEnrolled: 1, bothEnrolled: 0, pendingEither: 1 },
        items: [],
      }),
    };
    const entitlements = {
      assertModule: jest.fn().mockResolvedValue(undefined),
    };
    const controller = new MobileAttendanceEnrollmentFederationController(
      federation as any,
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
});
