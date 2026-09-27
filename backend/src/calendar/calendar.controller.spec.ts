import { ForbiddenException } from '@nestjs/common';
import { CalendarController } from './calendar.controller';
import { CalendarService } from './calendar.service';
import { OperationalScopeService } from '../access/operational-scope.service';
import { AccessScopeService, ReqUser } from '../access/access-scope.service';

describe('Calendar access', () => {
  const query = { from: '2026-09-01', to: '2026-09-30', clientId: 'company' };
  const user = (roleCode: string, extra = {}) =>
    ({ id: 'user', userId: 'user', roleCode, ...extra }) as ReqUser;
  let calendar: { getCalendar: jest.Mock };
  let access: Record<string, jest.Mock>;
  let controller: CalendarController;

  beforeEach(() => {
    calendar = { getCalendar: jest.fn().mockResolvedValue({ items: [] }) };
    access = {
      getScope: jest
        .fn()
        .mockResolvedValue({ level: 'client', clientId: 'company' }),
      getCcoClientIds: jest.fn().mockResolvedValue(['company']),
      assertClientAllowed: jest.fn(),
      assertCcoClientAllowed: jest.fn(),
      assertBranchAllowed: jest.fn(),
      assertCcoBranchAllowed: jest.fn(),
    };
    controller = new CalendarController(
      calendar as unknown as CalendarService,
      new OperationalScopeService(access as unknown as AccessScopeService),
    );
  });

  it('returns no events for a branch user with no branches', async () => {
    access.getScope.mockResolvedValue({
      level: 'branches',
      clientId: 'company',
      branchIds: [],
    });
    expect(
      await controller.getCalendar(
        query,
        user('CLIENT', { clientId: 'company', userType: 'BRANCH' }),
      ),
    ).toEqual({ from: query.from, to: query.to, items: [] });
    expect(calendar.getCalendar).not.toHaveBeenCalled();
  });

  it('passes only assigned branches to the event query', async () => {
    access.getScope.mockResolvedValue({
      level: 'branches',
      clientId: 'company',
      branchIds: ['branch-a'],
    });
    await controller.getCalendar(
      query,
      user('CLIENT', { clientId: 'company', userType: 'BRANCH' }),
    );
    expect(calendar.getCalendar).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: 'company', branchIds: ['branch-a'] }),
    );
  });

  it('rejects a requested branch outside the allowed set', async () => {
    access.getScope.mockResolvedValue({
      level: 'branches',
      clientId: 'company',
      branchIds: ['branch-a'],
    });
    await expect(
      controller.getCalendar(
        { ...query, branchId: 'branch-b' },
        user('CLIENT', { clientId: 'company' }),
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(calendar.getCalendar).not.toHaveBeenCalled();
  });

  it.each(['CCO', 'CRM'])(
    'denies an unassigned company for %s',
    async (role) => {
      access.getScope.mockResolvedValue({ level: 'clients', clientIds: [] });
      access.getCcoClientIds.mockResolvedValue([]);
      await expect(controller.getCalendar(query, user(role))).rejects.toThrow(
        ForbiddenException,
      );
      expect(calendar.getCalendar).not.toHaveBeenCalled();
    },
  );

  it.each(['CCO', 'ADMIN', 'CEO'])(
    'preserves allowed company reads for %s',
    async (role) => {
      access.getScope.mockResolvedValue({ level: 'all' });
      await controller.getCalendar(query, user(role));
      expect(calendar.getCalendar).toHaveBeenCalledWith(
        expect.objectContaining({ clientId: 'company', branchIds: [] }),
      );
    },
  );

  it('rejects a client without company context', async () => {
    await expect(controller.getCalendar(query, user('CLIENT'))).rejects.toThrow(
      ForbiddenException,
    );
    expect(calendar.getCalendar).not.toHaveBeenCalled();
  });
});
