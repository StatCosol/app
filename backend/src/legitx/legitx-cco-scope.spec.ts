import { ForbiddenException } from '@nestjs/common';
import { LegitxScopeService } from './legitx-scope.service';
import { ReqUser } from '../access/access-scope.service';

describe('LegitX CCO company scope', () => {
  const user = { id: 'cco', userId: 'cco', roleCode: 'CCO' } as ReqUser;
  function setup(clientIds: string[]) {
    const access = {
      getScope: jest.fn().mockResolvedValue({ level: 'all' }),
      getCcoClientIds: jest.fn().mockResolvedValue(clientIds),
    };
    const db = {
      query: jest.fn().mockResolvedValue([{ clientid: 'foreign' }]),
    };
    return {
      access,
      service: new LegitxScopeService(access as any, {} as any, db as any),
    };
  }

  it.each([[], ['assigned']])(
    'rejects a company outside %j',
    async (...ids) => {
      const { service } = setup(ids.filter((id) => id !== undefined));
      await expect(
        service.resolve(user, { clientId: 'foreign' }),
      ).rejects.toThrow(ForbiddenException);
    },
  );

  it('rejects an unassigned company selected indirectly through its branch', async () => {
    await expect(
      setup(['assigned']).service.resolve(user, { branchId: 'foreign-branch' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('preserves an assigned company dashboard', async () => {
    const { service, access } = setup(['assigned']);
    expect(await service.resolve(user, { clientId: 'assigned' })).toEqual({
      clientId: 'assigned',
      branchId: null,
      allowedBranchIds: 'ALL',
    });
    expect(access.getCcoClientIds).toHaveBeenCalledWith('cco');
  });
});
