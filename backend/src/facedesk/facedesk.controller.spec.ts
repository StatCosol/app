import { ForbiddenException } from '@nestjs/common';
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

  it('rejects branch users from client-wide duplicate alerts', () => {
    const { controller, admin } = makeAdminController();

    expect(() => controller.duplicateAlerts(branchUser)).toThrow(
      ForbiddenException,
    );
    expect(admin.listDuplicateAlerts).not.toHaveBeenCalled();
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
