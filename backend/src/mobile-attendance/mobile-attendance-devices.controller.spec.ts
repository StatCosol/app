import { MobileAttendanceDevicesController } from './mobile-attendance-devices.controller';

function makeController() {
  const deviceService = {
    registerDevice: jest.fn(),
    listByClient: jest.fn(),
    provisionDevice: jest.fn(),
  };
  const entitlements = {
    hasModule: jest.fn(),
  };
  const controller = new MobileAttendanceDevicesController(
    deviceService as any,
    entitlements as any,
  );
  return { controller, deviceService, entitlements };
}

describe('MobileAttendanceDevicesController', () => {
  beforeEach(() => jest.resetAllMocks());

  it('register returns rotated device token metadata', async () => {
    const { controller, deviceService } = makeController();
    deviceService.registerDevice.mockResolvedValue({
      id: 'device-1',
      installToken: 'rotated-token',
      mode: 'KIOSK',
      clientId: 'client-1',
      branchId: 'branch-1',
    });

    await expect(
      controller.register({
        installToken: 'install',
        androidId: 'android-1',
        deviceName: 'Lobby',
      }),
    ).resolves.toEqual({
      deviceToken: 'rotated-token',
      deviceId: 'device-1',
      mode: 'KIOSK',
      clientId: 'client-1',
      branchId: 'branch-1',
    });
  });

  it('list includes install tokens when FaceDesk module is enabled', async () => {
    const { controller, deviceService, entitlements } = makeController();
    entitlements.hasModule.mockResolvedValue(true);
    deviceService.listByClient.mockResolvedValue([{ id: 'device-1' }]);

    await expect(
      controller.list({
        clientId: 'client-1',
        branchIds: ['branch-1'],
      } as any),
    ).resolves.toEqual([{ id: 'device-1' }]);

    expect(entitlements.hasModule).toHaveBeenCalledWith(
      'client-1',
      'CONTRACTOR_FACE_ATTENDANCE',
    );
    expect(deviceService.listByClient).toHaveBeenCalledWith(
      'client-1',
      ['branch-1'],
      true,
    );
  });
});
