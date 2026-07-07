import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { FaceDeskDeviceService } from './facedesk-device.service';

/**
 * Guard for FaceDesk kiosk device endpoints. Reads the device token from
 * "Authorization: Bearer <token>" (or X-Install-Token), authenticates against
 * facedesk_kiosk_devices, and attaches the device context to the request.
 * Endpoints using this guard must be @Public() to bypass the global JWT guard.
 */
@Injectable()
export class FaceDeskDeviceAuthGuard implements CanActivate {
  constructor(private readonly deviceService: FaceDeskDeviceService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const authHeader = req.headers['authorization'];
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : (req.headers['x-install-token'] as string | undefined);
    if (!token) throw new UnauthorizedException('Device token required');

    const androidId = req.headers['x-android-id'] as string | undefined;
    const device = await this.deviceService.authenticate(token, androidId);
    (req as any).facedeskDevice = device;
    return true;
  }
}
