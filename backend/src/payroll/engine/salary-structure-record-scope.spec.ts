import { PayrollEngineController } from './payroll-engine.controller';

function setup() {
  const qb: any = {};
  for (const method of [
    'leftJoin',
    'addSelect',
    'where',
    'andWhere',
    'orderBy',
    'addOrderBy',
  ]) {
    qb[method] = jest.fn().mockReturnValue(qb);
  }
  qb.getRawAndEntities = jest.fn().mockResolvedValue({ entities: [], raw: [] });
  const repo = { createQueryBuilder: jest.fn().mockReturnValue(qb) };
  const controller = Object.assign(
    Object.create(PayrollEngineController.prototype),
    { structureRepo: repo },
  );
  return { controller, qb, repo };
}
const user = { userId: 'cco-fixture', roleCode: 'CCO' };

describe('CCO salary structure record scope', () => {
  it('defaults to actual structures in the database query', async () => {
    const t = setup();
    await t.controller.listApprovalQueue(user, 'APPROVED');
    expect(t.qb.andWhere).toHaveBeenCalledWith(
      expect.stringMatching(/^NOT \(.*ps\.name/s),
    );
    expect(t.qb.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('u.owner_cco_id = :ccoId'),
      { ccoId: user.userId },
    );
  });

  it.each(['DRAFT', 'PENDING', 'APPROVED', 'REJECTED'])(
    'partitions %s without dropping ownership constraints',
    async (status) => {
      const actual = setup(),
        test = setup();
      await actual.controller.listApprovalQueue(user, status, 'ACTUAL');
      await test.controller.listApprovalQueue(user, status, 'TEST');
      const predicate = test.qb.andWhere.mock.calls.find(([sql]: [string]) =>
        sql.includes('ps.name'),
      )?.[0];
      expect(predicate).toBeDefined();
      expect(actual.qb.andWhere).toHaveBeenCalledWith(`NOT ${predicate}`);
      for (const t of [actual, test]) {
        expect(t.qb.where).toHaveBeenCalledWith('ps.approval_status = :s', {
          s: status,
        });
        expect(t.qb.andWhere).toHaveBeenCalledWith(
          expect.stringContaining('u.owner_cco_id = :ccoId'),
          { ccoId: user.userId },
        );
        expect(t.qb.leftJoin).toHaveBeenCalledWith(
          'employees',
          'e',
          expect.stringContaining('e.client_id = ps.client_id'),
        );
      }
    },
  );

  it.each(['ALL', '', 'ACTUAL OR TRUE', 'OTHER'])(
    'rejects unsupported record scope %p before reading records',
    async (scope) => {
      const t = setup();
      await expect(
        t.controller.listApprovalQueue(user, 'APPROVED', scope),
      ).rejects.toThrow(/recordScope/);
      expect(t.repo.createQueryBuilder).not.toHaveBeenCalled();
    },
  );

  it('preserves status validation and readable detail labels', async () => {
    const t = setup();
    await expect(
      t.controller.listApprovalQueue(user, 'ALL', 'TEST'),
    ).rejects.toThrow(/status/);
    t.qb.getRawAndEntities.mockResolvedValueOnce({
      entities: [{ id: 'fixture', name: 'TEST ONLY structure' }],
      raw: [
        { clientName: 'Synthetic client', employeeName: 'Synthetic worker' },
      ],
    });
    expect(
      await t.controller.listApprovalQueue(user, 'APPROVED', 'TEST'),
    ).toEqual([
      expect.objectContaining({
        id: 'fixture',
        clientName: 'Synthetic client',
        employeeName: 'Synthetic worker',
      }),
    ]);
  });

  it.each([{ scope: ['ACTUAL', 'TEST'] }, { scope: null }, { scope: 123 }])(
    'rejects malformed record scope $scope with a validation error',
    async ({ scope }) => {
      const t = setup();
      await expect(
        t.controller.listApprovalQueue(user, 'APPROVED', scope),
      ).rejects.toThrow(/recordScope/);
      expect(t.repo.createQueryBuilder).not.toHaveBeenCalled();
    },
  );
});
