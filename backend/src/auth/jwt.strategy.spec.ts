import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy branch scope', () => {
  it.each(['TIME_OFFICE_EXECUTIVE', 'TIME_OFFICE_MANAGER'])(
    'uses current company assignment for %s',
    async (roleCode) => {
      const users = {
        findById: jest.fn().mockResolvedValue({
          id: 'office-user',
          clientId: 'current-company',
          isActive: true,
        }),
        getUserRoleCode: jest.fn().mockResolvedValue(roleCode),
      };
      const strategy = new JwtStrategy(
        users as any,
        { getOrThrow: () => 'test-jwt-secret' } as any,
      );
      const result = await strategy.validate({
        sub: 'office-user',
        type: 'access',
        roleCode,
        clientId: 'previous-company',
      });
      expect(result.clientId).toBe('current-company');
    },
  );

  it('uses current database branch mappings instead of stale token mappings', async () => {
    const usersService = {
      findById: jest.fn().mockResolvedValue({
        id: 'user-1',
        email: 'branch@example.com',
        clientId: 'client-1',
        userType: 'BRANCH',
        employeeId: null,
        isActive: true,
        deletedAt: null,
      }),
      getUserRoleCode: jest.fn().mockResolvedValue('CLIENT'),
      getUserBranchIds: jest.fn().mockResolvedValue(['branch-live']),
    };
    const config = {
      getOrThrow: jest.fn().mockReturnValue('test-jwt-secret'),
    };
    const strategy = new JwtStrategy(usersService as any, config as any);

    const result = await strategy.validate({
      sub: 'user-1',
      // Real access tokens have always carried this; the strategy now requires
      // it, so a fixture without it is no longer a realistic access token.
      // Token-type behaviour itself is covered in
      // jwt-strategy-token-type.spec.ts.
      type: 'access',
      roleCode: 'CLIENT',
      clientId: 'client-1',
      branchIds: ['branch-stale'],
    });

    expect(usersService.getUserBranchIds).toHaveBeenCalledWith('user-1');
    expect(result.branchIds).toEqual(['branch-live']);
    expect(result.userType).toBe('BRANCH');
  });
});
