import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
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

export interface FaceDeskKioskBranding {
  deviceName: string;
  location: string | null;
  branchName: string | null;
  clientName: string | null;
  clientLogoUrl: string | null;
}

@Injectable()
export class FaceDeskDeviceService {
  constructor(
    @InjectRepository(FaceDeskDeviceEntity)
    private readonly repo: Repository<FaceDeskDeviceEntity>,
    private readonly dataSource: DataSource,
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
    const adminPin = (body.adminPin ?? '').trim();
    if (!adminPin) {
      throw new BadRequestException(
        'adminPin is required when provisioning a kiosk device',
      );
    }
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
    appVersion?: string,
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
    // Rotate the install token into a long-lived device token so a leaked
    // provision QR/token cannot be reused after first registration.
    const deviceToken = randomBytes(32).toString('hex');
    device.installToken = deviceToken;
    if (appVersion?.trim()) {
      device.appVersion = appVersion.trim().slice(0, 40);
    }
    await this.repo.save(device);
    return {
      deviceToken,
      deviceId: device.deviceId,
      mode: device.mode,
      clientId: device.clientId,
      branchId: device.branchId,
    };
  }

  /** Update device heartbeat fields after register, punch, or offline sync. */
  async recordTelemetry(
    deviceId: string,
    meta?: { appVersion?: string; offlineQueueDepth?: number },
  ): Promise<void> {
    const patch: Partial<FaceDeskDeviceEntity> = {
      deviceStatus: 'ONLINE',
      lastSyncTime: new Date(),
    };
    if (meta?.appVersion?.trim()) {
      patch.appVersion = meta.appVersion.trim().slice(0, 40);
    }
    if (meta?.offlineQueueDepth != null) {
      patch.offlineQueueDepth = Math.max(
        0,
        Math.floor(meta.offlineQueueDepth),
      );
    }
    await this.repo.update({ deviceId }, patch);
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

  /** Gate/branch labels and optional client logo for the kiosk header. */
  async getKioskBranding(deviceId: string): Promise<FaceDeskKioskBranding> {
    const [row] = await this.dataSource.query<
      Array<{
        deviceName: string;
        location: string | null;
        branchName: string | null;
        clientName: string | null;
        clientLogoUrl: string | null;
      }>
    >(
      `SELECT d.device_name AS "deviceName",
              d.location AS "location",
              b.branch_name AS "branchName",
              c.client_name AS "clientName",
              c.logo_url AS "clientLogoUrl"
         FROM facedesk_kiosk_devices d
         LEFT JOIN branches b ON b.id = d.branch_id
         LEFT JOIN clients c ON c.id = d.client_id
        WHERE d.device_id = $1
        LIMIT 1`,
      [deviceId],
    );
    return {
      deviceName: row?.deviceName ?? 'Kiosk',
      location: row?.location ?? null,
      branchName: row?.branchName ?? null,
      clientName: row?.clientName ?? null,
      clientLogoUrl: row?.clientLogoUrl ?? null,
    };
  }
}
