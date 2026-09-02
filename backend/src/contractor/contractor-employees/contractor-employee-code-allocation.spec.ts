import { ContractorEmployeesService } from './contractor-employees.service';

/**
 * Allocation behaviour, as distinct from the naming rule (covered in
 * contractor-employee-code.util.spec.ts).
 *
 * The queries are stubbed by shape rather than by a real database: what matters
 * here is which prefix gets chosen and what sequence lands on it.
 */
function makeService(opts: {
  contractorName: string;
  /** An existing code already held by THIS contractor, if any. */
  ownCode?: string | null;
  /** Prefixes already taken by OTHER contractors in the same client. */
  takenByOthers?: string[];
  /** Highest sequence already used under the chosen prefix. */
  maxSeq?: number;
}) {
  const taken = new Set(opts.takenByOthers ?? []);
  const queries: string[] = [];

  const run = async (sql: string, params: any[]) => {
    queries.push(sql);
    if (sql.includes('FROM users')) return [{ name: opts.contractorName }];
    if (sql.includes('pg_advisory_xact_lock')) return [{}];
    if (sql.includes('contractor_user_id = $2')) {
      return opts.ownCode ? [{ code: opts.ownCode }] : [];
    }
    if (sql.includes('contractor_user_id <> $2')) {
      return taken.has(params[2]) ? [{ '?column?': 1 }] : [];
    }
    if (sql.includes('MAX(')) return [{ seq: (opts.maxSeq ?? 0) + 1 }];
    return [];
  };

  const dataSource = {
    query: jest.fn(run),
    transaction: jest.fn(async (cb: any) => cb({ query: jest.fn(run) })),
  };

  const service = new ContractorEmployeesService(
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    dataSource as any,
  );
  return { service, dataSource, queries };
}

describe('ContractorEmployeesService.allocateEmployeeCode', () => {
  it('uses the plain initials when the prefix is free', async () => {
    const { service } = makeService({ contractorName: 'Sri Balaji Services' });
    await expect(service.allocateEmployeeCode('c1', 'u1')).resolves.toBe(
      'SBS0001',
    );
  });

  it('advances the last character when another contractor holds the prefix', async () => {
    const { service } = makeService({
      contractorName: 'Sri Balaji Solutions',
      takenByOthers: ['SBS'],
    });
    // SBS belongs to someone else, so this contractor gets SBO.
    await expect(service.allocateEmployeeCode('c1', 'u2')).resolves.toBe(
      'SBO0001',
    );
  });

  it('keeps skipping until it finds a free prefix', async () => {
    const { service } = makeService({
      contractorName: 'Sri Balaji Services',
      takenByOthers: ['SBS', 'SBE'],
    });
    await expect(service.allocateEmployeeCode('c1', 'u3')).resolves.toBe(
      'SBR0001',
    );
  });

  it('reuses the prefix this contractor is already on', async () => {
    // Their first worker got SBE; the rest must stay on SBE, not drift back to
    // SBS just because it later became free.
    const { service } = makeService({
      contractorName: 'Sri Balaji Services',
      ownCode: 'SBE0007',
      maxSeq: 7,
    });
    await expect(service.allocateEmployeeCode('c1', 'u1')).resolves.toBe(
      'SBE0008',
    );
  });

  it('continues the sequence rather than restarting it', async () => {
    const { service } = makeService({
      contractorName: 'Sri Balaji Services',
      maxSeq: 41,
    });
    await expect(service.allocateEmployeeCode('c1', 'u1')).resolves.toBe(
      'SBS0042',
    );
  });

  it('returns null for a contractor name with no letters', async () => {
    const { service } = makeService({ contractorName: '12345' });
    await expect(service.allocateEmployeeCode('c1', 'u1')).resolves.toBeNull();
  });

  it('takes the per-client lock before reading, not after', async () => {
    const { service, queries } = makeService({
      contractorName: 'Sri Balaji Services',
    });
    await service.allocateEmployeeCode('c1', 'u1');
    const lock = queries.findIndex((q) => q.includes('pg_advisory_xact_lock'));
    const max = queries.findIndex((q) => q.includes('MAX('));
    // Reading MAX outside the lock is exactly how two writers collide.
    expect(lock).toBeGreaterThanOrEqual(0);
    expect(lock).toBeLessThan(max);
  });
});

/**
 * Backfill of workers that predate code generation. The point of these is that
 * the operation is safe to re-run and never rewrites a code that already
 * exists — those are on historical payroll records.
 */
function makeBackfillService(opts: {
  nullRows: Array<{ id: string; contractor_user_id: string }>;
  contractorName?: string;
  remaining?: number;
}) {
  const updates: Array<{ code: string; id: string }> = [];
  let allocSeq = 0;

  const run = async (sql: string, params: any[]) => {
    if (sql.includes('employee_code IS NULL') && sql.includes('SELECT id')) {
      return opts.nullRows;
    }
    if (sql.includes('FROM users')) {
      return [{ name: opts.contractorName ?? 'Sri Balaji Services' }];
    }
    if (sql.includes('pg_advisory_xact_lock')) return [{}];
    if (sql.includes('contractor_user_id = $2')) return [];
    if (sql.includes('contractor_user_id <> $2')) return [];
    if (sql.includes('MAX(')) return [{ seq: ++allocSeq }];
    if (sql.startsWith('UPDATE contractor_employees')) {
      updates.push({ code: params[0], id: params[1] });
      return [];
    }
    if (sql.includes('COUNT(*)')) return [{ n: opts.remaining ?? 0 }];
    return [];
  };

  const dataSource = {
    query: jest.fn(run),
    transaction: jest.fn(async (cb: any) => cb({ query: jest.fn(run) })),
  };
  const service = new ContractorEmployeesService(
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    dataSource as any,
  );
  return { service, updates, dataSource };
}

describe('ContractorEmployeesService.backfillEmployeeCodes', () => {
  it('codes every row that has none', async () => {
    const { service, updates } = makeBackfillService({
      nullRows: [
        { id: 'e1', contractor_user_id: 'u1' },
        { id: 'e2', contractor_user_id: 'u1' },
      ],
    });
    const res = await service.backfillEmployeeCodes('c1');

    expect(res).toMatchObject({ scanned: 2, coded: 2, skippedNoName: 0 });
    expect(updates.map((u) => u.code)).toEqual(['SBS0001', 'SBS0002']);
  });

  it('only ever writes where the code is still NULL', async () => {
    // The guard is in the UPDATE itself, so a row coded by a concurrent create
    // between the SELECT and the UPDATE is not overwritten.
    const { service, dataSource } = makeBackfillService({
      nullRows: [{ id: 'e1', contractor_user_id: 'u1' }],
    });
    await service.backfillEmployeeCodes('c1');
    const update = dataSource.query.mock.calls
      .map((c: any[]) => c[0])
      .find((q: string) => q.startsWith('UPDATE contractor_employees'));
    expect(update).toContain('employee_code IS NULL');
  });

  it('leaves a worker uncoded when the contractor name has no letters', async () => {
    const { service, updates } = makeBackfillService({
      nullRows: [{ id: 'e1', contractor_user_id: 'u1' }],
      contractorName: '9999',
    });
    const res = await service.backfillEmployeeCodes('c1');

    // A bare number would be worse than no code at all.
    expect(res).toMatchObject({ coded: 0, skippedNoName: 1 });
    expect(updates).toHaveLength(0);
  });

  it('reports what is left so the caller knows to run again', async () => {
    const { service } = makeBackfillService({
      nullRows: [{ id: 'e1', contractor_user_id: 'u1' }],
      remaining: 57,
    });
    await expect(service.backfillEmployeeCodes('c1', 1)).resolves.toMatchObject(
      { remaining: 57 },
    );
  });

  it('is a no-op when nothing is uncoded', async () => {
    const { service, updates } = makeBackfillService({ nullRows: [] });
    const res = await service.backfillEmployeeCodes('c1');
    expect(res).toMatchObject({ scanned: 0, coded: 0, remaining: 0 });
    expect(updates).toHaveLength(0);
  });
});
