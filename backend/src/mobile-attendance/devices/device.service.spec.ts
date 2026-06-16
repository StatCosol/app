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
      expect.stringContaining('device_name AS "deviceLabel"'),
      ['client-1'],
    );
    const sql = query.mock.calls[0][0] as string;
    expect(sql).toContain('created_at AS "registeredAt"');
    expect(sql).toContain('last_seen_at AS "lastSeenAt"');
    expect(sql).toContain('is_active AS "isActive"');
    expect(sql).toContain('FROM mobile_attendance_devices');
  });

  it('scopes devices to the user branches when branch IDs are supplied', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const service = makeService(query);

    await service.listByClient('client-1', ['branch-1']);

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('branch_id = ANY($2::uuid[])'),
      ['client-1', ['branch-1']],
    );
  });
});
