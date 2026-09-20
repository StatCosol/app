import { JwtService } from '@nestjs/jwt';
import { RequestThrottlerGuard } from './request-throttler.guard';

/** getTracker is protected; the test drives it as the guard's own caller. */
type TrackerFn = (req: unknown) => Promise<string>;
const trackerOf = (g: RequestThrottlerGuard): TrackerFn =>
  (g as unknown as { getTracker: TrackerFn }).getTracker.bind(g);

describe('RequestThrottlerGuard', () => {
  const jwt = new JwtService({ secret: 'test-secret-value' });
  const other = new JwtService({ secret: 'a-different-secret' });
  const guard = new RequestThrottlerGuard(
    { throttlers: [] },
    { increment: jest.fn() } as never,
    { get: jest.fn() } as never,
    jwt,
  );
  const tracker = trackerOf(guard);

  const req = (token?: string, ip = '203.0.113.9') => ({
    headers: token ? { authorization: `Bearer ${token}` } : {},
    ip,
    socket: { remoteAddress: ip },
  });

  it('gives two signed-in users separate buckets from the same address', async () => {
    const a = await tracker(req(jwt.sign({ sub: 'user-a' })));
    const b = await tracker(req(jwt.sign({ sub: 'user-b' })));

    expect(a).toBe('user:user-a');
    expect(b).toBe('user:user-b');
    expect(a).not.toBe(b);
  });

  it('keys on the user, not the address, so one user is not split across devices', async () => {
    const token = jwt.sign({ sub: 'user-a' });
    expect(await tracker(req(token, '203.0.113.9'))).toBe(
      await tracker(req(token, '198.51.100.4')),
    );
  });

  it('falls back to the address for anonymous callers, e.g. login', async () => {
    expect(await tracker(req(undefined, '203.0.113.9'))).toBe('ip:203.0.113.9');
  });

  it('ignores a token it cannot verify, so a forged sub cannot mint buckets', async () => {
    const forged = other.sign({ sub: 'user-a' });
    expect(await tracker(req(forged, '203.0.113.9'))).toBe('ip:203.0.113.9');
  });

  it('separates anonymous callers by address', async () => {
    expect(await tracker(req(undefined, '203.0.113.9'))).not.toBe(
      await tracker(req(undefined, '198.51.100.4')),
    );
  });
});
