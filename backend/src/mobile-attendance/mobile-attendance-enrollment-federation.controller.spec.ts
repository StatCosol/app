import { MobileAttendanceEnrollmentFederationController } from './mobile-attendance-enrollment-federation.controller';

describe('MobileAttendanceEnrollmentFederationController', () => {
  const clientUser = {
    id: 'user-1',
    clientId: 'client-1',
    roleCode: 'CLIENT',
  };

  it('lists federated enrollment status for dual-module clients', async () => {
    const federation = {
      listFederated: jest.fn().mockResolvedValue({
        summary: { totalEmployees: 2, mobileEnrolledActive: 1, facedeskEnrolled: 1, bothEnrolled: 0, pendingEither: 1 },
        items: [],
      }),
    };
    const entitlements = {
      assertAnyModule: jest.fn().mockResolvedValue(undefined),
      hasModule: jest.fn().mockResolvedValue(true),
    };
    const controller = new MobileAttendanceEnrollmentFederationController(
      federation as any,
      entitlements as any,
    );

    await controller.listFederated(clientUser as any);

    expect(federation.listFederated).toHaveBeenCalledWith(
      'client-1',
      expect.objectContaining({
        includeMobile: true,
        includeFacedesk: true,
        branchIds: null,
      }),
    );
  });
});
