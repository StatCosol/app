import { ForbiddenException } from '@nestjs/common';
import { OperationalScopeService } from './operational-scope.service';

describe('Operational scope policy', () => {
  function setup(scope: any, roleCode = 'CRM') {
    const access = {
      getScope: jest.fn().mockResolvedValue(scope),
      getCcoClientIds: jest.fn().mockResolvedValue(['managed']),
      assertClientAllowed: jest.fn(),
      assertBranchAllowed: jest.fn(),
      assertCcoClientAllowed: jest.fn(),
      assertCcoBranchAllowed: jest.fn(),
    };
    return {
      access,
      service: new OperationalScopeService(access as any),
      user: { id: 'u', userId: 'u', roleCode } as any,
    };
  }
  it.each(['ADMIN', 'CEO'])(
    '%s retains global operational oversight',
    async (role) => {
      const { service, user } = setup({ level: 'all' }, role);
      expect(await service.where(user)).toEqual({});
    },
  );
  it('CCO uses managed CRM companies even though generic scope is global', async () => {
    const { service, user, access } = setup({ level: 'all' }, 'CCO');
    expect(await service.resolve(user)).toEqual({
      level: 'clients',
      clientIds: ['managed'],
    });
    expect(access.getScope).not.toHaveBeenCalled();
    await expect(
      service.assertRecord(user, { clientId: 'outside' }),
    ).rejects.toThrow(ForbiddenException);
  });
  it.each(['CRM', 'AUDITOR', 'PAYROLL'])(
    '%s cannot list or update an unassigned company',
    async (role) => {
      const { service, user } = setup(
        { level: 'clients', clientIds: ['allowed'] },
        role,
      );
      await expect(service.where(user, 'outside')).rejects.toThrow(
        ForbiddenException,
      );
      await expect(
        service.assertRecord(user, { clientId: 'outside', branchId: 'b' }),
      ).rejects.toThrow(ForbiddenException);
      const where: any = await service.where(user);
      expect(where.clientId.value).toEqual(['allowed']);
    },
  );
  it('empty assignments never produce an unrestricted query', async () => {
    const { service, user } = setup({ level: 'clients', clientIds: [] });
    const where: any = await service.where(user);
    expect(where.clientId.value).toEqual([]);
  });
  it('branch scope includes all assignments, but excludes company-wide and unassigned records', async () => {
    const { service, user } = setup(
      { level: 'branches', clientId: 'c', branchIds: ['a', 'b'] },
      'BRANCH_DESK',
    );
    const where: any = await service.where(user);
    expect(where.clientId).toBe('c');
    expect(where.branchId.value).toEqual(['a', 'b']);
    await service.assertRecord(user, { clientId: 'c', branchId: 'b' });
    await expect(
      service.assertRecord(user, { clientId: 'c', branchId: null }),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      service.assertRecord(user, { clientId: 'c', branchId: 'x' }),
    ).rejects.toThrow(ForbiddenException);
  });
});
