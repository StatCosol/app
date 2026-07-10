import { BadRequestException } from '@nestjs/common';
import { FaceDeskTicketService } from './facedesk-ticket.service';

function makeService(
  opts: {
    device?: any;
    employee?: any;
  } = {},
) {
  const qb = {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  const repo = {
    createQueryBuilder: jest.fn(() => qb),
    create: jest.fn((v: any) => v),
    save: jest.fn(async (v: any) => ({ ticketId: 't-1', ...v })),
    findOne: jest.fn().mockResolvedValue(null),
    find: jest.fn().mockResolvedValue([]),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  const dataSource = {
    query: jest
      .fn()
      .mockResolvedValueOnce(opts.device ? [opts.device] : [])
      .mockResolvedValueOnce(opts.employee ? [opts.employee] : []),
  };
  return {
    service: new FaceDeskTicketService(repo as any, dataSource as any),
    repo,
    qb,
  };
}

describe('FaceDeskTicketService.create', () => {
  const device = { device_id: 'd1', branch_id: 'b1', status: 'ONLINE' };
  const employee = {
    id: 'e1',
    name: 'Test',
    employee_code: 'E001',
    branch_id: 'b1',
  };

  it('creates a PENDING ticket for a valid device + employee', async () => {
    const { service, qb } = makeService({ device, employee });
    const t = await service.create('c1', 'admin-1', {
      employeeId: 'e1',
      deviceId: 'd1',
    });
    expect(t.status).toBe('PENDING');
    expect(t.employeeName).toBe('Test');
    // Any prior open ticket on the device is cancelled first.
    expect(qb.set).toHaveBeenCalledWith({ status: 'CANCELLED' });
  });

  it('rejects a device not owned by the client', async () => {
    const { service } = makeService({ device: undefined, employee });
    await expect(
      service.create('c1', 'a', { employeeId: 'e1', deviceId: 'd1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a device outside the branch user scope', async () => {
    const { service } = makeService({ device, employee });
    await expect(
      service.create('c1', 'a', { employeeId: 'e1', deviceId: 'd1' }, [
        'other-branch',
      ]),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires employeeId and deviceId', async () => {
    const { service } = makeService();
    await expect(
      service.create('c1', 'a', { employeeId: '', deviceId: '' } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
