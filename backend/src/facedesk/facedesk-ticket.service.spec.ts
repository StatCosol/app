import { BadRequestException, ConflictException } from '@nestjs/common';
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

describe('FaceDeskTicketService.complete', () => {
  it('only completes an open ticket (conflict otherwise)', async () => {
    const qb = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 0 }), // already closed
    };
    const repo = { createQueryBuilder: jest.fn(() => qb) };
    const service = new FaceDeskTicketService(
      repo as any,
      { query: jest.fn() } as any,
    );
    await expect(service.complete('t1', 'd1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    // update WHERE must include the open-status guard
    expect(qb.where).toHaveBeenCalledWith(
      expect.stringContaining('status IN (:...open)'),
      expect.objectContaining({ open: ['PENDING', 'CAPTURING'] }),
    );
  });
});

describe('FaceDeskTicketService.abandon', () => {
  it('cancels an open ticket, scoped to the device', async () => {
    const qb = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const repo = { createQueryBuilder: jest.fn(() => qb) };
    const service = new FaceDeskTicketService(
      repo as any,
      { query: jest.fn() } as any,
    );
    await expect(service.abandon('t1', 'd1')).resolves.toEqual({ ok: true });
    expect(qb.set).toHaveBeenCalledWith({ status: 'CANCELLED' });
    // Only an open ticket for this device is touched.
    expect(qb.where).toHaveBeenCalledWith(
      expect.stringContaining('device_id = :deviceId'),
      expect.objectContaining({
        ticketId: 't1',
        deviceId: 'd1',
        open: ['PENDING', 'CAPTURING'],
      }),
    );
  });

  it('is idempotent — no error when the ticket is already closed', async () => {
    const qb = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 0 }), // already closed
    };
    const repo = { createQueryBuilder: jest.fn(() => qb) };
    const service = new FaceDeskTicketService(
      repo as any,
      { query: jest.fn() } as any,
    );
    await expect(service.abandon('t1', 'd1')).resolves.toEqual({ ok: true });
  });
});

describe('FaceDeskTicketService.listByClient branch scope', () => {
  it('filters by branch for branch users', async () => {
    const repo = { find: jest.fn().mockResolvedValue([]) };
    const service = new FaceDeskTicketService(
      repo as any,
      { query: jest.fn() } as any,
    );
    await service.listByClient('c1', 'PENDING', ['b1', 'b2']);
    const where = repo.find.mock.calls[0][0].where;
    expect(where.clientId).toBe('c1');
    expect(where.branchId).toBeDefined(); // In(['b1','b2'])
  });
});

describe('FaceDeskTicketService.cancelOpenForSubject', () => {
  it('closes only the open tickets this device holds for this subject', () => {
    // The scoping is the safety property: a queued ticket for a different
    // employee, client or device must survive, or refusing one enrolment would
    // silently drop somebody else's.
    const { service, qb } = makeService();
    void service.cancelOpenForSubject('d1', 'c1', 'e1');

    expect(qb.set).toHaveBeenCalledWith({ status: 'CANCELLED' });
    const [sql, params] = qb.where.mock.calls[0];
    expect(sql).toContain('device_id = :deviceId');
    expect(sql).toContain('client_id = :clientId');
    expect(sql).toContain('employee_id = :employeeId');
    expect(params).toMatchObject({
      deviceId: 'd1',
      clientId: 'c1',
      employeeId: 'e1',
    });
  });

  it('targets both open states, since the poller treats them alike', () => {
    // A duplicate is refused mid-capture, so the ticket is CAPTURING rather
    // than PENDING by then. Missing that state is what left the loop running.
    const { service, qb } = makeService();
    void service.cancelOpenForSubject('d1', 'c1', 'e1');

    const [, params] = qb.where.mock.calls[0];
    expect(params.open).toEqual(['PENDING', 'CAPTURING']);
  });

  it('is idempotent when nothing is open', async () => {
    // The kiosk cancels too, so this usually runs second and must not error.
    const { service, qb } = makeService();
    qb.execute.mockResolvedValueOnce({ affected: 0 });
    await expect(service.cancelOpenForSubject('d1', 'c1', 'e1')).resolves.toEqual({
      ok: true,
    });
  });
});
