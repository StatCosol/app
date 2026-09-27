import { ForbiddenException } from '@nestjs/common';
import { AiController } from './ai.controller';
import { ReqUser } from '../access/access-scope.service';

describe('AI observation review ownership', () => {
  let audit: any;
  let access: any;
  let controller: AiController;
  const observation = { clientId: 'company', branchId: 'branch' };
  const dto = { status: 'APPROVED' as const, auditorNotes: 'Reviewed' };
  const user = {
    id: 'reviewer',
    userId: 'reviewer',
    roleCode: 'CRM',
  } as ReqUser;
  beforeEach(() => {
    audit = {
      getObservation: jest.fn().mockResolvedValue(observation),
      reviewObservation: jest.fn().mockResolvedValue({ status: 'APPROVED' }),
    };
    access = {
      assertDocumentInScope: jest.fn(),
      assertCcoClientAllowed: jest.fn(),
    };
    controller = new AiController(
      {} as any,
      audit,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      access,
    );
  });

  it('rejects a CRM outside the observation company before mutation', async () => {
    access.assertDocumentInScope.mockRejectedValue(new ForbiddenException());
    await expect(
      controller.reviewObservation('observation', dto, user),
    ).rejects.toThrow(ForbiddenException);
    expect(access.assertDocumentInScope).toHaveBeenCalledWith(
      user,
      observation,
    );
    expect(audit.reviewObservation).not.toHaveBeenCalled();
  });

  it('checks current CCO company assignments before mutation', async () => {
    access.assertCcoClientAllowed.mockRejectedValue(new ForbiddenException());
    const cco = { ...user, roleCode: 'CCO' };
    await expect(
      controller.reviewObservation('observation', dto, cco),
    ).rejects.toThrow(ForbiddenException);
    expect(access.assertCcoClientAllowed).toHaveBeenCalledWith(cco, 'company');
    expect(audit.reviewObservation).not.toHaveBeenCalled();
  });

  it.each(['CRM', 'CCO'])(
    'allows an authorized %s review',
    async (roleCode) => {
      await controller.reviewObservation('observation', dto, {
        ...user,
        roleCode,
      });
      expect(audit.reviewObservation).toHaveBeenCalledWith(
        'observation',
        'reviewer',
        'APPROVED',
        'Reviewed',
      );
    },
  );
});
