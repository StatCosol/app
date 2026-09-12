import { AppraisalScopeGuard, appraisalFilter } from './appraisal-scope.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Reflector } from '@nestjs/core';
import { EmployeeAppraisalsController } from './controllers/employee-appraisals.controller';
import { EmployeeAppraisalsService } from './services/employee-appraisals.service';

const user = {
  id: 'u',
  roleCode: 'CLIENT',
  userType: 'BRANCH',
  clientId: 'a',
  branchIds: ['a1'],
} as any;
function context(path: string, method = 'GET', who = user) {
  const req = {
    path,
    method,
    user: who,
    params: { id: 'record' },
    query: {},
    body: {},
  };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    // The guard reads decorator metadata; it never calls this method.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    getHandler: () => EmployeeAppraisalsController.prototype.managerReview,
    getClass: () => EmployeeAppraisalsController,
  } as any;
}
describe('Appraisal ownership and transitions', () => {
  it.each([
    '/appraisal/employees/record',
    '/appraisal/cycles/record',
    '/appraisal/templates/record',
    '/appraisal/templates/scales/record',
  ])('rejects another company record at %s', async (path) => {
    const guard = new AppraisalScopeGuard({
      query: jest.fn().mockResolvedValue([{ client_id: 'b', branch_id: 'b1' }]),
    } as any);
    await expect(guard.canActivate(context(path))).rejects.toThrow(
      'not in scope',
    );
  });
  it('rejects another branch appraisal in the same company', async () => {
    const guard = new AppraisalScopeGuard({
      query: jest.fn().mockResolvedValue([{ client_id: 'a', branch_id: 'a2' }]),
    } as any);
    await expect(
      guard.canActivate(context('/appraisal/employees/record')),
    ).rejects.toThrow('not in scope');
  });
  it('allows the established branch role to review its own record', async () => {
    const ctx = context('/appraisal/employees/record/manager-review', 'POST');
    expect(new RolesGuard(new Reflector()).canActivate(ctx)).toBe(true);
    const guard = new AppraisalScopeGuard({
      query: jest.fn().mockResolvedValue([{ client_id: 'a', branch_id: 'a1' }]),
    } as any);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });
  it('denies company approval to a branch user', async () => {
    const guard = new AppraisalScopeGuard({ query: jest.fn() } as any);
    await expect(
      guard.canActivate(
        context('/appraisal/employees/record/client-approve', 'POST'),
      ),
    ).rejects.toThrow('Company approval');
  });
  it('fails closed for missing branches and conflicting branch filters', () => {
    expect(() => appraisalFilter({ ...user, branchIds: [] }, {})).toThrow(
      'Branch scope',
    );
    expect(() => appraisalFilter(user, { branchId: 'a2' })).toThrow(
      'Branch not in scope',
    );
    expect(appraisalFilter(user, {})).toEqual({
      clientId: 'a',
      branchId: 'a1',
    });
  });
  function service(record: any, item: any = null) {
    const save = jest.fn();
    const repo = { findOne: jest.fn().mockResolvedValue(record), save };
    const items = {
      findOne: jest.fn().mockResolvedValue(item),
      update: jest.fn(),
    };
    const s = new EmployeeAppraisalsService(
      repo as any,
      items as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    (s as any).inTransaction = true;
    return { s, save, items };
  }
  it('rejects sending back a locked record without saving it', async () => {
    const { s, save } = service({ status: 'LOCKED', lockedAt: new Date() });
    await expect(s.sendBack('id', 'retry', 'u')).rejects.toThrow(
      'current appraisal state',
    );
    expect(save).not.toHaveBeenCalled();
  });
  it('rejects approving before branch review', async () => {
    const { s, save } = service({ status: 'INITIATED' });
    await expect(
      s.clientApprove('id', { action: 'APPROVE' } as any, 'u'),
    ).rejects.toThrow('current appraisal state');
    expect(save).not.toHaveBeenCalled();
  });
  it('rejects a foreign review item before writing ratings', async () => {
    const { s, items } = service({ status: 'SELF_SUBMITTED' });
    await expect(
      s.managerReview(
        'id',
        { items: [{ itemId: 'foreign', rating: 4 }] } as any,
        'u',
      ),
    ).rejects.toThrow('does not belong');
    expect(items.findOne).toHaveBeenCalledWith({
      where: { id: 'foreign', employeeAppraisalId: 'id' },
    });
    expect(items.update).not.toHaveBeenCalled();
  });
  it('starts transitions inside a transaction with a write lock', async () => {
    const qb = {
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue({}),
    };
    const repo = {
      createQueryBuilder: () => qb,
      findOne: jest
        .fn()
        .mockResolvedValue({ status: 'LOCKED', lockedAt: new Date() }),
    };
    const manager = { getRepository: () => repo };
    const transaction = jest.fn((fn) => fn(manager));
    const s = new EmployeeAppraisalsService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { transaction } as any,
    );
    await expect(s.sendBack('id', 'retry', 'u')).rejects.toThrow();
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(qb.setLock).toHaveBeenCalledWith('pessimistic_write');
  });
});
