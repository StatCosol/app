import { ForbiddenException } from '@nestjs/common';
import { UnitsController } from './units.controller';

/**
 * Every unit route is addressed by :branchId, and none of them checked it.
 *
 * The guards admit ADMIN, CRM and CLIENT, so any signed-in client or CRM user
 * could read AND rewrite another tenant's unit facts — headcount, hazardous
 * status, contractor counts — and recompute their statutory applicability from
 * it. `actorUserId` was audit metadata: it recorded who did it, it did not
 * decide whether they could.
 */
describe('units routes — branch authorization', () => {
  function makeController(allowed: boolean) {
    const assertBranchAllowed = jest.fn(async (_user: any, branchId: string) => {
      if (!allowed) throw new ForbiddenException('Branch not in scope');
      return undefined;
    });

    const factsSvc = {
      getFacts: jest.fn().mockResolvedValue({ branchId: 'b1' }),
      upsertFacts: jest.fn().mockResolvedValue({ branchId: 'b1' }),
    };
    const engineSvc = { recompute: jest.fn().mockResolvedValue([]) };
    const applicabilitySvc = {
      getApplicable: jest.fn().mockResolvedValue([]),
      setSpecialActs: jest.fn().mockResolvedValue([]),
      applyOverrides: jest.fn().mockResolvedValue([]),
    };

    const controller = new UnitsController(
      factsSvc as any,
      engineSvc as any,
      applicabilitySvc as any,
      { assertBranchAllowed } as any,
    );

    return { controller, assertBranchAllowed, factsSvc, engineSvc, applicabilitySvc };
  }

  const user = { id: 'u1', userId: 'u1', roleCode: 'CLIENT' } as any;

  describe('when the branch is out of scope', () => {
    it('refuses to read facts', async () => {
      const { controller, factsSvc } = makeController(false);
      await expect(controller.getFacts('other-branch', user)).rejects.toThrow(
        ForbiddenException,
      );
      expect(factsSvc.getFacts).not.toHaveBeenCalled();
    });

    it('refuses to write facts', async () => {
      // The write is the one that matters: unit facts drive which statutes
      // apply to that establishment.
      const { controller, factsSvc } = makeController(false);
      await expect(
        controller.upsertFacts('other-branch', {} as any, user),
      ).rejects.toThrow(ForbiddenException);
      expect(factsSvc.upsertFacts).not.toHaveBeenCalled();
    });

    it('refuses to recompute applicability', async () => {
      const { controller, engineSvc } = makeController(false);
      await expect(
        controller.recompute('other-branch', {} as any, user),
      ).rejects.toThrow(ForbiddenException);
      expect(engineSvc.recompute).not.toHaveBeenCalled();
    });

    it('refuses to read applicability', async () => {
      const { controller, applicabilitySvc } = makeController(false);
      await expect(
        controller.getApplicable('other-branch', user),
      ).rejects.toThrow(ForbiddenException);
      expect(applicabilitySvc.getApplicable).not.toHaveBeenCalled();
    });

    it('refuses to save applicability', async () => {
      const { controller, engineSvc } = makeController(false);
      await expect(
        controller.saveApplicable('other-branch', {} as any, user),
      ).rejects.toThrow(ForbiddenException);
      expect(engineSvc.recompute).not.toHaveBeenCalled();
    });
  });

  describe('when the branch is in scope', () => {
    it('reads and writes as before', async () => {
      const { controller, assertBranchAllowed, factsSvc } = makeController(true);

      await controller.getFacts('b1', user);
      await controller.upsertFacts('b1', {} as any, user);

      expect(assertBranchAllowed).toHaveBeenCalledWith(user, 'b1');
      expect(factsSvc.getFacts).toHaveBeenCalledWith('b1');
      expect(factsSvc.upsertFacts).toHaveBeenCalled();
    });
  });
});
