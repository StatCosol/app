import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  TimeOfficeController,
  TimeOfficeService,
  timeOfficeFilters,
} from './time-office';
import { RolesGuard } from '../auth/roles.guard';
import { AttendanceController } from './attendance.controller';
import { ScopeGuard } from '../auth/guards/scope.guard';
import { ServiceEntitlementsGuard } from '../service-entitlements/service-entitlements.guard';

describe('Time Office access and filters', () => {
  const company = '11111111-1111-4111-8111-111111111111';
  const branch = '22222222-2222-4222-8222-222222222222';
  const context = (
    role: string,
    controller: any = TimeOfficeController,
    clientId = company,
    query = {},
  ) =>
    ({
      getHandler: () =>
        controller.prototype.dashboard || controller.prototype.bulkMark,
      getClass: () => controller,
      switchToHttp: () => ({
        getRequest: () => ({
          user: { roleCode: role, clientId },
          query,
          params: {},
          body: {},
          originalUrl: '/api/v1/client/attendance/time-office',
          method: 'GET',
        }),
      }),
    }) as any;

  it.each(['TIME_OFFICE_EXECUTIVE', 'TIME_OFFICE_MANAGER'])(
    'allows %s to read, but not edit attendance or cross tenants',
    async (role) => {
      const guard = new RolesGuard(new Reflector());
      expect(guard.canActivate(context(role))).toBe(true);
      expect(() =>
        guard.canActivate(context(role, AttendanceController)),
      ).toThrow(ForbiddenException);
      expect(() =>
        new ScopeGuard().canActivate(
          context(role, TimeOfficeController, company, { clientId: branch }),
        ),
      ).toThrow(ForbiddenException);
      const entitlements = {
        assertModule: jest.fn().mockResolvedValue(undefined),
      };
      await new ServiceEntitlementsGuard(entitlements as any).canActivate(
        context(role),
      );
      expect(entitlements.assertModule).toHaveBeenCalledWith(
        company,
        'EMPLOYEE_ATTENDANCE',
      );
    },
  );

  it('rejects unrelated roles', () => {
    expect(() =>
      new RolesGuard(new Reflector()).canActivate(context('CONTRACTOR')),
    ).toThrow(ForbiddenException);
  });

  it.each([
    { date: '2026-02-30' },
    { date: '2099-01-01' },
    { hours: '0' },
    { hours: 'NaN' },
    { hours: '25' },
    { page: '-1' },
    { page: '1.5' },
    { branch: 'invalid' },
    { view: 'users' },
    { issue: 'invalid' },
    { workforce: 'UNKNOWN' },
    { contractor: 'invalid' },
    { contractor: branch, workforce: 'EMPLOYEE' },
    { contractor: branch, view: 'coff' },
    { search: ['a', 'b'] },
  ])('rejects invalid filters %j', (q) => {
    expect(() => timeOfficeFilters(q as any)).toThrow(BadRequestException);
  });

  it('accepts valid leap dates and bounds search length', () => {
    expect(
      timeOfficeFilters({ date: '2024-02-29', search: 'a'.repeat(200) }),
    ).toMatchObject({ date: '2024-02-29', search: 'a'.repeat(100) });
  });

  it('fails closed before querying when no company is assigned', async () => {
    const db = { query: jest.fn() };
    await expect(
      new TimeOfficeService(db as any).dashboard({ clientId: null } as any, {}),
    ).rejects.toThrow(ForbiddenException);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('rejects another company branch before reading employee data', async () => {
    const db = { query: jest.fn().mockResolvedValue([]) };
    await expect(
      new TimeOfficeService(db as any).dashboard({ clientId: company } as any, {
        branch,
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it.each(['attendance', 'leaves', 'coff'])(
    'uses authenticated company and bound search parameters for %s',
    async (view) => {
      const db = {
        query: jest
          .fn()
          .mockResolvedValueOnce([{ id: branch, name: 'Branch' }])
          .mockResolvedValueOnce([{ rows: [], total: 0, summary: {} }]),
      };
      const search = "' OR true; --";
      const result = await new TimeOfficeService(db as any).dashboard(
        { clientId: company } as any,
        {
          date: '2026-01-01',
          clientId: branch,
          branch,
          view,
          search,
          page: '2',
        },
      );
      expect(db.query.mock.calls[1][1]).toEqual([
        company,
        '2026-01-01',
        branch,
        search,
        9,
        '',
        50,
        ...(view === 'attendance' ? ['ALL', null] : []),
      ]);
      expect(db.query.mock.calls[1][0]).not.toContain(search);
      expect(result).toMatchObject({ total: 0, page: 2, pageSize: 50 });
    },
  );
});
