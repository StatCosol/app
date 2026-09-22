import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ComplianceCrmTasksService } from './compliance-crm-tasks.service';
import { CompliancePortalTasksService } from './compliance-portal-tasks.service';
import { ComplianceTask } from './entities/compliance-task.entity';
import { ComplianceMcdItem } from './entities/compliance-mcd-item.entity';

// Exercise the real service methods; collaborators stand in for persistence and notifications.
describe('CRM monthly approval', () => {
  function setup(items: object[], currentStatus = 'SUBMITTED') {
    const task = { id: 10, clientId: 'client-a', status: 'SUBMITTED' };
    const manager = {
      findOne: jest.fn().mockResolvedValue({ ...task, status: currentStatus }),
      query: jest.fn().mockResolvedValue(items),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const svc = Object.create(ComplianceCrmTasksService.prototype);
    Object.assign(svc, {
      tasks: {
        findOne: jest.fn().mockResolvedValue(task),
        manager: { transaction: jest.fn((work) => work(manager)) },
      },
      assignmentsService: {
        isClientAssignedToCrm: jest.fn().mockResolvedValue(true),
      },
      users: { findOne: jest.fn().mockResolvedValue(null) },
    });
    return { svc: svc as ComplianceCrmTasksService, manager };
  }
  const user: any = { id: 'crm-a', userId: 'crm-a', roleCode: 'CRM' };
  it.each([
    { id: 1, status: 'PENDING', required: true, evidence: true },
    { id: 1, status: 'RETURNED', required: true, evidence: true },
    { id: 1, status: 'SUBMITTED', required: true, evidence: false },
  ])('does not approve incomplete monthly evidence (%o)', async (item) => {
    const { svc, manager } = setup([item]);
    await expect(svc.crmApprove(user, '10')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(manager.update).not.toHaveBeenCalled();
  });
  it('rechecks the task state under the transaction lock', async () => {
    const { svc, manager } = setup([], 'REJECTED');
    await expect(svc.crmApprove(user, '10')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(manager.update).not.toHaveBeenCalled();
  });
  it('verifies all items and approves the task in the same transaction with CRM attribution', async () => {
    const { svc, manager } = setup([
      { id: 1, status: 'SUBMITTED', required: true, evidence: true },
    ]);
    await svc.crmApprove(user, '10');
    expect(manager.update).toHaveBeenCalledWith(
      ComplianceMcdItem,
      { taskId: 10 },
      expect.objectContaining({
        status: 'VERIFIED',
        verifiedByUserId: 'crm-a',
      }),
    );
    expect(manager.update).toHaveBeenCalledWith(
      ComplianceTask,
      { id: 10 },
      expect.objectContaining({
        status: 'APPROVED',
        approvedByUserId: 'crm-a',
      }),
    );
  });
});

describe('contractor task owner isolation', () => {
  it.each(['detail', 'comment', 'notApplicable'])(
    'rejects another contractor before %s',
    async (operation) => {
      const svc = Object.create(CompliancePortalTasksService.prototype);
      const comments = { save: jest.fn() };
      Object.assign(svc, {
        tasks: {
          findOne: jest.fn().mockResolvedValue({
            id: 1,
            clientId: 'client-a',
            assignedToUserId: 'other-contractor',
          }),
        },
        comments,
      });
      const user: any = {
        id: 'contractor-a',
        userId: 'contractor-a',
        roleCode: 'CONTRACTOR',
        clientId: 'client-a',
      };
      const calls = {
        detail: () => svc.contractorGetTaskDetail(user, '1'),
        comment: () => svc.contractorAddComment(user, '1', 'test'),
        notApplicable: () => svc.contractorMarkNotApplicable(user, '1', 'test'),
      };
      await expect(
        calls[operation as keyof typeof calls](),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(comments.save).not.toHaveBeenCalled();
    },
  );
});

describe('unclaimed contractor task reads', () => {
  const user: any = {
    id: 'contractor-a',
    userId: 'contractor-a',
    roleCode: 'CONTRACTOR',
  };
  function setup(clientId = 'client-a', branchId: string | null = 'branch-a') {
    const svc = Object.create(CompliancePortalTasksService.prototype);
    Object.assign(svc, {
      tasks: {
        findOne: jest.fn().mockResolvedValue({
          id: 1,
          clientId,
          branchId,
          assignedToUserId: null,
          dueDate: '2099-01-01',
          status: 'PENDING',
        }),
      },
      users: {
        findOne: jest.fn().mockResolvedValue({
          clientId: 'client-a',
          branches: [{ id: 'branch-a' }],
        }),
      },
      usersService: {
        getUserRoleCode: jest.fn().mockResolvedValue('CONTRACTOR'),
      },
      comments: { find: jest.fn().mockResolvedValue([]) },
      evidence: { find: jest.fn().mockResolvedValue([]) },
    });
    return svc as CompliancePortalTasksService;
  }
  it('allows a listed unclaimed task within the contractor branch', async () => {
    await expect(
      setup().contractorGetTaskDetail(user, '1'),
    ).resolves.toMatchObject({ task: { id: 1 }, comments: [], evidence: [] });
  });
  it('rejects an unclaimed task from a different branch', async () => {
    await expect(
      setup('client-a', 'branch-b').contractorGetTaskDetail(user, '1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('rejects an unclaimed task from a different client', async () => {
    await expect(
      setup('client-b').contractorGetTaskDetail(user, '1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
