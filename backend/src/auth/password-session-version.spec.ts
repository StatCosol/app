import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { generateSecurePassword } from '../common/secure-password';
describe('Password reset sessions', () => {
  const config = { getOrThrow: () => 'synthetic-test-secret' };
  it.each([undefined, 0, 1])(
    'rejects access issued before reset (version %s)',
    async (sessionVersion) => {
      const strategy = new JwtStrategy(
        { findById: async () => ({ sessionVersion: 2 }) } as any,
        config as any,
      );
      await expect(
        strategy.validate({ sub: 'fixture', type: 'access', sessionVersion }),
      ).rejects.toThrow('Session expired');
    },
  );
  it('accepts current credentials after a reset', async () => {
    const users = {
      findById: async () => ({
        id: 'fixture',
        sessionVersion: 2,
        isActive: true,
      }),
      getUserRoleCode: async () => 'SALES',
    };
    const strategy = new JwtStrategy(users as any, config as any);
    expect(
      (
        await strategy.validate({
          sub: 'fixture',
          type: 'access',
          sessionVersion: 2,
        })
      ).id,
    ).toBe('fixture');
  });
  it('generates policy-compatible high-entropy credentials', () => {
    const values = Array.from({ length: 100 }, generateSecurePassword);
    expect(new Set(values).size).toBe(100);
    for (const password of values)
      expect(password).toMatch(/^Sc@9[A-Za-z0-9_-]{24}$/);
  });
});

describe('Password reset token families', () => {
  it('rejects a pre-reset refresh even if it was read before revocation', async () => {
    const context = {
      verifyToken: async () => ({
        sub: 'fixture',
        jti: 'token',
        sessionVersion: 0,
      }),
      refreshTokenRepo: {
        findOne: async () => ({ id: 'row', family: 'family', revokedAt: null }),
        update: jest.fn(),
      },
      usersRepo: {
        findOne: async () => ({
          id: 'fixture',
          isActive: true,
          sessionVersion: 1,
        }),
      },
    };
    await expect(
      AuthService.prototype.refreshToken.call(context as any, {
        refreshToken: 'fixture',
      }),
    ).rejects.toThrow('Session expired');
  });
  it('rejects reuse of an old password reset link', async () => {
    const update = jest.fn();
    const context = {
      verifyToken: async () => ({ sub: 'fixture', sessionVersion: 0 }),
      usersRepo: {
        findOne: async () => ({
          id: 'fixture',
          isActive: true,
          sessionVersion: 1,
        }),
        update,
      },
    };
    await expect(
      AuthService.prototype.resetPassword.call(context as any, {
        token: 'fixture',
        newPassword: 'Fixture@not-used',
      }),
    ).rejects.toThrow('already been used');
    expect(update).not.toHaveBeenCalled();
  });
});
