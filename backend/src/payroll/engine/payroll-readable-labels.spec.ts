import { PayrollEngineController } from './payroll-engine.controller';
import { AdminApprovalsService } from '../../admin/admin-approvals.service';

function query(rows: { entities: any[]; raw: any[] }) {
  const qb: any = {};
  for (const method of [
    'leftJoin',
    'innerJoin',
    'addSelect',
    'where',
    'andWhere',
    'orderBy',
    'addOrderBy',
  ]) {
    qb[method] = jest.fn().mockReturnValue(qb);
  }
  qb.getRawAndEntities = jest.fn().mockResolvedValue(rows);
  return qb;
}

describe('Readable approval labels', () => {
  it('adds scope names without changing IDs or dropping the CCO ownership restriction', async () => {
    const qb = query({
      entities: [{ id: 'structure', branchId: 'branch', clientId: 'client' }],
      raw: [{ branchName: 'Hyderabad', clientName: 'Client One' }],
    });
    const controller = Object.assign(
      Object.create(PayrollEngineController.prototype),
      { structureRepo: { createQueryBuilder: () => qb } },
    ) as PayrollEngineController;
    const rows = await controller.listApprovalQueue(
      { userId: 'cco', roleCode: 'CCO' } as any,
      'PENDING',
    );
    expect(rows[0]).toMatchObject({
      id: 'structure',
      branchId: 'branch',
      clientId: 'client',
      branchName: 'Hyderabad',
      clientName: 'Client One',
    });
    expect(qb.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('u.owner_cco_id = :ccoId'),
      { ccoId: 'cco' },
    );
    expect(qb.leftJoin).toHaveBeenCalledWith(
      'client_branches',
      'b',
      expect.stringContaining('b.clientid = ps.client_id'),
    );
    expect(qb.leftJoin).toHaveBeenCalledWith(
      'employees',
      'e',
      expect.stringContaining('e.client_id = ps.client_id'),
    );
  });

  it('returns component labels and keeps the component lookup within the structure client', async () => {
    const qb = query({
      entities: [{ id: 'item', componentId: 'component' }],
      raw: [{ componentName: 'Basic pay', componentCode: 'BASIC' }],
    });
    const structureRepo = {
      findOne: jest
        .fn()
        .mockResolvedValue({ id: 'structure', clientId: 'client' }),
    };
    const controller = Object.assign(
      Object.create(PayrollEngineController.prototype),
      { structureRepo, itemRepo: { createQueryBuilder: () => qb } },
    ) as PayrollEngineController;
    expect(await controller.listStructureItems('structure')).toEqual([
      {
        id: 'item',
        componentId: 'component',
        componentName: 'Basic pay',
        componentCode: 'BASIC',
      },
    ]);
    expect(qb.where).toHaveBeenCalledWith('item.structure_id = :structureId', {
      structureId: 'structure',
    });
    expect(qb.leftJoin).toHaveBeenCalledWith(
      'payroll_components',
      'component',
      expect.stringContaining('component.client_id = structure.client_id'),
    );
    structureRepo.findOne.mockResolvedValueOnce(null);
    await expect(controller.listStructureItems('missing')).rejects.toThrow();
  });

  it('resolves contractor-employee deletion targets without changing action identifiers', async () => {
    const request = {
      id: 'request',
      requestType: 'DELETE_CONTRACTOR_EMPLOYEE',
      targetEntityType: 'CONTRACTOR_EMPLOYEE',
      targetEntityId: 'employee',
    };
    const qb = query({
      entities: [request],
      raw: [{ targetName: 'Worker One — CE001' }],
    });
    const service = new AdminApprovalsService(
      { createQueryBuilder: () => qb } as any,
      {} as any,
    );
    expect(await service.list('PENDING')).toEqual([
      { ...request, requesterName: null, targetName: 'Worker One — CE001' },
    ]);
    expect(qb.leftJoin).toHaveBeenCalledWith(
      'contractor_employees',
      'contractor_employee',
      "contractor_employee.id = req.target_entity_id AND LOWER(req.target_entity_type) = 'contractor_employee'",
    );
    const targetProjection = qb.addSelect.mock.calls.find(
      ([, alias]) => alias === 'targetName',
    )[0];
    expect(targetProjection).toContain('contractor_employee.name');
    expect(targetProjection).toContain('contractor_employee.employee_code');
  });

  it('keeps requests whose related record is missing and preserves the status filter', async () => {
    const qb = query({
      entities: [{ id: 'request', targetEntityId: 'deleted-branch' }],
      raw: [{}],
    });
    const service = new AdminApprovalsService(
      { createQueryBuilder: () => qb } as any,
      {} as any,
    );
    expect(await service.list('PENDING')).toEqual([
      {
        id: 'request',
        targetEntityId: 'deleted-branch',
        requesterName: null,
        targetName: null,
      },
    ]);
    expect(qb.where).toHaveBeenCalledWith('req.status = :status', {
      status: 'PENDING',
    });
    expect(qb.leftJoin).toHaveBeenCalledWith(
      'client_branches',
      'branch',
      expect.stringContaining("LOWER(req.target_entity_type) = 'branch'"),
    );
  });
});
