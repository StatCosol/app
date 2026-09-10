import { ClientExpiryController } from './controllers/client-expiry.controller';

/**
 * A branch user gets their own branches from the client expiry endpoint.
 *
 * Third instance of the same shape: /branch/expiry-tasks scoped correctly and
 * /client/expiry-tasks did not, while `@Roles('CLIENT')` admitted both user
 * kinds to both. A branch user saw every branch's expiry tasks in the company,
 * and the KPI counted them.
 */
describe('client expiry tasks — branch users', () => {
  function makeController(branchIds: string[]) {
    const expiryTaskService = {
      listForClient: jest.fn().mockResolvedValue(['ALL-COMPANY']),
      listForBranch: jest.fn().mockResolvedValue(['MY-BRANCHES']),
      getKpiSummary: jest.fn().mockResolvedValue({ total: 0 }),
    };
    const branchAccess = {
      getUserBranchIds: jest.fn().mockResolvedValue(branchIds),
    };
    return {
      controller: new ClientExpiryController(
        expiryTaskService as any,
        branchAccess as any,
      ),
      expiryTaskService,
    };
  }

  const user = (over: Record<string, unknown> = {}) =>
    ({
      id: 'u1',
      userId: 'u1',
      roleCode: 'CLIENT',
      clientId: 'client-a',
      ...over,
    }) as any;

  describe('list', () => {
    it('gives a branch user their branches, not the company', async () => {
      const { controller, expiryTaskService } = makeController(['branch-1']);

      await expect(controller.list(user())).resolves.toEqual(['MY-BRANCHES']);
      expect(expiryTaskService.listForBranch).toHaveBeenCalledWith([
        'branch-1',
      ]);
      expect(expiryTaskService.listForClient).not.toHaveBeenCalled();
    });

    it('still gives a master user the whole company', async () => {
      // No branch mappings is how this codebase reads a master CLIENT.
      const { controller, expiryTaskService } = makeController([]);

      await expect(controller.list(user())).resolves.toEqual(['ALL-COMPANY']);
      expect(expiryTaskService.listForClient).toHaveBeenCalledWith('client-a');
    });

    it('gives an ADMIN the whole company', async () => {
      const { controller, expiryTaskService } = makeController(['branch-1']);

      await controller.list(user({ roleCode: 'ADMIN' }));

      expect(expiryTaskService.listForClient).toHaveBeenCalled();
      expect(expiryTaskService.listForBranch).not.toHaveBeenCalled();
    });
  });

  describe('kpi', () => {
    it('counts only a branch user’s branches', async () => {
      const { controller, expiryTaskService } = makeController(['branch-1']);

      await controller.kpi(user());

      expect(expiryTaskService.getKpiSummary).toHaveBeenCalledWith(
        'client-a',
        undefined,
        ['branch-1'],
      );
    });

    it('counts the whole company for a master', async () => {
      const { controller, expiryTaskService } = makeController([]);

      await controller.kpi(user());

      expect(expiryTaskService.getKpiSummary).toHaveBeenCalledWith(
        'client-a',
        undefined,
        undefined,
      );
    });
  });
});
