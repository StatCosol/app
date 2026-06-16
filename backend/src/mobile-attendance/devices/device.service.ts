import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { MobileAttendanceDeviceEntity } from './device.entity';

@Injectable()
export class DeviceService {
  constructor(
    @InjectRepository(MobileAttendanceDeviceEntity)
    private readonly deviceRepo: Repository<MobileAttendanceDeviceEntity>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Admin creates a device record and generates a one-time install token.
   * The Android app later calls registerDevice() to bind its androidId.
   */
  async provisionDevice(
    clientId: string,
    mode: 'KIOSK' | 'ESS',
    branchId: string | null,
    deviceLabel: string | null,
    createdBy: string,
  ): Promise<MobileAttendanceDeviceEntity> {
    const installToken = randomBytes(32).toString('hex'); // 64-char hex token — matches SetupActivity validation
    const device = this.deviceRepo.create({
      clientId,
      mode,
      branchId,
      deviceName: deviceLabel,
      installToken,
      isActive: true,
    });
    return this.deviceRepo.save(device);
  }

  /**
   * On first use: bind androidId to the token (pessimistic-write transaction to
   * prevent two devices racing to claim the same install token).
   */
  async registerDevice(
    installToken: string,
    androidId?: string,
    deviceName?: string,
  ): Promise<MobileAttendanceDeviceEntity> {
    return this.dataSource.transaction(async (em) => {
      const device = await em.findOne(MobileAttendanceDeviceEntity, {
        where: { installToken },
        lock: { mode: 'pessimistic_write' },
      });

      if (!device) throw new NotFoundException('Install token not found');
      if (!device.isActive) throw new UnauthorizedException('Device token revoked');

      if (device.androidId && androidId && device.androidId !== androidId) {
        throw new ConflictException('Install token already bound to a different device');
      }

      device.androidId = androidId ?? device.androidId;
      device.deviceName = deviceName ?? device.deviceName;
      device.lastSeenAt = new Date();
      return em.save(device);
    });
  }

  async authenticateDevice(
    installToken: string,
    androidId?: string,
  ): Promise<MobileAttendanceDeviceEntity> {
    const device = await this.deviceRepo.findOne({ where: { installToken } });
    if (!device || !device.isActive) throw new UnauthorizedException('Device not authorized');

    if (device.androidId && androidId && device.androidId !== androidId) {
      throw new UnauthorizedException('Device ID mismatch');
    }

    device.lastSeenAt = new Date();
    return this.deviceRepo.save(device);
  }

  async revokeDevice(
    clientId: string,
    deviceId: string,
    by: string,
  ): Promise<void> {
    const device = await this.deviceRepo.findOne({
      where: { id: deviceId, clientId },
    });
    if (!device) throw new NotFoundException('Device not found');

    device.isActive = false;
    device.revokedAt = new Date();
    device.revokedBy = by;
    await this.deviceRepo.save(device);
  }

  async findById(deviceId: string): Promise<MobileAttendanceDeviceEntity | null> {
    return this.deviceRepo.findOne({ where: { id: deviceId } });
  }

  async listByClient(clientId: string, branchIds: string[] = []): Promise<any[]> {
    const params: unknown[] = [clientId];
    let branchFilter = '';
    if (branchIds.length > 0) {
      params.push(branchIds);
      branchFilter = ` AND branch_id = ANY($${params.length}::uuid[])`;
    }

    return this.dataSource.query(
      `SELECT id,
              client_id AS "clientId",
              branch_id AS "branchId",
              mode,
              device_name AS "deviceLabel",
              install_token AS "installToken",
              NULL::numeric AS "geofenceLat",
              NULL::numeric AS "geofenceLng",
              NULL::integer AS "geofenceRadiusM",
              created_at AS "registeredAt",
              NULL::uuid AS "registeredBy",
              last_seen_at AS "lastSeenAt",
              NULL::timestamptz AS "lastPunchAt",
              is_active AS "isActive",
              revoked_at AS "revokedAt",
              revoked_by AS "revokedBy",
              NULL::uuid AS "essEmployeeId"
       FROM mobile_attendance_devices
       WHERE client_id = $1
         ${branchFilter}
       ORDER BY created_at DESC`,
      params,
    );
  }
}
