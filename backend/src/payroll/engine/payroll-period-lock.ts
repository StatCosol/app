import { ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AsyncLocalStorage } from 'node:async_hooks';

const runLockContext = new AsyncLocalStorage<
  Map<DataSource, Map<string, { active: boolean }>>
>();

/** Hold one connection until the entire run, including its status, is saved. */
export async function withPayrollPeriodLock<T>(
  ds: DataSource,
  periodKey: string,
  work: () => Promise<T>,
  conflictMessage = 'Another intern payroll run for this client and month is processing. Retry when it finishes.',
): Promise<T> {
  const runner = ds.createQueryRunner();
  let acquired = false;
  try {
    await runner.connect();
    const rows = await runner.query(
      'SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS acquired',
      [periodKey],
    );
    acquired = rows[0]?.acquired === true;
    if (!acquired) {
      throw new ConflictException(conflictMessage);
    }
    return await work();
  } finally {
    try {
      if (acquired) {
        await runner.query(
          'SELECT pg_advisory_unlock(hashtextextended($1, 0))',
          [periodKey],
        );
      }
    } finally {
      await runner.release();
    }
  }
}

/** Coordinate calculation and decisions across independent API requests. */
export function withPayrollRunLock<T>(
  ds: DataSource,
  runId: string,
  work: () => Promise<T>,
): Promise<T> {
  // PostgreSQL accepts uppercase, brace-wrapped and hyphenless UUIDs for the
  // same row. All accepted spellings must contend on one advisory-lock key.
  const compactId = runId
    .trim()
    .replace(/^\{|\}$/g, '')
    .replace(/-/g, '');
  const lockId = /^[a-f0-9]{32}$/i.test(compactId)
    ? compactId.toLowerCase()
    : runId;
  const current = runLockContext.getStore();
  // Input endpoints call the engine before returning. Reuse their lock instead
  // of trying to acquire the same key on another pooled connection.
  if (current?.get(ds)?.get(lockId)?.active) return work();
  return withPayrollPeriodLock(
    ds,
    `payroll-run:${lockId}`,
    () => {
      const nested = new Map(current);
      const runs = new Map(current?.get(ds));
      const ownership = { active: true };
      runs.set(lockId, ownership);
      nested.set(ds, runs);
      return runLockContext.run(nested, async () => {
        try {
          return await work();
        } finally {
          ownership.active = false;
        }
      });
    },
    'Another payroll operation is processing this run. Refresh and retry when it finishes.',
  );
}
