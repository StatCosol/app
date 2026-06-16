import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
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
    const columns = await this.getDeviceColumns();
    const isActiveCol = this.pickColumn(columns, 'is_active', 'isActive');
    const revokedAtCol = this.pickColumn(columns, 'revoked_at', 'revokedAt');
    const revokedByCol = this.pickColumn(columns, 'revoked_by', 'revokedBy');
    const assignments: string[] = [];
    const params: unknown[] = [deviceId, clientId];

    if (isActiveCol) assignments.push(`${this.quoteIdentifier(isActiveCol)} = false`);
    if (revokedAtCol) assignments.push(`${this.quoteIdentifier(revokedAtCol)} = now()`);
    if (revokedByCol && this.isUuid(by)) {
      params.push(by);
      assignments.push(`${this.quoteIdentifier(revokedByCol)} = $${params.length}::uuid`);
    }

    if (assignments.length === 0) {
      throw new NotFoundException('Device revoke columns not found');
    }

    const result = await this.dataSource.query<Array<{ id: string }>>(
      `UPDATE mobile_attendance_devices
          SET ${assignments.join(', ')}
        WHERE id = $1::uuid
          AND COALESCE(to_jsonb(mobile_attendance_devices)->>'clientId', to_jsonb(mobile_attendance_devices)->>'client_id') = $2
        RETURNING id`,
      params,
    );

    if (!result || result.length === 0) throw new NotFoundException('Device not found');
  }

  async permanentlyDeleteDevice(
    clientId: string,
    deviceId: string,
    branchIds: string[] = [],
  ): Promise<{ ok: true; id: string }> {
    const columns = await this.getDeviceColumns();
    const isActiveCol = this.pickColumn(columns, 'is_active', 'isActive');
    const activeFilter = isActiveCol
      ? `AND COALESCE((to_jsonb(d)->>${this.sqlString(isActiveCol)})::boolean, true) = false`
      : '';
    const params: unknown[] = [deviceId, clientId];
    let branchFilter = '';
    if (branchIds.length > 0) {
      params.push(branchIds);
      branchFilter = `AND COALESCE(to_jsonb(d)->>'branchId', to_jsonb(d)->>'branch_id') = ANY($${params.length}::text[])`;
    }

    const existing = await this.dataSource.query<Array<{ id: string }>>(
      `SELECT d.id
         FROM mobile_attendance_devices d
        WHERE d.id = $1::uuid
          AND COALESCE(to_jsonb(d)->>'clientId', to_jsonb(d)->>'client_id') = $2
          ${activeFilter}
          ${branchFilter}
        LIMIT 1`,
      params,
    );

    if (!existing || existing.length === 0) {
      throw new ConflictException('Revoke the device before deleting it');
    }

    const history = await this.dataSource.query<Array<{ hasHistory: boolean }>>(
      `SELECT (
          EXISTS (
            SELECT 1
              FROM mobile_attendance_punches
             WHERE device_id = $1::uuid
               AND client_id = $2::uuid
          )
          OR EXISTS (
            SELECT 1
              FROM contractor_biometric_punches
             WHERE device_id = $1::uuid
               AND client_id = $2::uuid
          )
        ) AS "hasHistory"`,
      [deviceId, clientId],
    );

    if (history?.[0]?.hasHistory) {
      throw new ConflictException(
        'Device has attendance history and cannot be permanently deleted; it remains revoked',
      );
    }

    await this.dataSource.transaction(async (em) => {
      await em.query(
        `DELETE FROM kiosk_enroll_tickets
          WHERE device_id = $1::uuid
            AND client_id = $2::uuid
            AND status IN ('PENDING', 'CANCELLED', 'EXPIRED')`,
        [deviceId, clientId],
      );

      try {
        const result = await em.query<Array<{ id: string }>>(
          `DELETE FROM mobile_attendance_devices d
            WHERE d.id = $1::uuid
              AND COALESCE(to_jsonb(d)->>'clientId', to_jsonb(d)->>'client_id') = $2
              ${branchFilter}
            RETURNING d.id`,
          params,
        );
        if (!result || result.length === 0) throw new NotFoundException('Device not found');
      } catch (err: any) {
        if (err?.code === '23503') {
          throw new ConflictException(
            'Device has attendance history and cannot be permanently deleted; it remains revoked',
          );
        }
        throw err;
      }
    });

    return { ok: true, id: deviceId };
  }

  async findById(deviceId: string): Promise<MobileAttendanceDeviceEntity | null> {
    return this.deviceRepo.findOne({ where: { id: deviceId } });
  }

  async listByClient(clientId: string, branchIds: string[] = []): Promise<any[]> {
    const params: unknown[] = [clientId];
    let branchFilter = '';
    if (branchIds.length > 0) {
      params.push(branchIds);
      branchFilter = ` AND COALESCE(to_jsonb(d)->>'branchId', to_jsonb(d)->>'branch_id') = ANY($${params.length}::text[])`;
    }

    return this.dataSource.query(
      `SELECT d.id,
              COALESCE(to_jsonb(d)->>'clientId', to_jsonb(d)->>'client_id') AS "clientId",
              COALESCE(to_jsonb(d)->>'branchId', to_jsonb(d)->>'branch_id') AS "branchId",
              COALESCE(to_jsonb(d)->>'mode', 'KIOSK') AS "mode",
              COALESCE(
                to_jsonb(d)->>'deviceLabel',
                to_jsonb(d)->>'device_label',
                to_jsonb(d)->>'deviceName',
                to_jsonb(d)->>'device_name'
              ) AS "deviceLabel",
              COALESCE(to_jsonb(d)->>'installToken', to_jsonb(d)->>'install_token') AS "installToken",
              NULL::numeric AS "geofenceLat",
              NULL::numeric AS "geofenceLng",
              NULL::integer AS "geofenceRadiusM",
              COALESCE(to_jsonb(d)->>'registeredAt', to_jsonb(d)->>'registered_at', to_jsonb(d)->>'created_at') AS "registeredAt",
              NULL::uuid AS "registeredBy",
              COALESCE(to_jsonb(d)->>'lastSeenAt', to_jsonb(d)->>'last_seen_at') AS "lastSeenAt",
              NULL::timestamptz AS "lastPunchAt",
              COALESCE((to_jsonb(d)->>'isActive')::boolean, (to_jsonb(d)->>'is_active')::boolean, true) AS "isActive",
              COALESCE(to_jsonb(d)->>'revokedAt', to_jsonb(d)->>'revoked_at') AS "revokedAt",
              COALESCE(to_jsonb(d)->>'revokedBy', to_jsonb(d)->>'revoked_by') AS "revokedBy",
              NULL::uuid AS "essEmployeeId"
       FROM mobile_attendance_devices d
       WHERE COALESCE(to_jsonb(d)->>'clientId', to_jsonb(d)->>'client_id') = $1
         ${branchFilter}
       ORDER BY COALESCE(to_jsonb(d)->>'registeredAt', to_jsonb(d)->>'registered_at', to_jsonb(d)->>'created_at') DESC NULLS LAST`,
      params,
    );
  }

  private async getDeviceColumns(): Promise<Set<string>> {
    const rows = await this.dataSource.query<Array<{ column_name: string }>>(
      `SELECT column_name
         FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'mobile_attendance_devices'`,
    );
    return new Set(rows.map((row) => row.column_name));
  }

  private pickColumn(columns: Set<string>, ...names: string[]): string | null {
    return names.find((name) => columns.has(name)) ?? null;
  }

  private quoteIdentifier(identifier: string): string {
    return `"${identifier.replace(/"/g, '""')}"`;
  }

  private sqlString(value: string): string {
    return `'${value.replace(/'/g, "''")}'`;
  }

  private isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    );
  }
}
