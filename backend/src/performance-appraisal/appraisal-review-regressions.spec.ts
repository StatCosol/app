import { appraisalFilter } from './appraisal-scope.guard';
import { EmployeeAppraisalsController } from './controllers/employee-appraisals.controller';
import { AppraisalCyclesController } from './controllers/appraisal-cycles.controller';
import { EmployeeAppraisalsService } from './services/employee-appraisals.service';
import { AppraisalCyclesService } from './services/appraisal-cycles.service';

const branchUser = {
  id: 'u',
  roleCode: 'CLIENT',
  userType: 'BRANCH',
  clientId: 'c',
  branchIds: ['b1', 'b2'],
} as any;

describe('Appraisal review regressions', () => {
  it('preserves all assigned branches and still validates explicit filters', () => {
    expect(appraisalFilter(branchUser, {})).toEqual({
      clientId: 'c',
      branchIds: ['b1', 'b2'],
    });
    expect(appraisalFilter(branchUser, { branchId: 'b2' })).toEqual({
      clientId: 'c',
      branchId: 'b2',
    });
    expect(() => appraisalFilter(branchUser, { branchId: 'b3' })).toThrow(
      'Branch not in scope',
    );
  });
  it('passes the full branch scope to lists, dashboards and cycles', async () => {
    const employees = { findAll: jest.fn(), getDashboard: jest.fn() };
    const cycles = { findAll: jest.fn() };
    const controller = new EmployeeAppraisalsController(employees as any);
    await controller.findAll({}, branchUser);
    await controller.dashboard(branchUser);
    await new AppraisalCyclesController(cycles as any).findAll(branchUser);
    expect(employees.findAll).toHaveBeenCalledWith({
      clientId: 'c',
      branchIds: ['b1', 'b2'],
    });
    expect(employees.getDashboard).toHaveBeenCalledWith('c', undefined, [
      'b1',
      'b2',
    ]);
    expect(cycles.findAll).toHaveBeenCalledWith('c', undefined, ['b1', 'b2']);
  });
  it.each([
    [branchUser, 'BRANCH'],
    [{ ...branchUser, roleCode: 'BRANCH_DESK' }, 'BRANCH'],
    [{ ...branchUser, userType: 'MASTER' }, 'CLIENT'],
    [{ ...branchUser, roleCode: 'ADMIN', userType: undefined }, 'CLIENT'],
  ])(
    'derives send-back authority from the authenticated user',
    (user, level) => {
      const sendBack = jest.fn();
      new EmployeeAppraisalsController({ sendBack } as any).sendBack(
        'id',
        'retry',
        user,
      );
      expect(sendBack).toHaveBeenCalledWith('id', 'retry', 'u', level);
    },
  );
  function transactionalService(status: string) {
    const record = { id: 'id', status };
    const save = jest.fn();
    const qb = {
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(record),
    };
    const repo = {
      createQueryBuilder: () => qb,
      findOne: jest.fn().mockResolvedValue(record),
      save,
    };
    const manager = { getRepository: () => repo };
    const transaction = jest.fn((fn) => fn(manager));
    const service = new EmployeeAppraisalsService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { transaction } as any,
    );
    return { service, save, qb, record };
  }
  it('rejects branch reversal of company approval after acquiring the transaction lock', async () => {
    const { service, save, qb, record } =
      transactionalService('CLIENT_APPROVED');
    await expect(
      service.sendBack('id', 'retry', 'u', 'BRANCH'),
    ).rejects.toThrow('Only company users');
    expect(qb.setLock).toHaveBeenCalledWith('pessimistic_write');
    expect(save).not.toHaveBeenCalled();
    expect(record.status).toBe('CLIENT_APPROVED');
  });
  it.each([
    ['CLIENT_APPROVED', 'CLIENT'],
    ['BRANCH_REVIEWED', 'BRANCH'],
  ] as const)(
    'permits authorized %s send-back and records the actor level',
    async (status, level) => {
      const { service, save } = transactionalService(status);
      await expect(
        service.sendBack('id', 'retry', 'u', level),
      ).resolves.toEqual({ ok: true });
      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({ approvalLevel: level, action: 'SENT_BACK' }),
      );
    },
  );
  it('applies assigned branches to list totals, rows and all dashboard queries', async () => {
    const query = jest.fn().mockResolvedValue([{ total: 2 }]);
    const service = new EmployeeAppraisalsService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { query } as any,
    );
    await service.findAll({ clientId: 'c', branchIds: ['b1', 'b2'] });
    await service.getDashboard('c', undefined, ['b1', 'b2']);
    for (const [sql, params] of query.mock.calls) {
      expect(sql).toContain('ea.branch_id = ANY($2::uuid[])');
      expect(params.slice(0, 2)).toEqual(['c', ['b1', 'b2']]);
    }
  });
  it('keeps the selected branch filter on every dashboard aggregate', async () => {
    const query = jest.fn().mockResolvedValue([{ total: 1 }]);
    const service = new EmployeeAppraisalsService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { query } as any,
    );
    await service.getDashboard('c', 'b2');
    expect(query).toHaveBeenCalledTimes(4);
    for (const [sql, params] of query.mock.calls) {
      expect(sql).toContain('ea.branch_id = $2');
      expect(params).toEqual(['c', 'b2']);
    }
  });
  it('uses every assigned branch for cycle visibility and appraisal counts', async () => {
    const qb = {
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([{ id: 'cycle' }]),
    };
    const query = jest
      .fn()
      .mockResolvedValue([{ total: 2, completed: 1, pending: 1 }]);
    const service = new AppraisalCyclesService(
      { createQueryBuilder: () => qb } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { query } as any,
    );
    await service.findAll('c', undefined, ['b1', 'b2']);
    expect(qb.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('ANY(CAST(:branches AS uuid[]))'),
      { branches: ['b1', 'b2'] },
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('branch_id = ANY($2::uuid[])'),
      ['cycle', ['b1', 'b2']],
    );
  });
});
