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
    const installToken = randomBytes(24).toString('hex'); // 48-char hex token
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

  async listByClient(clientId: string): Promise<MobileAttendanceDeviceEntity[]> {
    return this.deviceRepo.find({ where: { clientId }, order: { createdAt: 'DESC' } });
  }
}
