import { DeviceService } from './device.service';

// ─── provisionDevice ─────────────────────────────────────────────────────────

describe('DeviceService.provisionDevice', () => {
  function makeService() {
    const deviceRepo = {
      create: jest.fn((data: any) => ({ ...data })),
      save: jest.fn(async (device: any) => ({ ...device, id: 'device-1' })),
    };
    return { service: new DeviceService(deviceRepo as any, { query: jest.fn() } as any), deviceRepo };
  }

  it('creates a device via TypeORM with the correct fields', async () => {
    const { service, deviceRepo } = makeService();
    const result = await service.provisionDevice('client-1', 'KIOSK', 'branch-1', 'Gate', 'user-1');
    expect(deviceRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: 'client-1',
        mode: 'KIOSK',
        branchId: 'branch-1',
        deviceName: 'Gate',
        isActive: true,
      }),
    );
    expect(deviceRepo.save).toHaveBeenCalled();
    expect(result.id).toBe('device-1');
  });
});

// ─── registerDevice ──────────────────────────────────────────────────────────

describe('DeviceService.registerDevice', () => {
  function makeService(query: jest.Mock, transaction: jest.Mock) {
    return new DeviceService({} as any, { query, transaction } as any);
  }

  it('registers devices without relying on TypeORM entity columns', async () => {
    // query mock: column introspection happens via this.dataSource.query (outside tx)
    const query = jest.fn().mockResolvedValueOnce([
      { column_name: 'id' },
      { column_name: 'install_token' },
      { column_name: 'android_id' },
      { column_name: 'device_label' },
      { column_name: 'last_seen_at' },
      { column_name: 'is_active' },
    ]);
    // txQuery calls inside the transaction:
    //   [0] FOR UPDATE select
    //   [1] conflict check (no conflict → empty)
    //   [2] UPDATE SET android_id, device_label, last_seen_at
    const txQuery = jest.fn()
      .mockResolvedValueOnce([{ id: 'device-1', installToken: 'token', isActive: true }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const transaction = jest.fn(async (cb: any) => cb({ query: txQuery }));
    const service = makeService(query, transaction);

    await service.registerDevice('token', 'android-1', 'Tablet');

    expect(txQuery.mock.calls[0][0]).toContain('FOR UPDATE');
    const updateSql = txQuery.mock.calls[2][0] as string;
    expect(updateSql).toContain('"android_id" = $2');
    expect(updateSql).toContain('"device_label" = $3');
    expect(updateSql).toContain('"last_seen_at" = now()');
  });
});

// ─── listByClient ─────────────────────────────────────────────────────────────

describe('DeviceService.listByClient', () => {
  function makeService(query: jest.Mock) {
    return new DeviceService({} as any, { query } as any);
  }

  it('returns frontend-compatible device fields using direct column names', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const service = makeService(query);

    await service.listByClient('client-1');

    const sql = query.mock.calls[0][0] as string;
    expect(sql).toContain('d.device_name');
    expect(sql).toContain('d.client_id');
    expect(sql).toContain('d.branch_id');
    expect(sql).toContain('d.is_active');
    expect(sql).toContain('d.deleted_at IS NULL');
    expect(sql).toContain('FROM mobile_attendance_devices d');
    expect(query.mock.calls[0][1]).toEqual(['client-1']);
  });

  it('scopes devices to supplied branch IDs', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const service = makeService(query);

    await service.listByClient('client-1', ['branch-1']);

    const sql = query.mock.calls[0][0] as string;
    expect(sql).toContain('d.branch_id = ANY($2::uuid[])');
    expect(query.mock.calls[0][1]).toEqual(['client-1', ['branch-1']]);
  });
});

// ─── revokeDevice ─────────────────────────────────────────────────────────────

describe('DeviceService.revokeDevice', () => {
  function makeService() {
    const deviceRepo = {
      findOne: jest.fn(),
      save: jest.fn(async (d: any) => d),
    };
    return { service: new DeviceService(deviceRepo as any, {} as any), deviceRepo };
  }

  it('sets isActive=false and records revocation details for a UUID actor', async () => {
    const { service, deviceRepo } = makeService();
    const device: any = { id: 'dev-1', clientId: 'client-1', isActive: true, revokedAt: null, revokedBy: null };
    deviceRepo.findOne.mockResolvedValue(device);

    await service.revokeDevice('client-1', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002');

    expect(device.isActive).toBe(false);
    expect(device.revokedAt).toBeInstanceOf(Date);
    expect(device.revokedBy).toBe('00000000-0000-4000-8000-000000000002');
    expect(deviceRepo.save).toHaveBeenCalledWith(device);
  });

  it('omits revokedBy when the actor identifier is not a valid UUID', async () => {
    const { service, deviceRepo } = makeService();
    const device: any = { id: 'dev-1', clientId: 'client-1', isActive: true, revokedAt: null, revokedBy: null };
    deviceRepo.findOne.mockResolvedValue(device);

    await service.revokeDevice('client-1', '00000000-0000-4000-8000-000000000001', 'system:kiosk');

    expect(device.isActive).toBe(false);
    expect(device.revokedAt).toBeInstanceOf(Date);
    expect(device.revokedBy).toBeNull();
  });
});

// ─── permanentlyDeleteDevice ──────────────────────────────────────────────────

describe('DeviceService.permanentlyDeleteDevice', () => {
  const deviceId = '00000000-0000-4000-8000-000000000001';
  const clientId = '00000000-0000-4000-8000-000000000002';

  function makeService(query: jest.Mock, transaction: jest.Mock) {
    return new DeviceService({} as any, { query, transaction } as any);
  }

  function findSqlCall(query: jest.Mock, text: string) {
    const call = query.mock.calls.find(([sql]) => String(sql).includes(text));
    expect(call).toBeDefined();
    return call!;
  }

  it('deletes a revoked device and clears stale kiosk tickets first', async () => {
    const query = jest
      .fn()
      // 1. device existence (is_active = false) → found
      .mockResolvedValueOnce([{ id: deviceId }])
      // 2. tableExists(kiosk_enroll_tickets)
      .mockResolvedValueOnce([{ exists: true }])
      // 3. getTableColumns(kiosk_enroll_tickets)
      .mockResolvedValueOnce([
        { column_name: 'device_id' },
        { column_name: 'client_id' },
        { column_name: 'status' },
      ])
      // 4. DELETE kiosk tickets
      .mockResolvedValueOnce([])
      // 5. tableExists(mobile_attendance_punches)
      .mockResolvedValueOnce([{ exists: true }])
      // 6. getTableColumns(mobile_attendance_punches)
      .mockResolvedValueOnce([{ column_name: 'device_id' }, { column_name: 'client_id' }])
      // 7. hasHistory check (punches)
      .mockResolvedValueOnce([{ hasHistory: false }])
      // 8. tableExists(contractor_biometric_punches)
      .mockResolvedValueOnce([{ exists: true }])
      // 9. getTableColumns(contractor_biometric_punches)
      .mockResolvedValueOnce([{ column_name: 'device_id' }, { column_name: 'client_id' }])
      // 10. hasHistory check (contractor punches)
      .mockResolvedValueOnce([{ hasHistory: false }]);
    const txQuery = jest.fn().mockResolvedValueOnce([{ id: deviceId }]);
    const transaction = jest.fn(async (cb: any) => cb({ query: txQuery }));
    const service = makeService(query, transaction);

    await expect(
      service.permanentlyDeleteDevice(clientId, deviceId, ['branch-1']),
    ).resolves.toEqual({ ok: true, id: deviceId });

    // Device existence query uses is_active filter and branch scope
    const [existenceSql, existenceParams] = query.mock.calls[0];
    expect(existenceSql).toContain('AND d.is_active = false');
    expect(existenceSql).toContain('AND d.branch_id = ANY($3::uuid[])');
    expect(existenceParams).toEqual([deviceId, clientId, ['branch-1']]);

    // Kiosk ticket cleanup
    const ticketDelete = findSqlCall(query, 'DELETE FROM kiosk_enroll_tickets');
    expect(ticketDelete[0]).toContain('"device_id"::text = $1');
    expect(ticketDelete[0]).toContain('"client_id"::text = $2');
    expect(ticketDelete[0]).toContain(`COALESCE(to_jsonb(k)->>'status', '') <> 'COMPLETED'`);
    expect(ticketDelete[1]).toEqual([deviceId, clientId]);

    // Physical DELETE via transaction with branch scope
    expect(txQuery).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM mobile_attendance_devices'),
      [deviceId, clientId, ['branch-1']],
    );
  });

  it('cleans stale kiosk tickets before soft-hiding history devices', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ id: deviceId }])
      .mockResolvedValueOnce([{ exists: true }])
      .mockResolvedValueOnce([
        { column_name: 'device_id' },
        { column_name: 'client_id' },
        { column_name: 'status' },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ exists: true }])
      .mockResolvedValueOnce([{ column_name: 'device_id' }, { column_name: 'client_id' }])
      .mockResolvedValueOnce([{ hasHistory: true }])
      // softDeleteDeviceRow: getTableColumns(devices) + UPDATE
      .mockResolvedValueOnce([
        { column_name: 'id' },
        { column_name: 'client_id' },
        { column_name: 'is_active' },
        { column_name: 'deleted_at' },
      ])
      .mockResolvedValueOnce([{ id: deviceId }]);
    const transaction = jest.fn();
    const service = makeService(query, transaction);

    await expect(service.permanentlyDeleteDevice(clientId, deviceId)).resolves.toEqual({
      ok: true,
      id: deviceId,
    });
    expect(findSqlCall(query, 'DELETE FROM kiosk_enroll_tickets')[1]).toEqual([deviceId, clientId]);
    expect(findSqlCall(query, 'UPDATE mobile_attendance_devices')[0]).toContain('"deleted_at" = now()');
    expect(transaction).not.toHaveBeenCalled();
  });

  it('honors branch scope for permanent deletes', async () => {
    const query = jest
      .fn()
      // Device not found with is_active=false under this branch → ConflictException
      .mockResolvedValueOnce([]);
    const transaction = jest.fn();
    const service = makeService(query, transaction);

    await expect(
      service.permanentlyDeleteDevice(clientId, deviceId, ['branch-1']),
    ).rejects.toThrow('Revoke the device before deleting it');

    const [existenceSql, existenceParams] = query.mock.calls[0];
    expect(existenceSql).toContain('AND d.branch_id = ANY($3::uuid[])');
    expect(existenceParams).toEqual([deviceId, clientId, ['branch-1']]);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('requires the device to be revoked before permanent delete', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([]);
    const transaction = jest.fn();
    const service = makeService(query, transaction);

    await expect(service.permanentlyDeleteDevice(clientId, deviceId)).rejects.toThrow(
      'Revoke the device before deleting it',
    );
    expect(transaction).not.toHaveBeenCalled();
  });

  it('soft-hides revoked devices when attendance history prevents physical deletion', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ id: deviceId }])
      .mockResolvedValueOnce([{ exists: true }])
      .mockResolvedValueOnce([
        { column_name: 'device_id' },
        { column_name: 'client_id' },
        { column_name: 'status' },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ exists: true }])
      .mockResolvedValueOnce([{ column_name: 'device_id' }, { column_name: 'client_id' }])
      .mockResolvedValueOnce([{ hasHistory: true }])
      // softDeleteDeviceRow
      .mockResolvedValueOnce([
        { column_name: 'id' },
        { column_name: 'client_id' },
        { column_name: 'is_active' },
        { column_name: 'deleted_at' },
      ])
      .mockResolvedValueOnce([{ id: deviceId }]);
    const transaction = jest.fn();
    const service = makeService(query, transaction);

    await expect(service.permanentlyDeleteDevice(clientId, deviceId)).resolves.toEqual({
      ok: true,
      id: deviceId,
    });
    const historySql = findSqlCall(query, 'FROM "mobile_attendance_punches"')[0] as string;
    expect(historySql).toContain('mobile_attendance_punches');
    expect(historySql).not.toContain('contractor_biometric_punches');
    expect(findSqlCall(query, 'UPDATE mobile_attendance_devices')[0]).toContain('"deleted_at" = now()');
    expect(transaction).not.toHaveBeenCalled();
  });

  it('soft-hides revoked devices when physical delete hits a foreign key', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ id: deviceId }])
      .mockResolvedValueOnce([{ exists: true }])
      .mockResolvedValueOnce([{ column_name: 'device_id' }, { column_name: 'client_id' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ exists: true }])
      .mockResolvedValueOnce([{ column_name: 'device_id' }, { column_name: 'client_id' }])
      .mockResolvedValueOnce([{ hasHistory: false }])
      .mockResolvedValueOnce([{ exists: true }])
      .mockResolvedValueOnce([{ column_name: 'device_id' }, { column_name: 'client_id' }])
      .mockResolvedValueOnce([{ hasHistory: false }])
      // softDeleteDeviceRow after FK error
      .mockResolvedValueOnce([
        { column_name: 'id' },
        { column_name: 'client_id' },
        { column_name: 'is_active' },
        { column_name: 'deleted_at' },
      ])
      .mockResolvedValueOnce([{ id: deviceId }]);
    const txQuery = jest.fn().mockRejectedValueOnce({ code: '23503' });
    const transaction = jest.fn(async (cb: any) => cb({ query: txQuery }));
    const service = makeService(query, transaction);

    await expect(service.permanentlyDeleteDevice(clientId, deviceId)).resolves.toEqual({
      ok: true,
      id: deviceId,
    });
    expect(findSqlCall(query, 'UPDATE mobile_attendance_devices')[0]).toContain('"deleted_at" = now()');
  });

  it('supports camelCase legacy columns while hiding revoked devices', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ id: deviceId }])
      .mockResolvedValueOnce([{ exists: true }])
      .mockResolvedValueOnce([
        { column_name: 'deviceId' },
        { column_name: 'clientId' },
        { column_name: 'status' },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ exists: true }])
      .mockResolvedValueOnce([{ column_name: 'deviceId' }, { column_name: 'clientId' }])
      .mockResolvedValueOnce([{ hasHistory: true }])
      // softDeleteDeviceRow with camelCase columns
      .mockResolvedValueOnce([
        { column_name: 'id' },
        { column_name: 'clientId' },
        { column_name: 'isActive' },
        { column_name: 'deletedAt' },
      ])
      .mockResolvedValueOnce([{ id: deviceId }]);
    const transaction = jest.fn();
    const service = makeService(query, transaction);

    await expect(service.permanentlyDeleteDevice(clientId, deviceId)).resolves.toEqual({
      ok: true,
      id: deviceId,
    });

    expect(findSqlCall(query, 'DELETE FROM kiosk_enroll_tickets')[0]).toContain('"deviceId"::text = $1');
    expect(findSqlCall(query, 'FROM "mobile_attendance_punches"')[0]).toContain('"clientId"::text = $2');
    const softDeleteSql = findSqlCall(query, 'UPDATE mobile_attendance_devices')[0] as string;
    expect(softDeleteSql).toContain('"deletedAt" = now()');
    expect(softDeleteSql).toContain('"isActive" = false');
    expect(transaction).not.toHaveBeenCalled();
  });
});
