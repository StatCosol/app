import { ServiceUnavailableException } from '@nestjs/common';
import { AuthService } from './auth.service';

function requestContext(overrides: Record<string, unknown> = {}) {
  return {
    logger: { error: jest.fn(), warn: jest.fn(), log: jest.fn() },
    usersRepo: {
      findOne: jest.fn().mockResolvedValue({
        id: 'fixture',
        email: 'fixture@example.test',
        sessionVersion: 0,
      }),
    },
    jwt: { signAsync: jest.fn().mockResolvedValue('synthetic-token') },
    config: { get: (_k: string, d?: string) => d },
    emailService: {
      isEnabled: () => true,
      send: jest.fn().mockResolvedValue({ ok: true, messageId: 'm1' }),
    },
    ...overrides,
  };
}

describe('Password reset email delivery', () => {
  it('sends the reset link and reports success', async () => {
    const ctx = requestContext();
    await expect(
      AuthService.prototype.requestPasswordReset.call(ctx as any, {
        email: ' Fixture@Example.test ',
      }),
    ).resolves.toEqual({ ok: true });
    expect(ctx.emailService.send).toHaveBeenCalledTimes(1);
    expect(ctx.emailService.send.mock.calls[0][3]).toContain(
      '/reset-password?token=synthetic-token',
    );
  });

  it('fails visibly when email is switched off, without looking up the user', async () => {
    const ctx = requestContext({
      emailService: { isEnabled: () => false, send: jest.fn() },
    });
    await expect(
      AuthService.prototype.requestPasswordReset.call(ctx as any, {
        email: 'fixture@example.test',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(ctx.usersRepo.findOne).not.toHaveBeenCalled();
  });

  it('fails visibly when the SMTP send fails', async () => {
    const ctx = requestContext();
    ctx.emailService.send.mockResolvedValue({
      ok: false,
      error: '535 Authentication Failed',
    });
    await expect(
      AuthService.prototype.requestPasswordReset.call(ctx as any, {
        email: 'fixture@example.test',
      }),
    ).rejects.toThrow('could not send the password reset email');
    expect(ctx.logger.error).toHaveBeenCalledWith(
      expect.stringContaining('535 Authentication Failed'),
    );
  });

  it('still answers ok for an unknown address when email works', async () => {
    const ctx = requestContext();
    ctx.usersRepo.findOne.mockResolvedValue(null);
    await expect(
      AuthService.prototype.requestPasswordReset.call(ctx as any, {
        email: 'nobody@example.test',
      }),
    ).resolves.toEqual({ ok: true });
    expect(ctx.emailService.send).not.toHaveBeenCalled();
  });
});

describe('Password reset clears login lockout', () => {
  it('lifts the failed-login lockout after a successful reset', async () => {
    const resetLoginAttempts = jest.fn().mockResolvedValue(undefined);
    const ctx = {
      verifyToken: async () => ({ sub: 'fixture', sessionVersion: 0 }),
      usersRepo: {
        findOne: async () => ({
          id: 'fixture',
          email: 'fixture@example.test',
          isActive: true,
          sessionVersion: 0,
        }),
        update: jest.fn().mockResolvedValue({ affected: 1 }),
      },
      resetLoginAttempts,
      notifyAdminsOfPasswordReset: jest.fn().mockResolvedValue(undefined),
    };
    await expect(
      AuthService.prototype.resetPassword.call(ctx as any, {
        token: 'fixture',
        newPassword: 'Fixture@not-used-1',
      }),
    ).resolves.toEqual({ ok: true });
    expect(resetLoginAttempts).toHaveBeenCalledWith('fixture@example.test');
  });
});
