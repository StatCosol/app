import 'reflect-metadata';
import { validate } from 'class-validator';
import { WorkQueryDto } from './work-query.dto';
import { TaskCenterController } from './task-center.controller';
import { TaskCenterService } from './task-center.service';

describe('My Work request boundaries', () => {
  it('validates the requested filters then queries only the identity-derived scope', async () => {
    const resolve = jest.fn().mockResolvedValue({
      level: 'branches',
      clientId: 'c',
      branchIds: ['a', 'b'],
    });
    const getWorkspace = jest.fn();
    const controller = new TaskCenterController(
      { getWorkspace } as any,
      { resolve } as any,
    );
    const user = { id: 'u', roleCode: 'BRANCH_DESK' } as any;
    await controller.workspace(user, { branchId: 'b' });
    expect(resolve).toHaveBeenNthCalledWith(1, user, undefined, 'b');
    expect(getWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'BRANCH',
        branchIds: ['a', 'b'],
        clientId: 'c',
      }),
      { branchId: 'b' },
    );
  });
  it('stops before data access when the selected scope is forbidden', async () => {
    const getWorkspace = jest.fn();
    const controller = new TaskCenterController(
      { getWorkspace } as any,
      { resolve: jest.fn().mockRejectedValue(new Error('Forbidden')) } as any,
    );
    await expect(
      controller.workspace({ id: 'u', roleCode: 'CRM' } as any, {
        clientId: 'foreign',
      }),
    ).rejects.toThrow('Forbidden');
    expect(getWorkspace).not.toHaveBeenCalled();
  });
  it.each([
    { month: '2026-13' },
    { clientId: 'invalid' },
    { branchId: 'invalid' },
    { view: 'APPROVE' },
    { page: 0 },
    { limit: 201 },
  ])('rejects malformed filters %j', async (input) => {
    expect(
      (await validate(Object.assign(new WorkQueryDto(), input))).length,
    ).toBeGreaterThan(0);
  });
  it('binds search, company and branch values instead of putting them into SQL', async () => {
    const query = jest.fn().mockResolvedValue([{}]);
    const service = new TaskCenterService({ query } as any);
    await service.getWorkspace(
      { role: 'BRANCH', clientId: 'c', branchIds: [] },
      { q: "' OR TRUE --", branchId: 'b', limit: 25 },
    );
    const [sql, values] = query.mock.calls[0];
    expect(sql).not.toContain("' OR TRUE --");
    expect(values).toContain("' OR TRUE --");
    expect(values).toContainEqual([]);
    expect(sql).toContain('WITH scoped AS');
    expect(sql).toContain('FROM filtered');
  });
});
