import { ForbiddenException } from '@nestjs/common';
import { OperationalScopeService } from '../access/operational-scope.service';
import { TaskCenterController } from './task-center.controller';
import { TaskCenterService } from './task-center.service';

describe('Task queues enforce current operational assignments', () => {
  function setup(
    roleCode = 'CLIENT',
    scope: any = { level: 'branches', clientId: 'c', branchIds: ['b1', 'b2'] },
  ) {
    const access = {
      getScope: jest.fn().mockResolvedValue(scope),
      getCcoClientIds: jest.fn().mockResolvedValue(['c']),
      assertClientAllowed: jest.fn(),
      assertBranchAllowed: jest.fn(),
      assertCcoClientAllowed: jest.fn(),
      assertCcoBranchAllowed: jest.fn(),
    };
    const user = {
      id: 'u',
      userId: 'u',
      roleCode,
      clientId: 'c',
      userType: 'BRANCH',
      branchIds: ['b1', 'b2'],
    } as any;
    const service = {
      getMySummary: jest.fn(),
      getMyItems: jest.fn(),
      getOverdueItems: jest.fn(),
      getExpiringItems: jest.fn(),
    };
    return {
      user,
      service,
      access,
      controller: new TaskCenterController(
        service as any,
        new OperationalScopeService(access as any),
      ),
    };
  }
  it.each([
    'getMySummary',
    'getMyItems',
    'getMyOverdue',
    'getMyExpiring',
  ] as const)('preserves every assigned branch in %s', async (method) => {
    const { user, service, controller } = setup();
    await controller[method](user);
    const target =
      method === 'getMyOverdue'
        ? 'getOverdueItems'
        : method === 'getMyExpiring'
          ? 'getExpiringItems'
          : method;
    expect(service[target]).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'BRANCH',
        clientId: 'c',
        branchIds: ['b1', 'b2'],
      }),
    );
  });
  it.each(['CRM', 'AUDITOR', 'PAYROLL', 'CCO'])(
    'restricts unfiltered %s queues to assigned companies',
    async (role) => {
      const { user, service, controller } = setup(role, {
        level: 'clients',
        clientIds: ['c'],
      });
      await controller.getMyItems(user);
      expect(service.getMyItems).toHaveBeenCalledWith(
        expect.objectContaining({ role, clientIds: ['c'] }),
      );
    },
  );
  it('preserves empty assignments', async () => {
    const { user, service, controller } = setup('BRANCH_DESK', {
      level: 'branches',
      clientId: 'c',
      branchIds: [],
    });
    await controller.getMyItems(user);
    expect(service.getMyItems).toHaveBeenCalledWith(
      expect.objectContaining({ branchIds: [] }),
    );
    await expect(controller.getMyItems(user, undefined, 'b1')).rejects.toThrow(
      ForbiddenException,
    );
  });
  it('checks explicit company and branch filters', async () => {
    const { user, service, access, controller } = setup();
    await expect(controller.getMyItems(user, 'other')).rejects.toThrow(
      ForbiddenException,
    );
    await expect(
      controller.getMyItems(user, undefined, 'other'),
    ).rejects.toThrow(ForbiddenException);
    expect(service.getMyItems).not.toHaveBeenCalled();
    await controller.getMyItems(user, undefined, 'b2');
    expect(access.assertBranchAllowed).toHaveBeenCalledWith(user, 'b2');
    expect(service.getMyItems.mock.calls[0][0]).toMatchObject({
      branchId: 'b2',
    });
    expect(service.getMyItems.mock.calls[0][0].branchIds).toBeUndefined();
  });
  it('binds contractor identity and rejects unknown roles or missing identity', async () => {
    const { user, service, controller } = setup('CONTRACTOR', {
      level: 'client',
      clientId: 'c',
    });
    await controller.getMyItems(user, undefined, undefined, 'other');
    expect(service.getMyItems).toHaveBeenCalledWith(
      expect.objectContaining({ contractorId: 'u', clientId: 'c' }),
    );
    await expect(
      controller.getMyItems({ ...user, roleCode: 'UNKNOWN' }),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      controller.getMyItems({ ...user, id: undefined, userId: undefined }),
    ).rejects.toThrow(ForbiddenException);
  });
  it('binds empty arrays instead of dropping SQL predicates', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const service = new TaskCenterService({ query } as any);
    await service.getMyItems({ role: 'CRM', clientIds: [] });
    expect(query).toHaveBeenLastCalledWith(
      expect.stringContaining('t.client_id = ANY($2::uuid[])'),
      ['CRM', []],
    );
    await service.getMyItems({ role: 'BRANCH', clientId: 'c', branchIds: [] });
    expect(query).toHaveBeenLastCalledWith(
      expect.stringContaining('t.branch_id = ANY($3::uuid[])'),
      ['BRANCH', 'c', []],
    );
  });
});
