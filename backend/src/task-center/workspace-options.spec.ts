import { ForbiddenException } from '@nestjs/common';
import { TaskCenterController } from './task-center.controller';

describe('LegitX work filter scope', () => {
  function setup(roleCode = 'CLIENT') {
    const user = { id: 'user', roleCode, clientId: 'company' } as any;
    const scope = {
      resolve: jest.fn().mockResolvedValue({
        level: 'branches',
        clientId: 'company',
        branchIds: ['branch'],
      }),
    };
    const service = {
      getWorkspace: jest.fn().mockResolvedValue({
        items: [],
        companies: [],
        branches: [],
        summary: { all: 0 },
      }),
    };
    const options = {
      listAllowedClients: jest
        .fn()
        .mockResolvedValue([{ id: 'company', clientName: 'Vedha Entech' }]),
      listAllowedBranches: jest
        .fn()
        .mockResolvedValue([{ id: 'branch', branchName: 'Assigned branch' }]),
    };
    const controller = new TaskCenterController(
      service as any,
      scope as any,
      options as any,
    );
    return { user, scope, service, options, controller };
  }
  it.each(['CLIENT', 'BRANCH_DESK'])(
    'retains permitted options with no tasks for %s',
    async (role) => {
      const { user, service, options, controller } = setup(role);
      const result = await controller.workspace(user, {});
      expect(result.items).toEqual([]);
      expect(result.summary).toEqual({ all: 0 });
      expect(result.companies).toEqual([
        { id: 'company', name: 'Vedha Entech' },
      ]);
      expect(result.branches).toEqual([
        { id: 'branch', name: 'Assigned branch', clientId: 'company' },
      ]);
      expect(options.listAllowedClients).toHaveBeenCalledWith(user);
      expect(options.listAllowedBranches).toHaveBeenCalledWith(user, 'company');
      expect(service.getWorkspace).toHaveBeenCalledWith(
        expect.objectContaining({ branchIds: ['branch'] }),
        {},
      );
    },
  );
  it('rejects a forged filter before reading tasks or options', async () => {
    const { user, scope, service, options, controller } = setup();
    scope.resolve.mockRejectedValue(new ForbiddenException());
    await expect(
      controller.workspace(user, { clientId: 'other-company' }),
    ).rejects.toThrow(ForbiddenException);
    expect(service.getWorkspace).not.toHaveBeenCalled();
    expect(options.listAllowedClients).not.toHaveBeenCalled();
  });
  it('preserves task-derived options for other queues', async () => {
    const { user, options, controller } = setup('CRM');
    expect((await controller.workspace(user, {})).companies).toEqual([]);
    expect(options.listAllowedClients).not.toHaveBeenCalled();
  });
});
