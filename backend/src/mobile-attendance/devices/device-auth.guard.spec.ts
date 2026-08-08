import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { DeviceAuthGuard } from './device-auth.guard';

describe('DeviceAuthGuard', () => {
  const deviceService = {
    authenticateDevice: jest.fn(),
  };
  const guard = new DeviceAuthGuard(deviceService as any);

  beforeEach(() => {
    jest.resetAllMocks();
    deviceService.authenticateDevice.mockResolvedValue({
      id: 'device-1',
      clientId: 'c1',
      branchId: 'b1',
    });
  });

  it('rejects missing token', async () => {
    const req: any = { headers: {} };
    const ctx = {
      switchToHttp: () => ({ getRequest: () => req }),
    } as ExecutionContext;
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('sets device user context on success', async () => {
    const req: any = { headers: { authorization: 'Bearer install-token' } };
    const ctx = {
      switchToHttp: () => ({ getRequest: () => req }),
    } as ExecutionContext;

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(req.deviceId).toBe('device-1');
    expect(req.user).toEqual(
      expect.objectContaining({
        role: 'DEVICE',
        clientId: 'c1',
        branchId: 'b1',
      }),
    );
  });
});
