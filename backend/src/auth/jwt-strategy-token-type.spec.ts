import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';

/**
 * Only an access token authenticates an API call.
 *
 * Access, refresh and password-reset tokens are all signed with the same
 * JWT_SECRET and are distinguished only by their `type` claim. The strategy
 * guarding every protected route did not look at it, so a refresh token — good
 * for 14 days — worked as an API credential, and so did a reset token, which is
 * emailed and therefore lives in mail logs, browser history and referrers.
 *
 * The /uploads middleware in main.ts and FilesController already made this
 * check; the strategy in front of everything else did not.
 */
describe('JwtStrategy — token type', () => {
  const makeStrategy = () => {
    const usersService = {
      findById: jest.fn().mockResolvedValue({
        id: 'u1',
        email: 'user@example.com',
        isActive: true,
        deletedAt: null,
        clientId: 'c1',
        userType: null,
        employeeId: null,
      }),
      getUserRoleCode: jest.fn().mockResolvedValue('CCO'),
      getUserBranchIds: jest.fn().mockResolvedValue([]),
      getAssignedClientIds: jest.fn().mockResolvedValue([]),
      getPayrollAssignedClientIds: jest.fn().mockResolvedValue([]),
    };
    const config = { getOrThrow: () => 'test-secret' };
    return {
      strategy: new JwtStrategy(usersService as any, config as any),
      usersService,
    };
  };

  const payload = (type?: string) => ({
    sub: 'u1',
    roleCode: 'CCO',
    email: 'user@example.com',
    clientId: 'c1',
    ...(type ? { type } : {}),
  });

  it('accepts an access token', async () => {
    const { strategy } = makeStrategy();
    const user = await strategy.validate(payload('access') as any);
    expect(user).toMatchObject({ userId: 'u1', roleCode: 'CCO' });
  });

  it('rejects a refresh token used as an API credential', async () => {
    const { strategy } = makeStrategy();
    await expect(strategy.validate(payload('refresh') as any)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a password-reset token used as an API credential', async () => {
    const { strategy } = makeStrategy();
    await expect(strategy.validate(payload('reset') as any)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a token with no type at all', async () => {
    const { strategy } = makeStrategy();
    await expect(strategy.validate(payload() as any)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('refuses before looking the user up', async () => {
    // The type check is cheap and must not cost a database round trip, and a
    // rejected credential should leave no trace of a successful lookup.
    const { strategy, usersService } = makeStrategy();
    await expect(
      strategy.validate(payload('refresh') as any),
    ).rejects.toThrow();
    expect(usersService.findById).not.toHaveBeenCalled();
  });
});
