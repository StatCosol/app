import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { MobileAttendanceDeviceEntity } from './device.entity';

@Injectable()
export class DeviceService {
  private readonly logger = new Logger(DeviceService.name);

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
    _createdBy: string,
    geofenceLat: number | null = null,
    geofenceLng: number | null = null,
    geofenceRadiusM: number | null = null,
  ): Promise<MobileAttendanceDeviceEntity> {
    const hasGeo = geofenceLat !== null || geofenceLng !== null || geofenceRadiusM !== null;
    if (hasGeo) {
      if (geofenceLat === null || geofenceLng === null || geofenceRadiusM === null) {
        throw new ConflictException('Geofence requires lat, lng, and radiusM together');
      }
      this.validateGeofenceRange(geofenceLat, geofenceLng, geofenceRadiusM);
    }

    const installToken = randomBytes(32).toString('hex');
    const device = this.deviceRepo.create({
      clientId,
      mode,
      branchId,
      deviceName: deviceLabel,
      installToken,
      isActive: true,
      geofenceLat: geofenceLat !== null ? String(geofenceLat) : null,
      geofenceLng: geofenceLng !== null ? String(geofenceLng) : null,
      geofenceRadiusM: geofenceRadiusM ?? null,
    });
    const saved = await this.deviceRepo.save(device);
    this.logger.log(`provisionDevice: created device=${saved.id} isActive=${saved.isActive} mode=${saved.mode}`);
    return saved;
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
      const columns = await this.getTableColumns('mobile_attendance_devices');
      const tokenCol = this.requireColumn(columns, 'install_token', 'installToken');

      const rows = await em.query<any[]>(
        `SELECT ${this.deviceReturnProjection('d')}
           FROM mobile_attendance_devices d
          WHERE d.${this.quoteIdentifier(tokenCol)} = $1
          FOR UPDATE`,
        [installToken],
      );
      const device = rows[0];

      if (!device) throw new NotFoundException('Install token not found');
      if (!device.isActive) {
        this.logger.warn(`registerDevice: token revoked — isActive=${device.isActive} device=${device.id}`);
        throw new UnauthorizedException('Device token revoked');
      }
      if (device.androidId && androidId && device.androidId !== androidId) {
        throw new ConflictException('Install token already bound to a different device');
      }

      // Prevent the same physical device from holding multiple active tokens
      if (androidId && !device.androidId) {
        const androidIdCol = this.pickColumn(columns, 'android_id', 'androidId');
        const deletedAtCol = this.pickColumn(columns, 'deleted_at', 'deletedAt');
        const notDeleted = deletedAtCol ? `AND d.${this.quoteIdentifier(deletedAtCol)} IS NULL` : '';
        if (androidIdCol) {
          const conflict = await em.query<any[]>(
            `SELECT d.id FROM mobile_attendance_devices d
              WHERE d.client_id = $1::uuid
                AND d.${this.quoteIdentifier(androidIdCol)} = $2
                AND d.id <> $3::uuid
                ${notDeleted}
             LIMIT 1`,
            [device.clientId, androidId, device.id],
          );
          if (conflict.length > 0) {
            throw new ConflictException('This Android device is already registered under another install token');
          }
        }
      }

      const sets: string[] = [];
      const params: unknown[] = [device.id];

      const lastSeenCol = this.pickColumn(columns, 'last_seen_at', 'lastSeenAt');
      if (lastSeenCol) sets.push(`${this.quoteIdentifier(lastSeenCol)} = now()`);

      if (androidId && !device.androidId) {
        const androidIdCol = this.pickColumn(columns, 'android_id', 'androidId');
        if (androidIdCol) {
          params.push(androidId);
          sets.push(`${this.quoteIdentifier(androidIdCol)} = $${params.length}`);
        }
      }

      if (deviceName) {
        const nameCol = this.pickColumn(columns, 'device_name', 'device_label', 'deviceName', 'deviceLabel');
        if (nameCol) {
          params.push(deviceName);
          sets.push(`${this.quoteIdentifier(nameCol)} = $${params.length}`);
        }
      }

      if (sets.length > 0) {
        await em.query(
          `UPDATE mobile_attendance_devices SET ${sets.join(', ')} WHERE id = $1::uuid`,
          params,
        );
      }

      return {
        ...device,
        androidId: androidId ?? device.androidId,
        deviceName: deviceName ?? device.deviceName,
        lastSeenAt: new Date(),
      } as MobileAttendanceDeviceEntity;
    });
  }

  async authenticateDevice(
    installToken: string,
    androidId?: string,
  ): Promise<MobileAttendanceDeviceEntity> {
    const columns = await this.getTableColumns('mobile_attendance_devices');
    const tokenCol = this.requireColumn(columns, 'install_token', 'installToken');
    const deletedAtCol = this.pickColumn(columns, 'deleted_at', 'deletedAt');
    const deletedFilter = deletedAtCol
      ? `AND d.${this.quoteIdentifier(deletedAtCol)} IS NULL`
      : '';

    const rows = await this.dataSource.query<any[]>(
      `SELECT ${this.deviceReturnProjection('d')}
         FROM mobile_attendance_devices d
        WHERE d.${this.quoteIdentifier(tokenCol)} = $1
          ${deletedFilter}
        LIMIT 1`,
      [installToken],
    );
    const device = rows[0];

    if (!device || !device.isActive) throw new UnauthorizedException('Device not authorized');
    if (device.androidId && androidId && device.androidId !== androidId) {
      throw new UnauthorizedException('Device ID mismatch');
    }

    const lastSeenCol = this.pickColumn(columns, 'last_seen_at', 'lastSeenAt');
    if (lastSeenCol) {
      await this.dataSource.query(
        `UPDATE mobile_attendance_devices SET ${this.quoteIdentifier(lastSeenCol)} = now() WHERE id = $1::uuid`,
        [device.id],
      );
    }

    return { ...device, lastSeenAt: new Date() } as MobileAttendanceDeviceEntity;
  }

  async revokeDevice(
    clientId: string,
    deviceId: string,
    by: string,
    branchIds: string[] = [],
  ): Promise<void> {
    if (!(await this.tableExists('mobile_attendance_devices'))) {
      throw new NotFoundException('Device not found');
    }
    const columns = await this.getTableColumns('mobile_attendance_devices');
    const isActiveCol = this.requireColumn(columns, 'is_active', 'isActive');
    const revokedAtCol = this.pickColumn(columns, 'revoked_at', 'revokedAt');
    const revokedByCol = this.pickColumn(columns, 'revoked_by', 'revokedBy');
    const branchCol = this.pickColumn(columns, 'branch_id', 'branchId');

    const params: unknown[] = [deviceId, clientId];
    const sets = [`${this.quoteIdentifier(isActiveCol)} = false`];
    if (revokedAtCol) sets.push(`${this.quoteIdentifier(revokedAtCol)} = now()`);
    if (revokedByCol && this.isUuid(by)) {
      params.push(by);
      sets.push(`${this.quoteIdentifier(revokedByCol)} = $${params.length}::uuid`);
    }

    let branchFilter = '';
    if (branchIds.length > 0 && branchCol) {
      params.push(branchIds);
      branchFilter = `AND d.${this.quoteIdentifier(branchCol)} = ANY($${params.length}::uuid[])`;
    }

    const raw = await this.dataSource.query(
      `UPDATE mobile_attendance_devices d
          SET ${sets.join(', ')}
        WHERE d.id = $1::uuid
          AND d.client_id = $2::uuid
          ${branchFilter}
        RETURNING d.id`,
      params,
    );
    const rows: Array<{ id: string }> = Array.isArray(raw[0]) ? raw[0] : raw;
    if (!rows || rows.length === 0) throw new NotFoundException('Device not found');
  }

  async permanentlyDeleteDevice(
    clientId: string,
    deviceId: string,
    branchIds: string[] = [],
  ): Promise<{ ok: true; id: string }> {
    const params: unknown[] = [deviceId, clientId];
    let branchFilter = '';
    if (branchIds.length > 0) {
      params.push(branchIds);
      branchFilter = `AND d.branch_id = ANY($${params.length}::uuid[])`;
    }
    const activeFilter = `AND d.is_active = false`;

    const existing = await this.dataSource.query<Array<{ id: string }>>(
      `SELECT d.id
         FROM mobile_attendance_devices d
        WHERE d.id = $1::uuid
          AND d.client_id = $2::uuid
          ${activeFilter}
          ${branchFilter}
        LIMIT 1`,
      params,
    );

    if (!existing || existing.length === 0) {
      throw new ConflictException('Revoke the device before deleting it');
    }

    await this.deleteNonCompletedKioskTickets(deviceId, clientId);

    if (await this.deviceHasPunchHistory(deviceId, clientId)) {
      await this.softDeleteDeviceRow(deviceId, clientId, params, branchFilter);
      return { ok: true, id: deviceId };
    }

    try {
      await this.dataSource.transaction(async (em) => {
        const raw = await em.query(
          `DELETE FROM mobile_attendance_devices d
            WHERE d.id = $1::uuid
              AND d.client_id = $2::uuid
              ${branchFilter}
            RETURNING d.id`,
          params,
        );
        const rows: Array<{ id: string }> = Array.isArray(raw[0]) ? raw[0] : raw;
        if (!rows || rows.length === 0) throw new NotFoundException('Device not found');
      });
    } catch (err: any) {
      if (err?.code === '23503') {
        await this.softDeleteDeviceRow(deviceId, clientId, params, branchFilter);
        return { ok: true, id: deviceId };
      }
      throw err;
    }

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
      branchFilter = ` AND d.branch_id = ANY($${params.length}::uuid[])`;
    }

    if (!(await this.tableExists('mobile_attendance_devices'))) return [];

    const columns = await this.getTableColumns('mobile_attendance_devices');
    const deletedAtCol = this.pickColumn(columns, 'deleted_at', 'deletedAt');
    const deletedFilter = deletedAtCol ? `AND d.${this.quoteIdentifier(deletedAtCol)} IS NULL` : '';
    const orderBy = this.deviceCreatedAtOrderExpression('d');

    return this.dataSource.query(
      `SELECT ${this.deviceReturnProjection('d')},
              COALESCE(
                to_jsonb(d)->>'deviceName',
                to_jsonb(d)->>'device_name',
                to_jsonb(d)->>'deviceLabel',
                to_jsonb(d)->>'device_label'
              ) AS "deviceLabel",
              NULL::uuid AS "registeredBy",
              COALESCE(to_jsonb(d)->>'createdAt', to_jsonb(d)->>'created_at', to_jsonb(d)->>'registeredAt', to_jsonb(d)->>'registered_at') AS "registeredAt",
              NULL::timestamptz AS "lastPunchAt",
              NULL::uuid AS "essEmployeeId"
       FROM mobile_attendance_devices d
       WHERE d.client_id = $1::uuid
         ${deletedFilter}
         ${branchFilter}
       ORDER BY ${orderBy} DESC NULLS LAST`,
      params,
    );
  }

  /** Module-level cache for information_schema column lookups.
   *  Schema doesn't change at runtime so indefinite caching is safe. */
  private readonly columnCache = new Map<string, Set<string>>();

  private async getTableColumns(tableName: string): Promise<Set<string>> {
    const cached = this.columnCache.get(tableName);
    if (cached) return cached;

    const rows = await this.dataSource.query<Array<{ column_name: string }>>(
      `SELECT column_name
         FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = $1`,
      [tableName],
    );
    const result = new Set(rows.map((row) => row.column_name));
    this.columnCache.set(tableName, result);
    return result;
  }

  private async tableExists(tableName: string): Promise<boolean> {
    const rows = await this.dataSource.query<Array<{ exists: boolean }>>(
      `SELECT EXISTS (
         SELECT 1
           FROM information_schema.tables
          WHERE table_schema = current_schema()
            AND table_name = $1
       ) AS "exists"`,
      [tableName],
    );
    return rows?.[0]?.exists === true;
  }

  private async deleteNonCompletedKioskTickets(deviceId: string, clientId: string): Promise<void> {
    if (!(await this.tableExists('kiosk_enroll_tickets'))) return;
    const columns = await this.getTableColumns('kiosk_enroll_tickets');
    const deviceCol = this.pickColumn(columns, 'device_id', 'deviceId');
    const clientCol = this.pickColumn(columns, 'client_id', 'clientId');
    if (!deviceCol || !clientCol) return;

    await this.dataSource.query(
      `DELETE FROM kiosk_enroll_tickets k
        WHERE ${this.quoteIdentifier(deviceCol)}::text = $1
          AND ${this.quoteIdentifier(clientCol)}::text = $2
          AND COALESCE(to_jsonb(k)->>'status', '') <> 'COMPLETED'`,
      [deviceId, clientId],
    );
  }

  private async softDeleteDeviceRow(
    deviceId: string,
    clientId: string,
    scopedParams: unknown[],
    branchFilter: string,
  ): Promise<void> {
    const columns = await this.getTableColumns('mobile_attendance_devices');
    const deletedAtCol = this.requireColumn(columns, 'deleted_at', 'deletedAt');
    const isActiveCol = this.pickColumn(columns, 'is_active', 'isActive');
    const assignments = [`${this.quoteIdentifier(deletedAtCol)} = now()`];
    if (isActiveCol) assignments.push(`${this.quoteIdentifier(isActiveCol)} = false`);

    const raw = await this.dataSource.query(
      `UPDATE mobile_attendance_devices d
          SET ${assignments.join(', ')}
        WHERE d.id = $1::uuid
          AND d.client_id = $2::uuid
          ${branchFilter}
        RETURNING d.id`,
      scopedParams,
    );
    const rows: Array<{ id: string }> = Array.isArray(raw[0]) ? raw[0] : raw;
    if (!rows || rows.length === 0) throw new NotFoundException('Device not found');
  }

  private async deviceHasPunchHistory(deviceId: string, clientId: string): Promise<boolean> {
    const tables = ['mobile_attendance_punches', 'contractor_biometric_punches'];
    for (const table of tables) {
      if (!(await this.tableExists(table))) continue;
      const columns = await this.getTableColumns(table);
      const deviceCol = this.pickColumn(columns, 'device_id', 'deviceId');
      const clientCol = this.pickColumn(columns, 'client_id', 'clientId');
      if (!deviceCol || !clientCol) continue;

      const rows = await this.dataSource.query<Array<{ hasHistory: boolean }>>(
        `SELECT EXISTS (
           SELECT 1
             FROM ${this.quoteIdentifier(table)}
            WHERE ${this.quoteIdentifier(deviceCol)}::text = $1
              AND ${this.quoteIdentifier(clientCol)}::text = $2
         ) AS "hasHistory"`,
        [deviceId, clientId],
      );
      if (rows?.[0]?.hasHistory) return true;
    }
    return false;
  }

  private pickColumn(columns: Set<string>, ...names: string[]): string | null {
    return names.find((name) => columns.has(name)) ?? null;
  }

  private requireColumn(columns: Set<string>, ...names: string[]): string {
    const column = this.pickColumn(columns, ...names);
    if (!column) throw new NotFoundException(`Device column not found: ${names.join('/')}`);
    return column;
  }

  private deviceReturnProjection(alias: string): string {
    return `${alias}.id,
            COALESCE(to_jsonb(${alias})->>'clientId', to_jsonb(${alias})->>'client_id') AS "clientId",
            COALESCE(to_jsonb(${alias})->>'branchId', to_jsonb(${alias})->>'branch_id') AS "branchId",
            COALESCE(to_jsonb(${alias})->>'mode', 'KIOSK') AS "mode",
            COALESCE(to_jsonb(${alias})->>'installToken', to_jsonb(${alias})->>'install_token') AS "installToken",
            COALESCE(to_jsonb(${alias})->>'androidId', to_jsonb(${alias})->>'android_id') AS "androidId",
            COALESCE(
              to_jsonb(${alias})->>'deviceName',
              to_jsonb(${alias})->>'device_name',
              to_jsonb(${alias})->>'deviceLabel',
              to_jsonb(${alias})->>'device_label'
            ) AS "deviceName",
            ${this.deviceIsActiveExpression(alias)} AS "isActive",
            COALESCE(to_jsonb(${alias})->>'lastSeenAt', to_jsonb(${alias})->>'last_seen_at') AS "lastSeenAt",
            COALESCE(to_jsonb(${alias})->>'revokedAt', to_jsonb(${alias})->>'revoked_at') AS "revokedAt",
            COALESCE(to_jsonb(${alias})->>'revokedBy', to_jsonb(${alias})->>'revoked_by') AS "revokedBy",
            COALESCE(to_jsonb(${alias})->>'createdAt', to_jsonb(${alias})->>'created_at', to_jsonb(${alias})->>'registeredAt', to_jsonb(${alias})->>'registered_at') AS "createdAt",
            COALESCE(to_jsonb(${alias})->>'geofenceLat', to_jsonb(${alias})->>'geofence_lat') AS "geofenceLat",
            COALESCE(to_jsonb(${alias})->>'geofenceLng', to_jsonb(${alias})->>'geofence_lng') AS "geofenceLng",
            COALESCE(to_jsonb(${alias})->>'geofenceRadiusM', to_jsonb(${alias})->>'geofence_radius_m') AS "geofenceRadiusM"`;
  }

  private deviceIsActiveExpression(alias: string): string {
    return `COALESCE((to_jsonb(${alias})->>'isActive')::boolean, (to_jsonb(${alias})->>'is_active')::boolean, true)`;
  }

  private deviceCreatedAtOrderExpression(alias: string): string {
    return `COALESCE(
            NULLIF(to_jsonb(${alias})->>'createdAt', '')::timestamptz,
            NULLIF(to_jsonb(${alias})->>'created_at', '')::timestamptz,
            NULLIF(to_jsonb(${alias})->>'registeredAt', '')::timestamptz,
            NULLIF(to_jsonb(${alias})->>'registered_at', '')::timestamptz
          )`;
  }

  private quoteIdentifier(identifier: string): string {
    return `"${identifier.replace(/"/g, '""')}"`;
  }

  private isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    );
  }

  static readonly GEOFENCE_RADIUS_MIN_M = 50;
  static readonly GEOFENCE_RADIUS_MAX_M = 50_000;

  private validateGeofenceRange(lat: number, lng: number, radiusM: number): void {
    if (lat < -90 || lat > 90) throw new ConflictException('Latitude must be between -90 and 90');
    if (lng < -180 || lng > 180) throw new ConflictException('Longitude must be between -180 and 180');
    if (
      !Number.isInteger(radiusM) ||
      radiusM < DeviceService.GEOFENCE_RADIUS_MIN_M ||
      radiusM > DeviceService.GEOFENCE_RADIUS_MAX_M
    ) {
      throw new ConflictException(
        `Geofence radius must be between ${DeviceService.GEOFENCE_RADIUS_MIN_M}m and ${DeviceService.GEOFENCE_RADIUS_MAX_M}m`,
      );
    }
  }

  async configureGeofence(
    deviceId: string,
    clientId: string,
    params: { lat: number; lng: number; radiusM: number } | null,
  ): Promise<MobileAttendanceDeviceEntity> {
    const device = await this.deviceRepo.findOne({ where: { id: deviceId, clientId } });
    if (!device) throw new NotFoundException('Device not found');

    if (params === null) {
      device.geofenceLat = null;
      device.geofenceLng = null;
      device.geofenceRadiusM = null;
    } else {
      const { lat, lng, radiusM } = params;
      this.validateGeofenceRange(lat, lng, radiusM);
      device.geofenceLat = String(lat);
      device.geofenceLng = String(lng);
      device.geofenceRadiusM = radiusM;
    }

    return this.deviceRepo.save(device);
  }
}
