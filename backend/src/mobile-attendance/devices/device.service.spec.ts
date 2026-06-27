import { DeviceService } from './device.service';

describe('DeviceService.provisionDevice', () => {
  function makeService(query: jest.Mock) {
    return new DeviceService({ create: jest.fn(), save: jest.fn() } as any, { query } as any);
  }

  it('provisions devices with schema-compatible raw SQL', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        { column_name: 'id' },
        { column_name: 'client_id' },
        { column_name: 'branch_id' },
        { column_name: 'mode' },
        { column_name: 'install_token' },
        { column_name: 'device_label' },
        { column_name: 'is_active' },
        { column_name: 'registered_at' },
        { column_name: 'registered_by' },
      ])
      .mockResolvedValueOnce([
        {
          id: 'device-1',
          clientId: 'client-1',
          branchId: 'branch-1',
          mode: 'KIOSK',
          installToken: 'token',
          deviceName: 'Gate',
          isActive: true,
        },
      ]);
    const service = makeService(query);

    await service.provisionDevice(
      'client-1',
      'KIOSK',
      'branch-1',
      'Gate',
      '00000000-0000-4000-8000-000000000001',
    );

    const sql = query.mock.calls[1][0] as string;
    expect(sql).toContain('INSERT INTO mobile_attendance_devices');
    expect(sql).toContain('"device_label"');
    expect(sql).toContain('"registered_at"');
    expect(sql).not.toContain('"device_name"');
  });
});

describe('DeviceService.registerDevice', () => {
  function makeService(query: jest.Mock, transaction: jest.Mock) {
    return new DeviceService({} as any, { query, transaction } as any);
  }

  it('registers devices without relying on TypeORM entity columns', async () => {
    const query = jest.fn().mockResolvedValueOnce([
      { column_name: 'id' },
      { column_name: 'install_token' },
      { column_name: 'android_id' },
      { column_name: 'device_label' },
      { column_name: 'last_seen_at' },
      { column_name: 'is_active' },
    ]);
    const txQuery = jest
      .fn()
      .mockResolvedValueOnce([{ id: 'device-1', installToken: 'token', isActive: true }])
      .mockResolvedValueOnce([{ id: 'device-1', installToken: 'token', isActive: true }]);
    const transaction = jest.fn(async (cb) => cb({ query: txQuery }));
    const service = makeService(query, transaction);

    await service.registerDevice('token', 'android-1', 'Tablet');

    expect(txQuery.mock.calls[0][0]).toContain('FOR UPDATE');
    const updateSql = txQuery.mock.calls[1][0] as string;
    expect(updateSql).toContain('"android_id" = $2');
    expect(updateSql).toContain('"device_label" = $3');
    expect(updateSql).toContain('"last_seen_at" = now()');
  });
});

describe('DeviceService.listByClient', () => {
  function makeService(query: jest.Mock) {
    return new DeviceService({} as any, { query } as any);
  }

  it('returns frontend-compatible device fields without relying on entity selects', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const service = makeService(query);

    await service.listByClient('client-1');

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(`to_jsonb(d)->>'device_name'`),
      ['client-1'],
    );
    const sql = query.mock.calls[0][0] as string;
    expect(sql).toContain(`to_jsonb(d)->>'clientId'`);
    expect(sql).toContain(`to_jsonb(d)->>'client_id'`);
    expect(sql).toContain(`to_jsonb(d)->>'branchId'`);
    expect(sql).toContain(`to_jsonb(d)->>'branch_id'`);
    expect(sql).toContain(`to_jsonb(d)->>'device_label'`);
    expect(sql).toContain(`to_jsonb(d)->>'created_at'`);
    expect(sql).toContain(`to_jsonb(d)->>'last_seen_at'`);
    expect(sql).toContain(`to_jsonb(d)->>'is_active'`);
    expect(sql).toContain(`to_jsonb(d)->>'deleted_at'`);
    expect(sql).toContain('FROM mobile_attendance_devices d');
  });

  it('scopes devices to the user branches when branch IDs are supplied', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const service = makeService(query);

    await service.listByClient('client-1', ['branch-1']);

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(`COALESCE(to_jsonb(d)->>'branchId', to_jsonb(d)->>'branch_id') = ANY($2::text[])`),
      ['client-1', ['branch-1']],
    );
  });

  it('omits install tokens when caller only needs kiosk selection metadata', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const service = makeService(query);

    await service.listByClient('client-1', [], false);

    const sql = query.mock.calls[0][0] as string;
    expect(sql).toContain('NULL::varchar AS "installToken"');
    expect(sql).not.toContain('d.install_token    AS "installToken"');
  });
});

describe('DeviceService.revokeDevice', () => {
  function makeService(query: jest.Mock) {
    return new DeviceService({} as any, { query } as any);
  }

  it('revokes devices using snake_case columns without entity selects', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        { column_name: 'id' },
        { column_name: 'client_id' },
        { column_name: 'is_active' },
        { column_name: 'revoked_at' },
        { column_name: 'revoked_by' },
      ])
      .mockResolvedValueOnce([{ id: 'device-1' }]);
    const service = makeService(query);

    await service.revokeDevice(
      'client-1',
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
    );

    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('"is_active" = false'),
      [
        '00000000-0000-4000-8000-000000000001',
        'client-1',
        '00000000-0000-4000-8000-000000000002',
      ],
    );
    const sql = query.mock.calls[1][0] as string;
    expect(sql).toContain('"revoked_at" = now()');
    expect(sql).toContain('"revoked_by" = $3::uuid');
    expect(sql).toContain(`to_jsonb(mobile_attendance_devices)->>'client_id'`);
  });

  it('falls back to camelCase device columns', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        { column_name: 'id' },
        { column_name: 'clientId' },
        { column_name: 'isActive' },
        { column_name: 'revokedAt' },
      ])
      .mockResolvedValueOnce([{ id: 'device-1' }]);
    const service = makeService(query);

    await service.revokeDevice(
      'client-1',
      '00000000-0000-4000-8000-000000000001',
      'system:kiosk',
    );

    const sql = query.mock.calls[1][0] as string;
    expect(sql).toContain('"isActive" = false');
    expect(sql).toContain('"revokedAt" = now()');
    expect(sql).not.toContain('revoked_by');
    expect(sql).not.toContain('revokedBy');
    expect(query.mock.calls[1][1]).toEqual([
      '00000000-0000-4000-8000-000000000001',
      'client-1',
    ]);
  });
});

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
      .mockResolvedValueOnce([
        { column_name: 'id' },
        { column_name: 'client_id' },
        { column_name: 'branch_id' },
        { column_name: 'is_active' },
      ])
      .mockResolvedValueOnce([{ id: deviceId }])
      .mockResolvedValueOnce([{ exists: true }])
      .mockResolvedValueOnce([
        { column_name: 'device_id' },
        { column_name: 'client_id' },
        { column_name: 'status' },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ exists: true }])
      .mockResolvedValueOnce([
        { column_name: 'device_id' },
        { column_name: 'client_id' },
      ])
      .mockResolvedValueOnce([{ hasHistory: false }])
      .mockResolvedValueOnce([{ exists: true }])
      .mockResolvedValueOnce([
        { column_name: 'device_id' },
        { column_name: 'client_id' },
      ])
      .mockResolvedValueOnce([{ hasHistory: false }]);
    const txQuery = jest.fn().mockResolvedValueOnce([{ id: deviceId }]);
    const transaction = jest.fn(async (cb) => cb({ query: txQuery }));
    const service = makeService(query, transaction);

    await expect(
      service.permanentlyDeleteDevice(clientId, deviceId, ['branch-1']),
    ).resolves.toEqual({
      ok: true,
      id: deviceId,
    });

    expect(query.mock.calls[1][0]).toContain(`COALESCE((to_jsonb(d)->>'is_active')::boolean, true) = false`);
    expect(query.mock.calls[1][0]).toContain(
      `COALESCE(to_jsonb(d)->>'branchId', to_jsonb(d)->>'branch_id') = ANY($3::text[])`,
    );
    const ticketDelete = findSqlCall(query, 'DELETE FROM kiosk_enroll_tickets');
    expect(ticketDelete[0]).toContain(`"device_id"::text = $1`);
    expect(ticketDelete[0]).toContain(`"client_id"::text = $2`);
    expect(ticketDelete[0]).toContain(`COALESCE(to_jsonb(k)->>'status', '') <> 'COMPLETED'`);
    expect(ticketDelete[0]).not.toContain(`status IN`);
    expect(ticketDelete[1]).toEqual([deviceId, clientId]);
    expect(txQuery).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('DELETE FROM mobile_attendance_devices'),
      [deviceId, clientId, ['branch-1']],
    );
    expect(txQuery.mock.calls[0][0]).toContain(
      `COALESCE(to_jsonb(d)->>'branchId', to_jsonb(d)->>'branch_id') = ANY($3::text[])`,
    );
  });

  it('cleans stale kiosk tickets before soft-hiding history devices', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        { column_name: 'id' },
        { column_name: 'client_id' },
        { column_name: 'is_active' },
        { column_name: 'deleted_at' },
      ])
      .mockResolvedValueOnce([{ id: deviceId }])
      .mockResolvedValueOnce([{ exists: true }])
      .mockResolvedValueOnce([
        { column_name: 'device_id' },
        { column_name: 'client_id' },
        { column_name: 'status' },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ exists: true }])
      .mockResolvedValueOnce([
        { column_name: 'device_id' },
        { column_name: 'client_id' },
      ])
      .mockResolvedValueOnce([{ hasHistory: true }])
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
      .mockResolvedValueOnce([
        { column_name: 'id' },
        { column_name: 'client_id' },
        { column_name: 'branch_id' },
        { column_name: 'is_active' },
      ])
      .mockResolvedValueOnce([]);
    const transaction = jest.fn();
    const service = makeService(query, transaction);

    await expect(
      service.permanentlyDeleteDevice(clientId, deviceId, ['branch-1']),
    ).rejects.toThrow('Revoke the device before deleting it');

    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining(
        `COALESCE(to_jsonb(d)->>'branchId', to_jsonb(d)->>'branch_id') = ANY($3::text[])`,
      ),
      [deviceId, clientId, ['branch-1']],
    );
    expect(transaction).not.toHaveBeenCalled();
  });

  it('requires the device to be revoked before permanent delete', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        { column_name: 'id' },
        { column_name: 'client_id' },
        { column_name: 'is_active' },
      ])
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
      .mockResolvedValueOnce([
        { column_name: 'id' },
        { column_name: 'client_id' },
        { column_name: 'is_active' },
      ])
      .mockResolvedValueOnce([{ id: deviceId }])
      .mockResolvedValueOnce([{ exists: true }])
      .mockResolvedValueOnce([
        { column_name: 'device_id' },
        { column_name: 'client_id' },
        { column_name: 'status' },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ exists: true }])
      .mockResolvedValueOnce([
        { column_name: 'device_id' },
        { column_name: 'client_id' },
      ])
      .mockResolvedValueOnce([{ hasHistory: true }])
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
      .mockResolvedValueOnce([
        { column_name: 'id' },
        { column_name: 'client_id' },
        { column_name: 'is_active' },
      ])
      .mockResolvedValueOnce([{ id: deviceId }])
      .mockResolvedValueOnce([{ exists: true }])
      .mockResolvedValueOnce([
        { column_name: 'device_id' },
        { column_name: 'client_id' },
        { column_name: 'status' },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ exists: true }])
      .mockResolvedValueOnce([
        { column_name: 'device_id' },
        { column_name: 'client_id' },
      ])
      .mockResolvedValueOnce([{ hasHistory: false }])
      .mockResolvedValueOnce([{ exists: true }])
      .mockResolvedValueOnce([
        { column_name: 'device_id' },
        { column_name: 'client_id' },
      ])
      .mockResolvedValueOnce([{ hasHistory: false }])
      .mockResolvedValueOnce([
        { column_name: 'id' },
        { column_name: 'client_id' },
        { column_name: 'is_active' },
        { column_name: 'deleted_at' },
      ])
      .mockResolvedValueOnce([{ id: deviceId }]);
    const txQuery = jest.fn().mockRejectedValueOnce({ code: '23503' });
    const transaction = jest.fn(async (cb) => cb({ query: txQuery }));
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
      .mockResolvedValueOnce([
        { column_name: 'id' },
        { column_name: 'clientId' },
        { column_name: 'isActive' },
      ])
      .mockResolvedValueOnce([{ id: deviceId }])
      .mockResolvedValueOnce([{ exists: true }])
      .mockResolvedValueOnce([
        { column_name: 'deviceId' },
        { column_name: 'clientId' },
        { column_name: 'status' },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ exists: true }])
      .mockResolvedValueOnce([
        { column_name: 'deviceId' },
        { column_name: 'clientId' },
      ])
      .mockResolvedValueOnce([{ hasHistory: true }])
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
