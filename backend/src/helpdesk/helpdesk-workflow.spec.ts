import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { IsNull } from 'typeorm';
import { HelpdeskService } from './helpdesk.service';

function setup(overrides = {}) {
  const ticket = {
    id: 'ticket',
    clientId: 'client',
    branchId: null,
    category: 'PF',
    status: 'IN_PROGRESS',
    assignedToUserId: 'pf',
    ...overrides,
  };
  const qb: any = { getMany: jest.fn().mockResolvedValue([]) };
  for (const name of ['where', 'andWhere', 'leftJoinAndSelect', 'orderBy'])
    qb[name] = jest.fn().mockReturnValue(qb);
  const tickets = {
    findOne: jest.fn(async () => ({ ...ticket })),
    createQueryBuilder: jest.fn(() => qb),
    update: jest.fn(async (_where, patch) => {
      Object.assign(ticket, patch);
      return { affected: 1 };
    }),
    save: jest.fn(),
  };
  const ds = {
    query: jest.fn().mockResolvedValue([{ id: 'pf', roleCode: 'PF_TEAM' }]),
  };
  const service = new HelpdeskService(
    tickets as any,
    {} as any,
    {} as any,
    ds as any,
  );
  const assignments = jest
    .spyOn(service as any, 'crmAssignedClientIds')
    .mockResolvedValue(['client']);
  return { service, ticket, tickets, ds, qb, assignments };
}
const pf = { id: 'pf', roleCode: 'PF_TEAM' } as any;
const admin = { id: 'admin', roleCode: 'ADMIN' } as any;
const client = {
  id: 'client-user',
  roleCode: 'CLIENT',
  clientId: 'client',
  userType: 'MASTER',
} as any;

describe('Helpdesk list access', () => {
  it.each([
    undefined,
    {},
    { id: 'u', roleCode: 'CLIENT' },
    { id: 'u', roleCode: 'CLIENT', clientId: '' },
    { id: 'u', roleCode: 'EMPLOYEE' },
    { id: 'u', roleCode: 'CONTRACTOR' },
    { id: 'u', roleCode: 'UNKNOWN' },
  ])('rejects invalid scope before reading tickets: %o', async (user) => {
    const h = setup();
    await expect(h.service.listTickets(user as any, {})).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(h.tickets.createQueryBuilder).not.toHaveBeenCalled();
  });
  it('retains client and live branch membership filters', async () => {
    const h = setup();
    await h.service.listTickets(
      { ...client, userType: 'BRANCH', branchIds: [] },
      { branchId: 'foreign' },
    );
    expect(h.qb.where).toHaveBeenCalledWith('t.client_id = :clientId', {
      clientId: 'client',
    });
    expect(h.qb.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('user_branches'),
      { portalUser: client.id, portalClient: 'client' },
    );
    expect(h.qb.andWhere).toHaveBeenCalledWith('t.branch_id = :branchId', {
      branchId: 'foreign',
    });
  });
  it('keeps the PF queue scoped and permits the explicit admin path', async () => {
    const h = setup();
    await h.service.listTickets(pf, {});
    expect(h.qb.where).toHaveBeenCalledWith('t.category IN (:...cats)', {
      cats: ['PF', 'ESI', 'PAYSLIP'],
    });
    expect(h.qb.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('assigned_to_user_id'),
      { uid: pf.id },
    );
    await expect(h.service.listTickets(admin, {})).resolves.toEqual([]);
  });
});

describe('Helpdesk assignment eligibility', () => {
  it('requires an explicit assignment or null', async () => {
    const h = setup();
    await expect(
      h.service.assignTicket('ticket', {} as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(h.tickets.findOne).not.toHaveBeenCalled();
  });
  it.each([
    'CLIENT',
    'EMPLOYEE',
    'CONTRACTOR',
    'PF_TEAM',
    'AUDITOR',
    'PAYROLL',
    'CEO',
  ])(
    'rejects non-operational assignees on general tickets: %s',
    async (roleCode) => {
      const h = setup({ category: 'COMPLIANCE' });
      h.ds.query.mockResolvedValue([{ id: 'assignee', roleCode }]);
      await expect(
        h.service.assignTicket('ticket', { assignedToUserId: 'assignee' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(h.tickets.update).not.toHaveBeenCalled();
    },
  );
  it('rejects missing/inactive assignees and non-PF assignees for PF tickets', async () => {
    const h = setup();
    h.ds.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'admin', roleCode: 'ADMIN' }]);
    await expect(
      h.service.assignTicket('ticket', { assignedToUserId: 'missing' }),
    ).rejects.toThrow('Assignee not found');
    await expect(
      h.service.assignTicket('ticket', { assignedToUserId: 'admin' }),
    ).rejects.toThrow('PF tickets must');
    expect(h.ds.query).toHaveBeenCalledWith(
      expect.stringContaining('u.is_active = true'),
      ['missing'],
    );
    expect(h.tickets.update).not.toHaveBeenCalled();
  });
  it('requires current CRM client assignment', async () => {
    const h = setup({ category: 'COMPLIANCE' });
    h.ds.query.mockResolvedValue([{ id: 'crm', roleCode: 'CRM' }]);
    h.assignments.mockResolvedValueOnce([]);
    await expect(
      h.service.assignTicket('ticket', { assignedToUserId: 'crm' }),
    ).rejects.toThrow('not assigned to this client');
    expect(h.tickets.update).not.toHaveBeenCalled();
    await expect(
      h.service.assignTicket('ticket', { assignedToUserId: 'crm' }),
    ).resolves.toMatchObject({ assignedToUserId: 'crm' });
  });
  it('assigns an open PF ticket without writing unrelated fields and supports explicit unassignment', async () => {
    const h = setup({ assignedToUserId: null, status: 'OPEN' });
    await h.service.assignTicket('ticket', { assignedToUserId: 'pf' });
    expect(h.tickets.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'OPEN', assignedToUserId: IsNull() }),
      { assignedToUserId: 'pf', status: 'IN_PROGRESS' },
    );
    await h.service.assignTicket('ticket', { assignedToUserId: null });
    expect(h.tickets.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ assignedToUserId: 'pf' }),
      { assignedToUserId: null },
    );
    expect(h.tickets.save).not.toHaveBeenCalled();
  });
});

describe('Helpdesk conditional transitions', () => {
  it.each(['assign', 'status'])(
    'rejects concurrent changes instead of overwriting them (%s)',
    async (operation) => {
      const h = setup();
      h.tickets.update.mockResolvedValue({ affected: 0 });
      const result =
        operation === 'assign'
          ? h.service.assignTicket('ticket', { assignedToUserId: null })
          : h.service.updateTicketStatusScoped(pf, 'ticket', {
              status: 'RESOLVED',
            });
      await expect(result).rejects.toBeInstanceOf(ConflictException);
      expect(h.tickets.update).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'ticket',
          clientId: 'client',
          branchId: IsNull(),
          category: 'PF',
          status: 'IN_PROGRESS',
          assignedToUserId: 'pf',
        }),
        expect.any(Object),
      );
      expect(h.ticket.status).toBe('IN_PROGRESS');
      expect(h.tickets.save).not.toHaveBeenCalled();
    },
  );
  it.each(['updateTicketStatusScoped', 'pfTeamUpdateStatus'] as const)(
    'enforces the same scope and transitions through %s',
    async (method) => {
      const h = setup();
      await expect(
        h.service[method]({ ...pf, id: 'other' }, 'ticket', {
          status: 'RESOLVED',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        h.service[method](pf, 'ticket', { status: 'CLOSED' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        h.service[method](
          { id: 'employee', roleCode: 'EMPLOYEE' } as any,
          'ticket',
          { status: 'RESOLVED' },
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(h.tickets.update).not.toHaveBeenCalled();
      await expect(
        h.service[method](pf, 'ticket', { status: 'RESOLVED' }),
      ).resolves.toMatchObject({ status: 'RESOLVED' });
      expect(h.tickets.update).toHaveBeenCalledWith(expect.any(Object), {
        status: 'RESOLVED',
      });
    },
  );
  it('allows clients to close only resolved tickets', async () => {
    const h = setup();
    await expect(
      h.service.updateTicketStatusScoped(client, 'ticket', {
        status: 'CLOSED',
      }),
    ).rejects.toThrow('resolved tickets only');
    h.ticket.status = 'RESOLVED';
    await expect(
      h.service.updateTicketStatusScoped(client, 'ticket', {
        status: 'CLOSED',
      }),
    ).resolves.toMatchObject({ status: 'CLOSED' });
  });
});
