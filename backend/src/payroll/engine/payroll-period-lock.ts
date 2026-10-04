import { ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';

/** Hold one connection until the entire run, including its status, is saved. */
export async function withPayrollPeriodLock<T>(
  ds: DataSource,
  periodKey: string,
  work: () => Promise<T>,
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
      throw new ConflictException(
        'Another intern payroll run for this client and month is processing. Retry when it finishes.',
      );
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
