import { ForbiddenException } from '@nestjs/common';
import { LicenceAlertsService } from './licence-alerts.service';
import { BranchRegistrationsService } from './branch-registrations.service';
import { UpdateBranchRegistrationDto } from './dto/update-branch-registration.dto';
import { validate } from 'class-validator';

describe('Licence alert scope and licence amendments', () => {
  const user = {
    userId: 'user',
    roleCode: 'CLIENT',
    clientId: 'client',
  } as any;
  const ds = { query: jest.fn().mockResolvedValue([]) };
  beforeEach(() => ds.query.mockClear());
  it('refuses a branch outside the caller assignment', async () => {
    const access = {
      listAllowedBranches: jest.fn().mockResolvedValue([{ id: 'assigned' }]),
    };
    const service = new LicenceAlertsService(
      ds as any,
      {} as any,
      access as any,
    );
    await expect(service.listForUser(user, 'other')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(ds.query).not.toHaveBeenCalled();
  });
  it('fails closed for a user without branches', async () => {
    const service = new LicenceAlertsService(
      ds as any,
      {} as any,
      { listAllowedBranches: async () => [] } as any,
    );
    expect(await service.listForUser(user)).toMatchObject({
      renewals: [],
      manpower: [],
    });
    expect(ds.query).not.toHaveBeenCalled();
  });
  it('passes only allowed branches into the dashboard query', async () => {
    const service = new LicenceAlertsService(
      ds as any,
      {} as any,
      { listAllowedBranches: async () => [{ id: 'assigned' }] } as any,
    );
    await service.listForUser(user);
    expect(ds.query.mock.calls[0][1]).toEqual([['assigned']]);
  });
  it('restricts historical in-app alerts to branch assignments', async () => {
    const service = new BranchRegistrationsService(
      {} as any,
      {} as any,
      ds as any,
    );
    await service.getAlerts('client', undefined, 50, []);
    expect(ds.query).not.toHaveBeenCalled();
    await service.getAlerts('client', 'branch', 50, ['branch']);
    expect(ds.query.mock.calls[0][0]).toContain('ANY($4::uuid[])');
    expect(ds.query.mock.calls[0][1]).toEqual([
      'client',
      50,
      'branch',
      ['branch'],
    ]);
  });
  it.each([0, -1, 1.5, 2147483648])(
    'rejects invalid worker limit %s',
    async (limit) => {
      const dto = Object.assign(new UpdateBranchRegistrationDto(), {
        licensedWorkerLimit: limit,
      });
      expect(
        (await validate(dto)).some(
          (error) => error.property === 'licensedWorkerLimit',
        ),
      ).toBe(true);
    },
  );
  it.each([null, 1, 100, 2147483647])(
    'accepts optional/positive integer worker limit %s',
    async (limit) => {
      const dto = Object.assign(new UpdateBranchRegistrationDto(), {
        licensedWorkerLimit: limit,
      });
      expect(await validate(dto)).toEqual([]);
    },
  );
  it('preserves the limit when renewing and clears it when changing licence type', async () => {
    const row = {
      id: 'reg',
      clientId: 'client',
      branchId: 'branch',
      type: 'Factory License',
      expiryDate: new Date('2026-11-10'),
      licensedWorkerLimit: 100,
    };
    const repo = {
      findOne: async () => row,
      save: async (value: any) => value,
    };
    const service = new BranchRegistrationsService(
      repo as any,
      {} as any,
      ds as any,
    );
    const renewed = await service.update(
      'reg',
      { expiryDate: '2027-11-10' },
      'client',
      'user',
    );
    expect(renewed.licensedWorkerLimit).toBe(100);
    expect(renewed.renewedOn).toBeInstanceOf(Date);
    const changed = await service.update(
      'reg',
      { type: 'Fire Safety' },
      'client',
      'user',
    );
    expect(changed.licensedWorkerLimit).toBeNull();
  });
});
