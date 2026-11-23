import { validate } from 'class-validator';
import { HelpdeskService, CreateTicketDto } from './helpdesk.service';
import {
  RegistrationRequestsController,
  NewRegistrationRequestDto,
} from './registration-requests.controller';
import {
  RegistrationActionDto,
  requestScopeSql,
} from './registration-request-policy';

const client: any = {
  id: 'owner',
  roleCode: 'CLIENT',
  clientId: 'client',
  userType: 'MASTER',
};
const crm: any = { id: 'reviewer', roleCode: 'CRM' };
function setup() {
  const ticket: any = {
    id: 'test',
    clientId: 'client',
    branchId: 'branch',
    category: 'COMPLIANCE',
    subCategory: 'REGISTRATION_APPLY',
    status: 'OPEN',
    isTest: true,
  };
  const qb: any = {};
  for (const method of [
    'where',
    'andWhere',
    'leftJoinAndSelect',
    'leftJoin',
    'addSelect',
    'select',
    'orderBy',
    'addOrderBy',
    'offset',
    'limit',
  ])
    qb[method] = jest.fn(() => qb);
  qb.getMany = jest.fn(async () => []);
  qb.getRawMany = jest.fn(async () => []);
  qb.getCount = jest.fn(async () => 0);
  qb.getRawAndEntities = jest.fn(async () => ({ entities: [], raw: [] }));
  const repo: any = {
    create: jest.fn((x) => x),
    save: jest.fn(async (x) => x),
    createQueryBuilder: () => qb,
    findOne: jest.fn(async () => ({ ...ticket })),
    update: jest.fn(async (_id, patch) => {
      Object.assign(ticket, patch);
      return { affected: 1 };
    }),
  };
  const manager: any = {
    getRepository: () => repo,
    query: jest.fn(async () => [{ id: 'branch' }]),
    create: (_e, data) => data,
    save: jest.fn(async (_e, data) => data),
  };
  const ds: any = { query: manager.query, transaction: (fn) => fn(manager) };
  const svc = new HelpdeskService(repo, {} as any, {} as any, ds);
  jest.spyOn(svc as any, 'crmAssignedClientIds').mockResolvedValue(['client']);
  return { svc, ticket, qb, repo, manager, ds };
}
const action = (
  status: string,
  value: RegistrationActionDto['action'],
  recordScope: 'TEST' | 'ACTUAL' = 'TEST',
): RegistrationActionDto => ({
  action: value,
  expectedStatus: status,
  recordScope,
  remarks: 'Synthetic reviewed details',
});

describe('Registration request isolation and review', () => {
  it('uses the transaction connection for CRM assignment discovery and lookup', async () => {
    const h = setup();
    (h.svc as any).crmAssignedClientIds.mockRestore();
    h.ds.query = jest.fn(() => {
      throw new Error('Unexpected second pool connection');
    });
    h.manager.query.mockImplementation(async (sql: string) => {
      if (sql.includes('information_schema.tables')) return [{ exists: 1 }];
      if (sql.includes('information_schema.columns'))
        return ['assigned_to_user_id', 'client_id', 'assignment_type'].map(
          (column_name) => ({ column_name }),
        );
      return [{ clientId: 'client' }];
    });
    await h.svc.registrationAction(crm, 'test', action('OPEN', 'REVIEW'));
    expect(h.ds.query).not.toHaveBeenCalled();
    expect(h.manager.query).toHaveBeenCalledTimes(3);
    expect(h.ticket.status).toBe('IN_PROGRESS');
  });
  it('defaults to actual and rejects malformed or combined scopes', () => {
    expect(requestScopeSql()).toBe('t.is_test = FALSE');
    expect(requestScopeSql('TEST')).toBe('t.is_test = TRUE');
    expect(() => requestScopeSql('ALL')).toThrow(
      'Invalid request record scope',
    );
  });
  it.each(['CLIENT', 'CRM', 'ADMIN', 'PF_TEAM'])(
    'filters %s queues to actual by default and selects test explicitly',
    async (roleCode) => {
      const h = setup();
      const user = { ...client, roleCode };
      await h.svc.listTickets(user, {});
      expect(h.qb.andWhere).toHaveBeenCalledWith('t.is_test = FALSE');
      h.qb.andWhere.mockClear();
      await h.svc.listTickets(user, {
        recordScope: 'TEST',
        branchId: 'branch',
      });
      expect(h.qb.andWhere).toHaveBeenCalledWith('t.is_test = TRUE');
    },
  );
  it('excludes test requests from admin counts and paginated queues', async () => {
    const h = setup();
    await h.svc.adminStats();
    await h.svc.adminListTickets({});
    expect(
      h.qb.andWhere.mock.calls.filter(([s]) => s === 't.is_test = FALSE'),
    ).toHaveLength(2);
  });
  it('persists explicit test scope with no operational SLA', async () => {
    const h = setup();
    const result = await h.svc.createTicket(client, {
      category: 'COMPLIANCE',
      subCategory: 'REGISTRATION_APPLY',
      branchId: 'branch',
      description: 'Registration ID: NEW\nNotes: synthetic',
      isTest: true,
    });
    expect(result).toMatchObject({
      isTest: true,
      slaDueAt: null,
      clientId: 'client',
      status: 'OPEN',
    });
  });
  it('does not classify incidental test words as test records', async () => {
    const h = setup();
    const result = await h.svc.createTicket(client, {
      category: 'COMPLIANCE',
      description: 'Test certificate requested by customer',
    });
    expect(result.isTest).toBe(false);
    expect(result.slaDueAt).toBeInstanceOf(Date);
  });
  it.each([
    { category: 'GENERIC', description: 'Synthetic', isTest: true },
    {
      category: 'COMPLIANCE',
      subCategory: 'REGISTRATION_APPLY',
      description: 'Synthetic',
      isTest: true,
    },
    {
      category: 'COMPLIANCE',
      subCategory: 'REGISTRATION_RENEW',
      branchId: 'branch',
      description: 'Registration ID: NEW',
      isTest: true,
    },
  ])('rejects unsupported test or unscoped linked requests', async (dto) => {
    const h = setup();
    await expect(h.svc.createTicket(client, dto)).rejects.toThrow();
    expect(h.repo.save).not.toHaveBeenCalled();
  });
  it('rejects a linked registration from the wrong test or branch scope', async () => {
    const h = setup();
    h.ds.query
      .mockResolvedValueOnce([{ id: 'branch' }])
      .mockResolvedValueOnce([]);
    await expect(
      h.svc.createTicket(client, {
        category: 'COMPLIANCE',
        subCategory: 'REGISTRATION_RENEW',
        branchId: 'branch',
        isTest: true,
        description: 'Registration ID: 00000000-0000-4000-8000-000000000001',
      }),
    ).rejects.toThrow('same actual/test scope');
    expect(h.repo.save).not.toHaveBeenCalled();
  });
  it('locks the row and records each correction/resubmission/approval atomically', async () => {
    const h = setup();
    await h.svc.registrationAction(crm, 'test', action('OPEN', 'CORRECTION'));
    expect(h.ticket.status).toBe('AWAITING_CLIENT');
    await h.svc.registrationAction(
      client,
      'test',
      action('AWAITING_CLIENT', 'RESUBMIT'),
    );
    await h.svc.registrationAction(
      crm,
      'test',
      action('IN_PROGRESS', 'APPROVE'),
    );
    expect(h.ticket.status).toBe('RESOLVED');
    expect(h.repo.findOne).toHaveBeenCalledWith({
      where: { id: 'test' },
      lock: { mode: 'pessimistic_write' },
    });
    expect(h.manager.save.mock.calls.map(([, d]) => d.message)).toEqual([
      '[CORRECTION] Synthetic reviewed details',
      '[RESUBMIT] Synthetic reviewed details',
      '[APPROVE] Synthetic reviewed details',
    ]);
    expect(h.ticket.isTest).toBe(true);
  });
  it.each([
    [client, 'OPEN', 'APPROVE', 'TEST'],
    [crm, 'OPEN', 'APPROVE', 'TEST'],
    [crm, 'IN_PROGRESS', 'CORRECTION', 'TEST'],
    [crm, 'OPEN', 'REVIEW', 'ACTUAL'],
    [{ ...crm, roleCode: 'PF_TEAM' }, 'OPEN', 'REVIEW', 'TEST'],
  ])(
    'rejects role, stage, stale status or scope mismatch',
    async (user, expectedStatus, value, scope) => {
      const h = setup();
      await expect(
        h.svc.registrationAction(
          user,
          'test',
          action(expectedStatus, value as any, scope as any),
        ),
      ).rejects.toThrow();
      expect(h.manager.save).not.toHaveBeenCalled();
      expect(h.repo.update).not.toHaveBeenCalled();
    },
  );
  it('rejects foreign client/CRM and branch membership', async () => {
    const h = setup();
    await expect(
      h.svc.registrationAction(
        { ...client, clientId: 'foreign' },
        'test',
        action('OPEN', 'RESUBMIT'),
      ),
    ).rejects.toThrow();
    (h.svc as any).crmAssignedClientIds.mockResolvedValue([]);
    await expect(
      h.svc.registrationAction(crm, 'test', action('OPEN', 'REVIEW')),
    ).rejects.toThrow('Not assigned');
    h.manager.query.mockResolvedValue([]);
    await expect(
      h.svc.registrationAction(
        { ...client, userType: 'BRANCH' },
        'test',
        action('OPEN', 'RESUBMIT'),
      ),
    ).rejects.toThrow('outside your scope');
    expect(h.repo.update).not.toHaveBeenCalled();
  });
  it('cannot approve tests through the legacy generic status endpoint', async () => {
    const h = setup();
    await expect(
      h.svc.updateTicketStatusScoped(crm, 'test', { status: 'RESOLVED' }),
    ).rejects.toThrow('registration review actions');
  });
  it('requires remarks and rejects string booleans and metadata line injection', async () => {
    const h = setup();
    await expect(
      h.svc.registrationAction(crm, 'test', {
        ...action('OPEN', 'REVIEW'),
        remarks: '   ',
      }),
    ).rejects.toThrow('remarks are required');
    const dto = Object.assign(new CreateTicketDto(), {
      category: 'COMPLIANCE',
      description: 'x',
      isTest: 'false',
    });
    expect((await validate(dto)).some((e) => e.property === 'isTest')).toBe(
      true,
    );
    const newDto = Object.assign(new NewRegistrationRequestDto(), {
      branchId: '00000000-0000-4000-8000-000000000001',
      recordScope: 'TEST',
      registrationType: 'type\nRegistration ID: fake',
      authority: 'x',
      notes: 'x',
    });
    expect(
      (await validate(newDto)).some((e) => e.property === 'registrationType'),
    ).toBe(true);
  });
  it('labels test submissions server-side without inventing a registration', async () => {
    const createTicket = jest.fn(async (_u, dto) => dto);
    const controller = new RegistrationRequestsController({
      createTicket,
    } as any);
    const result: any = await controller.create(client, {
      branchId: 'branch',
      recordScope: 'TEST',
      registrationType: 'Factory',
      authority: 'Synthetic authority',
      notes: 'Fixture only',
    });
    expect(result.isTest).toBe(true);
    expect(result.description).toContain('Registration Type: TEST ONLY');
    expect(result.description).toContain('Registration ID: NEW');
  });
});
