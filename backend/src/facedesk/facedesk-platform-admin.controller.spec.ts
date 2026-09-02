import { FaceDeskPlatformAdminController } from './facedesk-platform-admin.controller';

describe('FaceDeskPlatformAdminController', () => {
  const clientId = '51936d06-168f-47d2-a12b-33e9306987e2';

  function setup() {
    const admin = {
      assertAzureBackfillClient: jest.fn().mockResolvedValue(undefined),
      getAzureFaceBackfillStatus: jest.fn().mockResolvedValue({ pending: 2 }),
      backfillAzureFaceList: jest.fn().mockResolvedValue({ done: true }),
    };
    const entitlements = {
      assertModule: jest.fn().mockResolvedValue(undefined),
    };
    return {
      controller: new FaceDeskPlatformAdminController(
        admin as any,
        entitlements as any,
      ),
      admin,
      entitlements,
    };
  }

  it('checks the FaceDesk entitlement before exposing client status', async () => {
    const { controller, admin, entitlements } = setup();

    await controller.getAzureBackfillStatus(clientId);

    expect(entitlements.assertModule).toHaveBeenCalledWith(
      clientId,
      'CONTRACTOR_FACE_ATTENDANCE',
    );
    expect(admin.getAzureFaceBackfillStatus).toHaveBeenCalledWith(clientId);
  });

  it('targets the selected client and preserves batch controls', async () => {
    const { controller, admin } = setup();

    await controller.backfillAzureFaces(clientId, {
      cursor: 'profile-1',
      limit: 25,
    });

    expect(admin.backfillAzureFaceList).toHaveBeenCalledWith(clientId, {
      cursor: 'profile-1',
      limit: 25,
    });
  });

  it('does not start a backfill when the client lacks FaceDesk access', async () => {
    const { controller, admin, entitlements } = setup();
    entitlements.assertModule.mockRejectedValue(new Error('not entitled'));

    await expect(
      controller.backfillAzureFaces(clientId, { limit: 1 }),
    ).rejects.toThrow('not entitled');
    expect(admin.backfillAzureFaceList).not.toHaveBeenCalled();
  });
});
