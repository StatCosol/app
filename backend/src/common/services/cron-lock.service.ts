import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { createHash } from 'crypto';

/**
 * Distributed cron-lock backed by PostgreSQL advisory locks.
 *
 * When the backend is scaled to >1 replica, every replica receives the same
 * @Cron tick. Wrapping the job body in `runExclusive(name, fn)` guarantees
 * exactly one replica executes; the others fast-skip.
 *
 * Advisory locks are session-scoped, so we use a dedicated short-lived
 * connection per call (try-lock + unlock on the same query runner) to avoid
 * leaking the lock if the caller forgets to release.
 */
@Injectable()
export class CronLockService {
  private readonly logger = new Logger(CronLockService.name);

  constructor(private readonly ds: DataSource) {}

  /**
   * Hash an arbitrary string to a signed bigint usable by
   * `pg_try_advisory_lock(bigint)`. Top bit cleared to keep it positive
   * (Postgres bigint is signed but the helper accepts negative too).
   */
  private keyFor(name: string): string {
    const h = createHash('sha1').update(name).digest();
    // take first 8 bytes, mask high bit
    const buf = Buffer.from(h.subarray(0, 8));
    buf[0] &= 0x7f;
    return buf.readBigInt64BE().toString();
  }

  /**
   * Try to acquire the lock named `name` and run `fn` if successful.
   * Returns the function result, or `undefined` if the lock was held by
   * another replica (job was skipped this tick).
   */
  async runExclusive<T>(
    name: string,
    fn: () => Promise<T>,
  ): Promise<T | undefined> {
    const key = this.keyFor(name);
    const qr = this.ds.createQueryRunner();
    await qr.connect();
    try {
      const rows: Array<{ pg_try_advisory_lock: boolean }> = await qr.query(
        'SELECT pg_try_advisory_lock($1) ',
        [key],
      );
      const acquired = !!rows?.[0]?.pg_try_advisory_lock;
      if (!acquired) {
        this.logger.log(`skip ${name}: lock held by another replica`);
        return undefined;
      }
      try {
        return await fn();
      } finally {
        try {
          await qr.query('SELECT pg_advisory_unlock($1)', [key]);
        } catch (err) {
          this.logger.warn(
            `failed to release advisory lock for ${name}: ${(err as Error).message}`,
          );
        }
      }
    } finally {
      await qr.release();
    }
  }
}
