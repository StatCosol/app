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
      expect.stringContaining('branch_id = ANY($2::uuid[])'),
      ['client-1', ['branch-1']],
    );
  });
});
