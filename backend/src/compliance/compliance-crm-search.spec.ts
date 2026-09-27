import { ForbiddenException } from '@nestjs/common';
import { getMetadataArgsStorage } from 'typeorm';
import { ComplianceCrmTasksService } from './compliance-crm-tasks.service';
import { ComplianceTask } from './entities/compliance-task.entity';
import { ComplianceMasterEntity } from '../compliances/entities/compliance-master.entity';

describe('CRM task search', () => {
  function setup(assigned = true) {
    const query = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(0),
      getMany: jest.fn().mockResolvedValue([]),
    };
    const tasks = { createQueryBuilder: jest.fn(() => query) };
    const service = Object.create(
      ComplianceCrmTasksService.prototype,
    ) as ComplianceCrmTasksService;
    Object.assign(service, {
      tasks,
      assignmentsService: {
        isClientAssignedToCrm: jest.fn().mockResolvedValue(assigned),
      },
    });
    return { service, query, tasks };
  }

  const user: any = { userId: 'crm-1', roleCode: 'CRM' };

  it('searches mapped columns and retains client scope with a bound search value', async () => {
    const { service, query } = setup();
    await expect(
      service.crmListTasks(user, { clientId: 'client-1', q: "PF's" }),
    ).resolves.toEqual({ items: [], total: 0 });
    expect(query.where).toHaveBeenCalledWith(
      't.clientId IN (:...assignedClientIds)',
      { assignedClientIds: ['client-1'] },
    );
    const [predicate, parameters] = query.andWhere.mock.calls.find(([sql]) =>
      sql.includes('ILIKE'),
    )!;
    expect(parameters).toEqual({ search: "%PF's%" });
    expect(predicate).not.toContain("PF's");
    const aliases = { t: ComplianceTask, compliance: ComplianceMasterEntity };
    const columns = getMetadataArgsStorage().columns;
    // Check the actual entity mappings so stale field names fail without a database connection.
    for (const [, alias, property] of predicate.matchAll(
      /(t|compliance)\.(\w+)/g,
    )) {
      expect(
        columns.some(
          (column) =>
            column.target === aliases[alias as keyof typeof aliases] &&
            column.propertyName === property,
        ),
      ).toBe(true);
    }
    expect(query.getCount).toHaveBeenCalledTimes(1);
    expect(query.getMany).toHaveBeenCalledTimes(1);
  });

  it('does not execute a search against an unassigned client', async () => {
    const { service, tasks } = setup(false);
    await expect(
      service.crmListTasks(user, { clientId: 'other-client', q: 'PF' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(tasks.createQueryBuilder).not.toHaveBeenCalled();
  });
});
