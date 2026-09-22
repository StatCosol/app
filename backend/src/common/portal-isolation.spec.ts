import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { ReqUser } from '../access/access-scope.service';
import {
  assertClientRecord,
  applyClientBranchScope,
} from './portal-client-scope';
import { HelpdeskService } from '../helpdesk/helpdesk.service';
import { FilesService } from '../files/files.service';

const actor = (overrides: Partial<ReqUser> = {}): ReqUser =>
  ({
    id: 'user-a',
    userId: 'user-a',
    roleCode: 'CLIENT',
    clientId: 'client-a',
    userType: 'BRANCH',
    branchIds: [],
    ...overrides,
  }) as ReqUser;

describe('portal record isolation', () => {
  it('rejects foreign clients even for a master login without querying records', async () => {
    const ds = { query: jest.fn() };
    await expect(
      assertClientRecord(
        ds,
        actor({ userType: 'MASTER' }),
        'client-b',
        'branch-b',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(ds.query).not.toHaveBeenCalled();
  });
  it.each(['BRANCH', undefined])(
    'does not infer master privileges from empty mappings (%s)',
    async (userType) => {
      const ds = { query: jest.fn().mockResolvedValue([]) };
      await expect(
        assertClientRecord(
          ds,
          actor({ userType } as Partial<ReqUser>),
          'client-a',
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        assertClientRecord(
          ds,
          actor({ userType } as Partial<ReqUser>),
          'client-a',
          'branch-a',
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    },
  );
  it('allows a mapped branch and verifies both client and login in the database predicate', async () => {
    const ds = { query: jest.fn().mockResolvedValue([{ id: 'branch-a' }]) };
    await expect(
      assertClientRecord(ds, actor(), 'client-a', 'branch-a'),
    ).resolves.toBeUndefined();
    expect(ds.query).toHaveBeenCalledWith(
      expect.stringContaining('ub.user_id=$4'),
      ['branch-a', 'client-a', false, 'user-a'],
    );
  });
  it('retains a membership predicate when a branch login has no cached branch IDs', () => {
    const qb = { andWhere: jest.fn() };
    applyClientBranchScope(qb, actor(), 't.branch_id');
    expect(qb.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('portal_b.isdeleted=FALSE'),
      { portalUser: 'user-a', portalClient: 'client-a' },
    );
  });
});

describe('helpdesk isolation at service entry points', () => {
  const ticket = {
    id: 'ticket-a',
    clientId: 'client-a',
    branchId: 'branch-a',
    createdByUserId: 'employee-a',
    status: 'RESOLVED',
  };
  function setup(overrides = {}) {
    const tickets = {
      findOne: jest.fn().mockResolvedValue({ ...ticket, ...overrides }),
      save: jest.fn(),
    };
    const ds = {
      query: jest.fn().mockResolvedValue([]),
      transaction: jest.fn(),
    };
    const messages = { create: jest.fn(), save: jest.fn() };
    return {
      service: new HelpdeskService(
        tickets as any,
        messages as any,
        {} as any,
        ds as any,
      ),
      tickets,
      ds,
      messages,
    };
  }
  it.each(['detail', 'messages', 'post', 'upload', 'status'])(
    'denies an unmapped branch before %s operations',
    async (operation) => {
      const { service, tickets, ds, messages } = setup();
      const calls = {
        detail: () => service.getTicket(actor(), 'ticket-a'),
        messages: () => service.listMessages(actor(), 'ticket-a'),
        post: () =>
          service.postMessage(actor(), 'ticket-a', { message: 'test' }),
        upload: () =>
          service.uploadFile(actor(), 'ticket-a', {
            buffer: Buffer.from('test'),
          } as Express.Multer.File),
        status: () =>
          service.updateTicketStatusScoped(actor(), 'ticket-a', {
            status: 'CLOSED',
          }),
      };
      await expect(
        calls[operation as keyof typeof calls](),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(tickets.save).not.toHaveBeenCalled();
      expect(messages.create).not.toHaveBeenCalled();
      expect(ds.transaction).not.toHaveBeenCalled();
    },
  );
  it.each([
    { id: 'employee-b', clientId: 'client-a' },
    { id: 'employee-a', clientId: 'client-b' },
  ])('rejects employee identity/client mismatch %o', async (context) => {
    const { service } = setup();
    const employee = actor({ ...context, roleCode: 'EMPLOYEE' });
    await expect(
      service.getTicket(employee, 'ticket-a'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.essGetTicket(employee, 'ticket-a'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.postMessage(employee, 'ticket-a', { message: 'test' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('allows the ticket-owning employee in the same client', async () => {
    const { service } = setup();
    await expect(
      service.essGetTicket(
        actor({ id: 'employee-a', roleCode: 'EMPLOYEE' }),
        'ticket-a',
      ),
    ).resolves.toMatchObject(ticket);
  });
  it('allows client closure only after resolution', async () => {
    const { service, tickets } = setup({ status: 'OPEN' });
    await expect(
      service.updateTicketStatusScoped(
        actor({ userType: 'MASTER' }),
        'ticket-a',
        { status: 'CLOSED' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    // With valid branch membership, the workflow still prohibits skipping resolution.
    const master = setup({ status: 'OPEN', branchId: null });
    await expect(
      master.service.updateTicketStatusScoped(
        actor({ userType: 'MASTER' }),
        'ticket-a',
        { status: 'CLOSED' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tickets.save).not.toHaveBeenCalled();
  });
});

describe('helpdesk file downloads', () => {
  function setup(ticket: object, mapped = false) {
    const empty = { findOne: jest.fn().mockResolvedValue(null) };
    const query = jest
      .fn()
      .mockResolvedValue(mapped ? [{ id: 'branch-a' }] : []);
    const files = {
      findOne: jest.fn().mockResolvedValue({ id: 'file-a' }),
      manager: {
        query: jest.fn().mockResolvedValue([ticket]),
        connection: { query },
      },
    };
    const scope = {
      assertClientAllowed: jest
        .fn()
        .mockRejectedValue(new ForbiddenException()),
    };
    return new FilesService(
      empty as any,
      empty as any,
      files as any,
      empty as any,
      empty as any,
      scope as any,
    );
  }
  const ticket = {
    clientId: 'client-a',
    branchId: 'branch-a',
    createdByUserId: 'employee-a',
  };
  it('rejects another branch even when the client matches', async () => {
    await expect(
      setup(ticket).assertCanDownload(actor(), 'uploads/helpdesk/file.pdf'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('allows the assigned branch', async () => {
    await expect(
      setup(ticket, true).assertCanDownload(
        actor(),
        'uploads/helpdesk/file.pdf',
      ),
    ).resolves.toBeUndefined();
  });
  it('rejects an employee from a different client', async () => {
    await expect(
      setup(ticket).assertCanDownload(
        actor({ id: 'employee-a', roleCode: 'EMPLOYEE', clientId: 'client-b' }),
        'uploads/helpdesk/file.pdf',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('checks current CRM assignments', async () => {
    await expect(
      setup(ticket).assertCanDownload(
        actor({ roleCode: 'CRM' }),
        'uploads/helpdesk/file.pdf',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
