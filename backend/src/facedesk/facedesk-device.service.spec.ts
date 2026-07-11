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
    });
    expect(d.installToken).toMatch(/^[0-9a-f]{64}$/);
    expect(d.deviceStatus).toBe('PROVISIONED');
    expect(d.clientId).toBe('c1');
  });

  it('registers a device and returns its token + context', async () => {
    const { service } = makeService({
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
        deviceToken: 'tok',
        clientId: 'c1',
        branchId: 'b1',
      }),
    );
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
