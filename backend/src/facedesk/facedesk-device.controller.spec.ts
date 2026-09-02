import { ServiceUnavailableException } from '@nestjs/common';
import { FaceDeskDeviceController } from './facedesk-device.controller';

function makeController() {
  const devices = {
    register: jest.fn(),
    recordTelemetry: jest.fn().mockResolvedValue(undefined),
    getKioskBranding: jest.fn().mockResolvedValue({
      deviceName: 'Gate 1',
      location: 'Main',
      branchName: 'Unit 1',
      clientName: 'Acme',
      clientLogoUrl: null,
    }),
  };
  const attendance = {
    markAttendance: jest.fn().mockResolvedValue({ status: 'MARKED' }),
    offlineSync: jest.fn().mockResolvedValue({ synced: 1 }),
  };
  const enrollment = {
    getPendingEmployees: jest.fn(),
    validateQuality: jest.fn(),
    saveProfile: jest.fn(),
  };
  const tickets = {
    getPendingForDevice: jest.fn(),
    markCapturing: jest.fn(),
    complete: jest.fn(),
  };
  const settings = {
    getEffective: jest.fn().mockResolvedValue({
      identificationMode: 'PIN_THEN_FACE',
      frameCaptureCount: 3,
      livenessRequired: true,
      offlineSyncEnabled: true,
    }),
  };
  const azureFace = {
    livenessEnabled: true,
    createDeviceLivenessSession: jest
      .fn()
      .mockResolvedValue({ sessionId: 'sess-1', authToken: 'tok-1' }),
    readLivenessVerdict: jest.fn(),
  };
  const controller = new FaceDeskDeviceController(
    devices as any,
    attendance as any,
    enrollment as any,
    tickets as any,
    settings as any,
    azureFace as any,
  );
  return {
    controller,
    azureFace,
    devices,
    attendance,
    enrollment,
    tickets,
    settings,
  };
}

const deviceCtx = {
  deviceId: 'dev-1',
  clientId: 'client-1',
  branchId: 'branch-1',
  mode: 'ATTENDANCE' as const,
};

function reqWithDevice(): any {
  return { facedeskDevice: deviceCtx };
}

describe('FaceDeskDeviceController', () => {
  beforeEach(() => jest.resetAllMocks());

  it('register merges kiosk settings into the device bind response', async () => {
    const { controller, devices, settings } = makeController();
    devices.register.mockResolvedValue({
      deviceToken: 'rotated-token',
      deviceId: 'dev-1',
      clientId: 'client-1',
    });

    await expect(
      controller.register({
        installToken: 'install',
        androidId: 'android-1',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        deviceToken: 'rotated-token',
        identificationMode: 'PIN_THEN_FACE',
        frameCaptureCount: 3,
        livenessRequired: true,
      }),
    );
    expect(settings.getEffective).toHaveBeenCalledWith('client-1');
  });

  it('mark attendance scopes to the authenticated kiosk device', async () => {
    const { controller, attendance } = makeController();
    const dto = { pin: '1234', frames: [] } as any;

    await controller.mark(reqWithDevice(), dto);

    expect(attendance.markAttendance).toHaveBeenCalledWith(
      'client-1',
      'branch-1',
      'dev-1',
      dto,
    );
  });

  it('offline sync forwards device context and punch batch', async () => {
    const { controller, attendance } = makeController();
    const punches = [{ pin: '1234' }] as any;

    await controller.offlineSync(reqWithDevice(), { punches });

    expect(attendance.offlineSync).toHaveBeenCalledWith(
      'client-1',
      'branch-1',
      'dev-1',
      punches,
    );
  });

  it('pending enrollment uses the device branch as scope', async () => {
    const { controller, enrollment } = makeController();

    void controller.pending(reqWithDevice(), 'CONTRACTOR');

    expect(enrollment.getPendingEmployees).toHaveBeenCalledWith(
      'client-1',
      ['branch-1'],
      'CONTRACTOR',
    );
  });

  it('config returns effective settings for the device client', async () => {
    const { controller, settings } = makeController();

    await expect(controller.config(reqWithDevice())).resolves.toEqual({
      mode: 'ATTENDANCE',
      identificationMode: 'PIN_THEN_FACE',
      frameCaptureCount: 3,
      livenessRequired: true,
      offlineSyncEnabled: true,
      branding: {
        deviceName: 'Gate 1',
        location: 'Main',
        branchName: 'Unit 1',
        clientName: 'Acme',
        clientLogoUrl: null,
      },
    });
    expect(settings.getEffective).toHaveBeenCalledWith('client-1');
  });
});

describe('FaceDeskDeviceController liveness session', () => {
  const req = (device: Record<string, unknown>) =>
    ({ facedeskDevice: device }) as any;

  it('returns only the session id and auth token to the device', async () => {
    const { controller, azureFace } = makeController();
    const res = await controller.livenessSession(
      req({ deviceId: 'dev-1', clientId: 'c1', mode: 'ATTENDANCE' }),
    );

    // Correlated to the kiosk, so Azure-side sessions are attributable.
    expect(azureFace.createDeviceLivenessSession).toHaveBeenCalledWith('dev-1');
    expect(res).toEqual({ sessionId: 'sess-1', authToken: 'tok-1' });
    // The account key must never reach a device, and neither must a verdict the
    // kiosk could then assert for itself.
    expect(Object.keys(res)).toEqual(['sessionId', 'authToken']);
  });

  it('propagates the service refusal when Azure is not configured', async () => {
    const { controller, azureFace } = makeController();
    azureFace.createDeviceLivenessSession.mockRejectedValue(
      new ServiceUnavailableException('Azure Face liveness is not configured'),
    );
    await expect(
      controller.livenessSession(req({ deviceId: 'dev-1', clientId: 'c1' })),
    ).rejects.toThrow(/not configured/i);
  });
});
