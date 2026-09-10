import { HttpStatus } from '@nestjs/common';
import { HealthController } from './health.controller';

/**
 * Liveness and readiness answer different questions and want opposite
 * behaviour when the database is down.
 *
 * /health is what the Dockerfile HEALTHCHECK polls, so failing it on a database
 * outage restarts the container — turning an outage into a crash loop that
 * cannot fix itself. It stays 200. Readiness is the one a load balancer should
 * read, and it had no separate endpoint at all: a status-based probe on /health
 * got 200 with `{"ok": false}` buried in the body and kept a
 * database-disconnected instance in rotation.
 */
describe('health endpoints', () => {
  const makeController = (dbUp: boolean) =>
    new HealthController({
      query: jest.fn(async () => {
        if (!dbUp) throw new Error('ECONNREFUSED');
        return [{ '?column?': 1 }];
      }),
    } as any);

  const fakeRes = () => {
    const res: any = { statusCode: 200 };
    res.status = jest.fn((code: number) => {
      res.statusCode = code;
      return res;
    });
    return res;
  };

  describe('liveness', () => {
    it('reports the database in the body when it is down', async () => {
      const body = await makeController(false).health();
      expect(body.ok).toBe(false);
      expect(body.db).toBe('unreachable');
    });

    it('does not fail — the container must not be restarted for a db outage', async () => {
      // There is no status to assert: returning normally is a 200, which is
      // the whole point. If this ever starts throwing, the healthcheck kills
      // the container during every database blip.
      await expect(makeController(false).health()).resolves.toBeDefined();
    });

    it('reports connected when the database answers', async () => {
      const body = await makeController(true).health();
      expect(body).toMatchObject({ ok: true, db: 'connected' });
    });
  });

  describe('readiness', () => {
    it('answers 503 when the database is unreachable', async () => {
      const res = fakeRes();
      const body = await makeController(false).ready(res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
      expect(body.ok).toBe(false);
    });

    it('leaves the status alone when the database is up', async () => {
      const res = fakeRes();
      const body = await makeController(true).ready(res);

      expect(res.status).not.toHaveBeenCalled();
      expect(body.ok).toBe(true);
    });
  });
});
