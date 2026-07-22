import { ForbiddenException } from '@nestjs/common';
import { FaceDeskController } from './facedesk.controller';

function makeController() {
  const admin = {
    listDuplicateAlerts: jest.fn(),
    listReviewQueue: jest.fn(),
  };
  const devices = { list: jest.fn().mockResolvedValue([]) };
  const controller = new FaceDeskController(
    {} as any,
    {} as any,
    admin as any,
    {} as any,
    {} as any,
    {} as any,
    devices as any,
    {} as any,
  );
  return { controller, admin, devices };
}

const branchUser = {
  id: 'user-1',
  clientId: 'client-1',
  roleCode: 'CLIENT',
  userType: 'BRANCH',
  branchIds: ['branch-1'],
} as any;

describe('FaceDeskController branch access', () => {
  it('passes the caller branch scope to the credential-free device list', () => {
    const { controller, devices } = makeController();

    void controller.listDevices(branchUser);

    expect(devices.list).toHaveBeenCalledWith('client-1', ['branch-1']);
  });

  it('rejects branch users from client-wide duplicate alerts', () => {
    const { controller, admin } = makeController();

    expect(() => controller.duplicateAlerts(branchUser)).toThrow(
      ForbiddenException,
    );
    expect(admin.listDuplicateAlerts).not.toHaveBeenCalled();
  });

  it('rejects branch users from the client-wide review queue', () => {
    const { controller, admin } = makeController();

    expect(() => controller.reviewQueue(branchUser)).toThrow(
      ForbiddenException,
    );
    expect(admin.listReviewQueue).not.toHaveBeenCalled();
  });
});
