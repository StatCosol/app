import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { FaceDeskDeviceEntity } from './entities/facedesk.entities';

export interface FaceDeskDeviceContext {
  deviceId: string;
  clientId: string;
  branchId: string | null;
  mode: 'ATTENDANCE' | 'ENROLLMENT';
}

/** Credential-free device shape safe to return from the portal list API. */
export interface FaceDeskDeviceListDto {
  deviceId: string;
  deviceName: string;
  branchId: string | null;
  location: string | null;
  deviceStatus: string;
  mode: 'ATTENDANCE' | 'ENROLLMENT';
  lastSyncTime: Date | null;
  appVersion: string | null;
  createdAt: Date;
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
      adminPin?: string;
    },
  ): Promise<FaceDeskDeviceEntity> {
    if (!body?.deviceName)
      throw new BadRequestException('deviceName is required');
    // Admin PIN gates switching a single device into enrollment mode from the
    // attendance screen. Default to a simple PIN the admin can change later.
    const adminPin = (body.adminPin ?? '').trim() || '0000';
    if (!/^\d{4,12}$/.test(adminPin)) {
      throw new BadRequestException('Admin PIN must be 4–12 digits');
    }
    const installToken = randomBytes(32).toString('hex');
    return this.repo.save(
      this.repo.create({
        clientId,
        branchId: body.branchId ?? null,
        deviceName: body.deviceName,
        location: body.location ?? null,
        mode: body.mode ?? 'ATTENDANCE',
        adminPin,
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
    adminPin: string;
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
      adminPin: device.adminPin ?? '0000',
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

  list(
    clientId: string,
    allowedBranchIds: string[] | null,
  ): Promise<FaceDeskDeviceListDto[]> {
    if (allowedBranchIds?.length === 0) return Promise.resolve([]);

    return this.repo.find({
      select: {
        deviceId: true,
        deviceName: true,
        branchId: true,
        location: true,
        deviceStatus: true,
        mode: true,
        lastSyncTime: true,
        appVersion: true,
        createdAt: true,
      },
      where: {
        clientId,
        ...(allowedBranchIds === null
          ? {}
          : { branchId: In(allowedBranchIds) }),
      },
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

  /**
   * Permanently remove a device. Only a REVOKED device can be deleted — an
   * active device must be revoked first, so a live kiosk is never yanked out
   * from under running attendance by a stray click.
   */
  async remove(clientId: string, deviceId: string): Promise<{ ok: true }> {
    const device = await this.repo.findOne({ where: { deviceId, clientId } });
    if (!device) throw new NotFoundException('Device not found');
    if (device.deviceStatus !== 'REVOKED') {
      throw new BadRequestException('Revoke the device before deleting it');
    }
    await this.repo.delete({ deviceId, clientId });
    return { ok: true };
  }
}
