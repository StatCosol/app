import { TaskCenterController } from './task-center.controller';
import { TaskCenterService } from './task-center.service';

describe('Task center assigned branch scope', () => {
  const user = {
    id: 'u',
    userId: 'u',
    roleCode: 'CLIENT',
    userType: 'BRANCH',
    clientId: 'c',
    branchIds: ['b1', 'b2'],
  } as any;
  it.each([
    'getMySummary',
    'getMyItems',
    'getMyOverdue',
    'getMyExpiring',
  ] as const)('preserves all assignments for %s', async (method) => {
    const service = {
      getMySummary: jest.fn(),
      getMyItems: jest.fn(),
      getOverdueItems: jest.fn(),
      getExpiringItems: jest.fn(),
    };
    const controller = new TaskCenterController(service as any, {} as any);
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
        branchId: null,
        branchIds: ['b1', 'b2'],
      }),
    );
  });
  it('validates a selected branch and only sends that filter', async () => {
    const assertBranchAllowed = jest.fn();
    const getMyItems = jest.fn();
    const controller = new TaskCenterController(
      { getMyItems } as any,
      { assertBranchAllowed } as any,
    );
    await controller.getMyItems(user, undefined, 'b2');
    expect(assertBranchAllowed).toHaveBeenCalledWith(user, 'b2');
    expect(getMyItems).toHaveBeenCalledWith(
      expect.objectContaining({ branchId: 'b2' }),
    );
    expect(getMyItems.mock.calls[0][0].branchIds).toBeUndefined();
  });
  it('preserves an empty branch set rather than widening to the company', async () => {
    const getMyItems = jest.fn();
    await new TaskCenterController({ getMyItems } as any, {} as any).getMyItems(
      { ...user, branchIds: [] },
    );
    expect(getMyItems).toHaveBeenCalledWith(
      expect.objectContaining({ branchIds: [] }),
    );
  });
  it('supports BRANCH_DESK identities', async () => {
    const getMyItems = jest.fn();
    await new TaskCenterController({ getMyItems } as any, {} as any).getMyItems(
      { ...user, roleCode: 'BRANCH_DESK' },
    );
    expect(getMyItems).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'BRANCH', branchIds: ['b1', 'b2'] }),
    );
  });
  it('binds branch arrays for item queries, including empty scopes', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const service = new TaskCenterService({ query } as any);
    await service.getMyItems({
      role: 'BRANCH',
      clientId: 'c',
      branchIds: ['b1', 'b2'],
    });
    expect(query).toHaveBeenLastCalledWith(
      expect.stringContaining('t.branch_id = ANY($3::uuid[])'),
      ['BRANCH', 'c', ['b1', 'b2']],
    );
    await service.getMyItems({ role: 'BRANCH', clientId: 'c', branchIds: [] });
    expect(query).toHaveBeenLastCalledWith(
      expect.stringContaining('t.branch_id = ANY($3::uuid[])'),
      ['BRANCH', 'c', []],
    );
  });
});
