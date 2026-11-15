import { SlaService } from './sla.service';
import { SlaTaskEntity } from './entities/sla-task.entity';
import { Repository } from 'typeorm';
import { OperationalScopeService } from '../access/operational-scope.service';
import { ReqUser } from '../access/access-scope.service';

describe('SLA work status alongside computed overdue status', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-11-15T12:00:00Z'));
  });
  afterEach(() => jest.useRealTimers());
  it.each([
    ['IN_PROGRESS', '2026-11-01', 'OVERDUE', 'IN_PROGRESS'],
    ['OPEN', '2026-11-01', 'OVERDUE', 'OPEN'],
    ['CLOSED', '2026-11-01', 'CLOSED', 'CLOSED'],
    ['OVERDUE', '2026-11-30', 'OPEN', 'OPEN'],
    ['IN_PROGRESS', '2026-11-30', 'IN_PROGRESS', 'IN_PROGRESS'],
  ])(
    'preserves %s for a %s due date',
    async (status, dueDate, displayStatus, workflowStatus) => {
      const row = {
        id: 'TEST-TASK',
        clientId: 'TEST-CLIENT',
        branchId: 'TEST-BRANCH',
        status,
        dueDate,
      };
      const find = jest.fn().mockResolvedValue([row]);
      const service = new SlaService(
        { find } as unknown as Repository<SlaTaskEntity>,
        {
          where: jest.fn().mockResolvedValue({ branchId: 'TEST-BRANCH' }),
        } as unknown as OperationalScopeService,
      );
      const result = await service.list(
        'TEST-CLIENT',
        { roleCode: 'CLIENT' } as ReqUser,
        {},
      );
      expect(result.items[0]).toMatchObject({
        status: displayStatus,
        workflowStatus,
      });
      expect(row.status).toBe(status);
      expect(find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ branchId: 'TEST-BRANCH' }),
        }),
      );
    },
  );
});
