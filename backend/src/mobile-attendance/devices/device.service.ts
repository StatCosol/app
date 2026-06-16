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
    const columns = await this.getDeviceColumns();
    const clientCol = this.requireColumn(columns, 'client_id', 'clientId');
    const modeCol = this.requireColumn(columns, 'mode');
    const tokenCol = this.requireColumn(columns, 'install_token', 'installToken');
    const branchCol = this.pickColumn(columns, 'branch_id', 'branchId');
    const nameCol = this.pickColumn(columns, 'device_name', 'deviceName', 'device_label', 'deviceLabel');
    const isActiveCol = this.pickColumn(columns, 'is_active', 'isActive');
    const createdByCol = this.pickColumn(columns, 'created_by', 'createdBy', 'registered_by', 'registeredBy');
    const createdAtCol = this.pickColumn(columns, 'created_at', 'createdAt', 'registered_at', 'registeredAt');
    const insertColumns = [clientCol, modeCol, tokenCol];
    const params: unknown[] = [clientId, mode, installToken];

    if (branchCol) {
      insertColumns.push(branchCol);
      params.push(branchId);
    }
    if (nameCol) {
      insertColumns.push(nameCol);
      params.push(deviceLabel);
    }
    if (isActiveCol) {
      insertColumns.push(isActiveCol);
      params.push(true);
    }
    if (createdByCol && this.isUuid(createdBy)) {
      insertColumns.push(createdByCol);
      params.push(createdBy);
    }
    if (createdAtCol) {
      insertColumns.push(createdAtCol);
      params.push(new Date());
    }

    const result = await this.dataSource.query<MobileAttendanceDeviceEntity[]>(
      `WITH inserted AS (
         INSERT INTO mobile_attendance_devices (${insertColumns.map((col) => this.quoteIdentifier(col)).join(', ')})
         VALUES (${params.map((_, idx) => `$${idx + 1}`).join(', ')})
         RETURNING *
       )
       SELECT ${this.deviceReturnProjection('d')}
         FROM inserted d`,
      params,
    );

    if (!result?.[0]) throw new ConflictException('Device could not be provisioned');
    return result[0];
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
      const columns = await this.getDeviceColumns();
      const tokenCol = this.requireColumn(columns, 'install_token', 'installToken');
      const androidCol = this.pickColumn(columns, 'android_id', 'androidId');
      const nameCol = this.pickColumn(columns, 'device_name', 'deviceName', 'device_label', 'deviceLabel');
      const lastSeenCol = this.pickColumn(columns, 'last_seen_at', 'lastSeenAt');
      const rows = await em.query<MobileAttendanceDeviceEntity[]>(
        `SELECT ${this.deviceReturnProjection('d')}
           FROM mobile_attendance_devices d
          WHERE to_jsonb(d)->>${this.sqlString(tokenCol)} = $1
          FOR UPDATE`,
        [installToken],
      );
      const device = rows?.[0] ?? null;

      if (!device) throw new NotFoundException('Install token not found');
      if (!this.rowIsActive(device)) throw new UnauthorizedException('Device token revoked');

      if (device.androidId && androidId && device.androidId !== androidId) {
        throw new ConflictException('Install token already bound to a different device');
      }

      const assignments: string[] = [];
      const params: unknown[] = [installToken];
      if (androidCol && androidId) {
        params.push(androidId);
        assignments.push(`${this.quoteIdentifier(androidCol)} = $${params.length}`);
      }
      if (nameCol && deviceName) {
        params.push(deviceName);
        assignments.push(`${this.quoteIdentifier(nameCol)} = $${params.length}`);
      }
      if (lastSeenCol) assignments.push(`${this.quoteIdentifier(lastSeenCol)} = now()`);
      if (assignments.length === 0) return device;

      const updated = await em.query<MobileAttendanceDeviceEntity[]>(
        `WITH updated AS (
          UPDATE mobile_attendance_devices
            SET ${assignments.join(', ')}
          WHERE to_jsonb(mobile_attendance_devices)->>${this.sqlString(tokenCol)} = $1
            AND ${this.deviceIsActiveExpression('mobile_attendance_devices')}
          RETURNING *
        )
        SELECT ${this.deviceReturnProjection('d')}
          FROM updated d`,
        params,
      );
      if (!updated?.[0]) throw new UnauthorizedException('Device token revoked');
      return updated[0];
    });
  }

  async authenticateDevice(
    installToken: string,
    androidId?: string,
  ): Promise<MobileAttendanceDeviceEntity> {
    const columns = await this.getDeviceColumns();
    const tokenCol = this.requireColumn(columns, 'install_token', 'installToken');
    const lastSeenCol = this.pickColumn(columns, 'last_seen_at', 'lastSeenAt');
    const rows = await this.dataSource.query<MobileAttendanceDeviceEntity[]>(
      `SELECT ${this.deviceReturnProjection('d')}
         FROM mobile_attendance_devices d
        WHERE to_jsonb(d)->>${this.sqlString(tokenCol)} = $1
        LIMIT 1`,
      [installToken],
    );
    const device = rows?.[0] ?? null;
    if (!device || !this.rowIsActive(device)) throw new UnauthorizedException('Device not authorized');

    if (device.androidId && androidId && device.androidId !== androidId) {
      throw new UnauthorizedException('Device ID mismatch');
    }

    if (!lastSeenCol) return device;
    const updated = await this.dataSource.query<MobileAttendanceDeviceEntity[]>(
      `WITH updated AS (
        UPDATE mobile_attendance_devices
          SET ${this.quoteIdentifier(lastSeenCol)} = now()
        WHERE to_jsonb(mobile_attendance_devices)->>${this.sqlString(tokenCol)} = $1
        RETURNING *
      )
      SELECT ${this.deviceReturnProjection('d')}
        FROM updated d`,
      [installToken],
    );
    return updated?.[0] ?? device;
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

    await this.deleteNonCompletedKioskTickets(deviceId, clientId);

    if (await this.deviceHasPunchHistory(deviceId, clientId)) {
      await this.softDeleteDeviceRow(deviceId, clientId, params, branchFilter);
      return { ok: true, id: deviceId };
    }

    try {
      await this.dataSource.transaction(async (em) => {
        const result = await em.query<Array<{ id: string }>>(
          `DELETE FROM mobile_attendance_devices d
            WHERE d.id = $1::uuid
              AND COALESCE(to_jsonb(d)->>'clientId', to_jsonb(d)->>'client_id') = $2
              ${branchFilter}
            RETURNING d.id`,
          params,
        );
        if (!result || result.length === 0) throw new NotFoundException('Device not found');
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
         AND COALESCE(to_jsonb(d)->>'deletedAt', to_jsonb(d)->>'deleted_at') IS NULL
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
    await this.dataSource.query(
      `DELETE FROM kiosk_enroll_tickets k
        WHERE device_id = $1::uuid
          AND client_id = $2::uuid
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
    const columns = await this.getDeviceColumns();
    this.requireColumn(columns, 'deleted_at', 'deletedAt');
    const isActiveCol = this.pickColumn(columns, 'is_active', 'isActive');
    const assignments = ['deleted_at = now()'];
    if (isActiveCol) assignments.push(`${this.quoteIdentifier(isActiveCol)} = false`);

    const result = await this.dataSource.query<Array<{ id: string }>>(
      `UPDATE mobile_attendance_devices d
          SET ${assignments.join(', ')}
        WHERE d.id = $1::uuid
          AND COALESCE(to_jsonb(d)->>'clientId', to_jsonb(d)->>'client_id') = $2
          ${branchFilter}
        RETURNING d.id`,
      scopedParams,
    );

    if (!result || result.length === 0) throw new NotFoundException('Device not found');
  }

  private async deviceHasPunchHistory(deviceId: string, clientId: string): Promise<boolean> {
    const tables = ['mobile_attendance_punches', 'contractor_biometric_punches'];
    for (const table of tables) {
      if (!(await this.tableExists(table))) continue;
      const rows = await this.dataSource.query<Array<{ hasHistory: boolean }>>(
        `SELECT EXISTS (
           SELECT 1
             FROM ${this.quoteIdentifier(table)}
            WHERE device_id = $1::uuid
              AND client_id = $2::uuid
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
            COALESCE(to_jsonb(${alias})->>'createdAt', to_jsonb(${alias})->>'created_at', to_jsonb(${alias})->>'registeredAt', to_jsonb(${alias})->>'registered_at') AS "createdAt"`;
  }

  private deviceIsActiveExpression(alias: string): string {
    return `COALESCE((to_jsonb(${alias})->>'isActive')::boolean, (to_jsonb(${alias})->>'is_active')::boolean, true)`;
  }

  private rowIsActive(device: Pick<MobileAttendanceDeviceEntity, 'isActive'>): boolean {
    return device.isActive !== false;
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
