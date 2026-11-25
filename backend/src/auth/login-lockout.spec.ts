import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

/**
 * The per-account lockout is shared through Postgres so that all backend
 * replicas count the same failures and a deploy does not clear them. (The SQL
 * was also run against a real Postgres 16 while writing this change.)
 */
describe('login lockout shared across replicas', () => {
  function service(query: jest.Mock) {
    const svc: any = Object.create(AuthService.prototype);
    svc.dataSource = { query };
    svc.logger = { warn: jest.fn() };
    return svc;
  }

  it('records a failure with one atomic upsert keyed by the normalised email', async () => {
    const query = jest.fn().mockResolvedValue([]);
    await service(query).recordLoginFailure('  Someone@Example.COM ');
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('ON CONFLICT (lock_key) DO UPDATE'),
      ['someone@example.com', 900, 5, 900],
    );
  });

  it('refuses login while the shared row says the account is locked', async () => {
    const lockedUntil = new Date(Date.now() + 10 * 60000);
    const query = jest.fn().mockResolvedValue([{ locked_until: lockedUntil }]);
    await expect(
      service(query).assertNotLocked('someone@example.com'),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('allows login when no lock row is active', async () => {
    const query = jest.fn().mockResolvedValue([]);
    await expect(
      service(query).assertNotLocked('someone@example.com'),
    ).resolves.toBeUndefined();
  });

  it('falls back to in-memory counting when the table cannot be reached', async () => {
    const query = jest.fn().mockRejectedValue(new Error('down'));
    const svc = service(query);
    for (let i = 0; i < 5; i++)
      await svc.recordLoginFailure('fallback@example.com');
    await expect(svc.assertNotLocked('fallback@example.com')).rejects.toThrow(
      'temporarily locked',
    );
    await svc.resetLoginAttempts('fallback@example.com');
    await expect(
      svc.assertNotLocked('fallback@example.com'),
    ).resolves.toBeUndefined();
  });
});
