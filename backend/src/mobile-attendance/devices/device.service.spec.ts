import { DeviceService } from './device.service';

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
