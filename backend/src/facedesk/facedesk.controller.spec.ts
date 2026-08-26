import { FaceDeskEnrollmentController } from './facedesk-enrollment.controller';
import { FaceDeskAdminController } from './facedesk-admin.controller';
import { FaceDeskDevicesAdminController } from './facedesk-devices-admin.controller';

function makeEnrollmentController() {
  const enrollment = {
    getEnrolledEmployees: jest.fn(),
  };
  const controller = new FaceDeskEnrollmentController(
    enrollment as any,
    {} as any,
  );
  return { controller, enrollment };
}

function makeAdminController() {
  const admin = {
    listDuplicateAlerts: jest.fn(),
    listReviewQueue: jest.fn(),
  };
  const controller = new FaceDeskAdminController(admin as any);
  return { controller, admin };
}

function makeDevicesController() {
  const devices = { list: jest.fn().mockResolvedValue([]) };
  const controller = new FaceDeskDevicesAdminController(devices as any);
  return { controller, devices };
}

const branchUser = {
  id: 'user-1',
  clientId: 'client-1',
  roleCode: 'CLIENT',
  userType: 'BRANCH',
  branchIds: ['branch-1'],
} as any;

describe('FaceDesk portal controllers branch access', () => {
  it('passes the caller branch scope to the credential-free device list', () => {
    const { controller, devices } = makeDevicesController();

    void controller.listDevices(branchUser);

    expect(devices.list).toHaveBeenCalledWith('client-1', ['branch-1']);
  });

  it('scopes enrolled worker details to a branch user', () => {
    const { controller, enrollment } = makeEnrollmentController();

    void controller.enrolled(branchUser, 'CONTRACTOR');

    expect(enrollment.getEnrolledEmployees).toHaveBeenCalledWith(
      'client-1',
      ['branch-1'],
      'CONTRACTOR',
    );
  });

  it('lets branch users list duplicate alerts scoped to their branch', async () => {
    const { controller, admin } = makeAdminController();
    admin.listDuplicateAlerts.mockResolvedValue([
      { alertId: 'a1', hasNewPhoto: true, hasMatchedPhoto: true },
    ]);

    // Branch verifiers are the role allowed to see biometric faces, so they
    // must be able to list alerts (scoped) rather than being rejected.
    const rows = await controller.duplicateAlerts(branchUser, 'PENDING');

    expect(admin.listDuplicateAlerts).toHaveBeenCalledWith(
      'client-1',
      'PENDING',
      ['branch-1'],
    );
    // Photo flags are preserved for a branch verifier.
    expect(rows[0]).toMatchObject({ hasNewPhoto: true, hasMatchedPhoto: true });
  });

  it('lets a company admin list all alerts but strips photo flags', async () => {
    const { controller, admin } = makeAdminController();
    admin.listDuplicateAlerts.mockResolvedValue([
      { alertId: 'a1', hasNewPhoto: true, hasMatchedPhoto: true },
    ]);
    const adminUser = {
      id: 'u2',
      clientId: 'client-1',
      roleCode: 'CLIENT',
      userType: 'HQ',
    } as any;

    const rows = await controller.duplicateAlerts(adminUser, 'PENDING');

    // scope is null → no branch filter
    expect(admin.listDuplicateAlerts).toHaveBeenCalledWith(
      'client-1',
      'PENDING',
      null,
    );
    // A company admin cannot see biometric faces (DPDP).
    expect(rows[0]).toMatchObject({
      hasNewPhoto: false,
      hasMatchedPhoto: false,
    });
  });

  it('lets branch users verify their own branch review items (scoped)', () => {
    const { controller, admin } = makeAdminController();

    void controller.reviewQueue(branchUser, 'PENDING');

    expect(admin.listReviewQueue).toHaveBeenCalledWith(
      'client-1',
      'PENDING',
      ['branch-1'],
    );
  });
});
