import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { FaceDeskDeviceEntity } from './entities/facedesk.entities';

export interface FaceDeskDeviceContext {
  deviceId: string;
  clientId: string;
  branchId: string | null;
  mode: 'ATTENDANCE' | 'ENROLLMENT';
}

@Injectable()
export class FaceDeskDeviceService {
  constructor(
    @InjectRepository(FaceDeskDeviceEntity)
    private readonly repo: Repository<FaceDeskDeviceEntity>,
  ) {}

  /** Admin provisions a device and gets a one-shot install token. */
  async provision(
    clientId: string,
    body: {
      deviceName: string;
      branchId?: string | null;
      location?: string;
      mode?: 'ATTENDANCE' | 'ENROLLMENT';
    },
  ): Promise<FaceDeskDeviceEntity> {
    if (!body?.deviceName)
      throw new BadRequestException('deviceName is required');
    const installToken = randomBytes(32).toString('hex');
    return this.repo.save(
      this.repo.create({
        clientId,
        branchId: body.branchId ?? null,
        deviceName: body.deviceName,
        location: body.location ?? null,
        mode: body.mode ?? 'ATTENDANCE',
        installToken,
        deviceStatus: 'PROVISIONED',
      }),
    );
  }

  /** Device binds its androidId to the install token (first run). */
  async register(
    installToken: string,
    androidId: string,
  ): Promise<{
    deviceToken: string;
    deviceId: string;
    mode: string;
    clientId: string;
    branchId: string | null;
  }> {
    const device = await this.repo.findOne({ where: { installToken } });
    if (!device || device.deviceStatus === 'REVOKED') {
      throw new UnauthorizedException('Invalid install token');
    }
    if (device.androidId && androidId && device.androidId !== androidId) {
      throw new UnauthorizedException(
        'Device already bound to another Android ID',
      );
    }
    device.androidId = androidId || device.androidId;
    device.deviceStatus = 'ONLINE';
    await this.repo.save(device);
    return {
      deviceToken: device.installToken!,
      deviceId: device.deviceId,
      mode: device.mode,
      clientId: device.clientId,
      branchId: device.branchId,
    };
  }

  /** Validate a device Bearer token → context for kiosk-facing endpoints. */
  async authenticate(
    installToken: string,
    androidId?: string,
  ): Promise<FaceDeskDeviceContext> {
    const device = await this.repo.findOne({ where: { installToken } });
    if (!device || device.deviceStatus === 'REVOKED') {
      throw new UnauthorizedException('Device not authorized');
    }
    if (device.androidId && androidId && device.androidId !== androidId) {
      throw new UnauthorizedException('Device ID mismatch');
    }
    return {
      deviceId: device.deviceId,
      clientId: device.clientId,
      branchId: device.branchId,
      mode: device.mode,
    };
  }

  list(clientId: string): Promise<FaceDeskDeviceEntity[]> {
    return this.repo.find({
      where: { clientId },
      order: { createdAt: 'DESC' },
    });
  }

  async revoke(clientId: string, deviceId: string): Promise<{ ok: true }> {
    const res = await this.repo.update(
      { deviceId, clientId },
      { deviceStatus: 'REVOKED' },
    );
    if (!res.affected) throw new NotFoundException('Device not found');
    return { ok: true };
  }
}
