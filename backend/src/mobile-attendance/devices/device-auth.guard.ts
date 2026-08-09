import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { DeviceService } from './device.service';
import { readDeviceInstallToken } from './device-install-token.util';

/**
 * Guard for device-facing endpoints.
 * Reads the install token from "Authorization: Bearer <token>" and looks up
 * the device. On success it sets req.deviceId and populates req.user so the
 * RolesGuard sees role = 'DEVICE'.
 *
 * Endpoints using this guard must also be marked @Public() to bypass the
 * global JwtAuthGuard (which would reject non-JWT bearer values).
 */
@Injectable()
export class DeviceAuthGuard implements CanActivate {
  constructor(private readonly deviceService: DeviceService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();

    const installToken = readDeviceInstallToken(req);

    if (!installToken) {
      throw new UnauthorizedException('Device install token required');
    }

    const androidId = req.headers['x-android-id'] as string | undefined;
    const device = await this.deviceService.authenticateDevice(
      installToken,
      androidId,
    );

    if (device.mode === 'ESS') {
      throw new UnauthorizedException(
        'ESS Mobile Attendance device access has been retired',
      );
    }

    (req as any).deviceId = device.id;
    (req as any).deviceInstallToken = installToken;
    (req as any).user = {
      role: 'DEVICE',
      roles: ['DEVICE'],
      clientId: device.clientId,
      branchId: device.branchId,
      userId: device.id,
    };

    return true;
  }
}
