import { CrmBranchRegistrationsController } from './branch-documents.controller';
import { actualRegistrationSql } from '../common/actual-records';

describe('registration evidence scope permissions', () => {
  const user = { roleCode: 'CRM', userId: 'crm-a' } as any;
  const setup = (assigned = true) => {
    const listByBranch = jest.fn().mockResolvedValue([]);
    const isClientAssignedToCrm = jest.fn().mockResolvedValue(assigned);
    const controller = new CrmBranchRegistrationsController(
      { listByBranch } as any,
      { isClientAssignedToCrm } as any,
    );
    return { controller, listByBranch, isClientAssignedToCrm };
  };
  it('defaults to actual registrations and checks the CRM assignment', async () => {
    const { controller, listByBranch, isClientAssignedToCrm } = setup();
    await controller.list(user, 'branch-a', 'client-a');
    expect(isClientAssignedToCrm).toHaveBeenCalledWith('client-a', 'crm-a');
    expect(listByBranch).toHaveBeenCalledWith('branch-a', 'client-a', 'ACTUAL');
  });
  it('allows explicitly requested test evidence within the same assignment', async () => {
    const { controller, listByBranch } = setup();
    await controller.list(user, 'branch-a', 'client-a', 'TEST');
    expect(listByBranch).toHaveBeenCalledWith('branch-a', 'client-a', 'TEST');
  });
  it.each(['ACTUAL', 'TEST'])(
    'denies unassigned clients for %s',
    async (scope) => {
      const { controller, listByBranch } = setup(false);
      await expect(
        controller.list(user, 'branch-a', 'client-a', scope),
      ).rejects.toThrow('Client not assigned');
      expect(listByBranch).not.toHaveBeenCalled();
    },
  );
  it.each(['ALL', '', 'TEST OR TRUE'])(
    'rejects unsupported scope %s',
    async (scope) => {
      const { controller, listByBranch } = setup();
      await expect(
        controller.list(user, 'branch-a', 'client-a', scope),
      ).rejects.toThrow('recordScope');
      expect(listByBranch).not.toHaveBeenCalled();
    },
  );
  it('rejects dynamic aliases', () => {
    expect(() => actualRegistrationSql('r;DROP')).toThrow('Invalid SQL alias');
  });
});
