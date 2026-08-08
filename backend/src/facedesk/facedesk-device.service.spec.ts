import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { FaceDeskDeviceService } from './facedesk-device.service';

function makeService(row: any = null) {
  const repo = {
    findOne: jest.fn().mockResolvedValue(row),
    create: jest.fn((v: any) => v),
    save: jest.fn(async (v: any) => ({ deviceId: 'dev-1', ...v })),
    find: jest.fn().mockResolvedValue([]),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  return { service: new FaceDeskDeviceService(repo as any), repo };
}

describe('FaceDeskDeviceService', () => {
  it('provisions a device with a 64-hex install token', async () => {
    const { service } = makeService();
    const d = await service.provision('c1', {
      deviceName: 'Gate 1',
      branchId: 'b1',
      adminPin: '1234',
    });
    expect(d.installToken).toMatch(/^[0-9a-f]{64}$/);
    expect(d.deviceStatus).toBe('PROVISIONED');
    expect(d.clientId).toBe('c1');
  });

  it('requires an admin PIN at provision time', async () => {
    const { service } = makeService();
    await expect(
      service.provision('c1', { deviceName: 'Gate 1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('registers a device and returns a rotated device token', async () => {
    const { service, repo } = makeService({
      deviceId: 'dev-1',
      installToken: 'tok',
      deviceStatus: 'PROVISIONED',
      clientId: 'c1',
      branchId: 'b1',
      mode: 'ATTENDANCE',
      androidId: null,
    });
    const res = await service.register('tok', 'android-xyz');
    expect(res).toEqual(
      expect.objectContaining({
        clientId: 'c1',
        branchId: 'b1',
      }),
    );
    expect(res.deviceToken).toMatch(/^[0-9a-f]{64}$/);
    expect(res.deviceToken).not.toBe('tok');
    expect(repo.save).toHaveBeenCalled();
  });

  it('rejects registration when bound to a different android id', async () => {
    const { service } = makeService({
      installToken: 'tok',
      deviceStatus: 'ONLINE',
      androidId: 'android-A',
    });
    await expect(service.register('tok', 'android-B')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('authenticates a valid device to a context', async () => {
    const { service } = makeService({
      deviceId: 'dev-1',
      installToken: 'tok',
      deviceStatus: 'ONLINE',
      clientId: 'c1',
      branchId: 'b1',
      mode: 'ATTENDANCE',
      androidId: 'android-xyz',
    });
    const ctx = await service.authenticate('tok', 'android-xyz');
    expect(ctx).toEqual({
      deviceId: 'dev-1',
      clientId: 'c1',
      branchId: 'b1',
      mode: 'ATTENDANCE',
    });
  });

  it('rejects a revoked device', async () => {
    const { service } = makeService({
      installToken: 'tok',
      deviceStatus: 'REVOKED',
    });
    await expect(service.authenticate('tok')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('lists only credential-free device fields for allowed branches', async () => {
    const { service, repo } = makeService();

    await service.list('c1', ['b1', 'b2']);

    expect(repo.find).toHaveBeenCalledWith({
      select: {
        deviceId: true,
        deviceName: true,
        branchId: true,
        location: true,
        deviceStatus: true,
        mode: true,
        lastSyncTime: true,
        appVersion: true,
        createdAt: true,
      },
      where: {
        clientId: 'c1',
        branchId: expect.anything(),
      },
      order: { createdAt: 'DESC' },
    });
    const query = repo.find.mock.calls[0][0];
    expect(query.select).not.toHaveProperty('installToken');
    expect(query.select).not.toHaveProperty('adminPin');
    expect(query.select).not.toHaveProperty('androidId');
  });

  it('does not query devices when a branch user has no allowed branches', async () => {
    const { service, repo } = makeService();

    await expect(service.list('c1', [])).resolves.toEqual([]);
    expect(repo.find).not.toHaveBeenCalled();
  });

  it('deletes a revoked device', async () => {
    const { service, repo } = makeService({
      deviceId: 'dev-1',
      clientId: 'c1',
      deviceStatus: 'REVOKED',
    });
    await expect(service.remove('c1', 'dev-1')).resolves.toEqual({ ok: true });
    expect(repo.delete).toHaveBeenCalledWith({
      deviceId: 'dev-1',
      clientId: 'c1',
    });
  });

  it('refuses to delete a device that is not revoked', async () => {
    const { service, repo } = makeService({
      deviceId: 'dev-1',
      clientId: 'c1',
      deviceStatus: 'ONLINE',
    });
    await expect(service.remove('c1', 'dev-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(repo.delete).not.toHaveBeenCalled();
  });
});
