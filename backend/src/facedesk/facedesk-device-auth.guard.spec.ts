import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { FaceDeskDeviceAuthGuard } from './facedesk-device-auth.guard';

describe('FaceDeskDeviceAuthGuard', () => {
  const deviceService = {
    authenticate: jest.fn(),
  };
  const guard = new FaceDeskDeviceAuthGuard(deviceService as any);

  function ctx(headers: Record<string, string>): ExecutionContext {
    const req: any = { headers };
    return {
      switchToHttp: () => ({ getRequest: () => req }),
    } as ExecutionContext;
  }

  beforeEach(() => {
    jest.resetAllMocks();
    deviceService.authenticate.mockResolvedValue({
      deviceId: 'dev-1',
      clientId: 'c1',
      branchId: 'b1',
      mode: 'ATTENDANCE',
    });
  });

  it('rejects when no bearer token is provided', async () => {
    await expect(guard.canActivate(ctx({}))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('authenticates bearer token and attaches device context', async () => {
    const request: any = { headers: { authorization: 'Bearer abc123' } };
    const execution = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as ExecutionContext;

    await expect(guard.canActivate(execution)).resolves.toBe(true);
    expect(deviceService.authenticate).toHaveBeenCalledWith('abc123', undefined);
    expect(request.facedeskDevice.deviceId).toBe('dev-1');
  });

  it('accepts x-install-token and forwards android id', async () => {
    const request: any = {
      headers: { 'x-install-token': 'tok', 'x-android-id': 'android-1' },
    };
    const execution = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as ExecutionContext;

    await guard.canActivate(execution);
    expect(deviceService.authenticate).toHaveBeenCalledWith(
      'tok',
      'android-1',
    );
  });

  it('rejects invalid bearer tokens from authenticate failures', async () => {
    deviceService.authenticate.mockRejectedValue(
      new UnauthorizedException('Invalid device token'),
    );

    await expect(
      guard.canActivate(
        ctx({ authorization: 'Bearer revoked-token' }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
