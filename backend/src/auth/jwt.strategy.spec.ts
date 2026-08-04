import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy branch scope', () => {
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
      roleCode: 'CLIENT',
      clientId: 'client-1',
      branchIds: ['branch-stale'],
    });

    expect(usersService.getUserBranchIds).toHaveBeenCalledWith('user-1');
    expect(result.branchIds).toEqual(['branch-live']);
    expect(result.userType).toBe('BRANCH');
  });
});
