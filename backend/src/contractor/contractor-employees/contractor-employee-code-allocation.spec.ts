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

/** Mirrors the production path: allocate on the locked transaction. */
const alloc = (service: any, clientId: string, contractorUserId: string) =>
  service.withCodeLock(clientId, (em: any) =>
    service.nextEmployeeCode(em, clientId, contractorUserId),
  );

describe('ContractorEmployeesService code allocation', () => {
  it('uses the plain initials when the prefix is free', async () => {
    const { service } = makeService({ contractorName: 'Sri Balaji Services' });
    await expect(alloc(service, 'c1', 'u1')).resolves.toBe(
      'SBS0001',
    );
  });

  it('advances the last character when another contractor holds the prefix', async () => {
    const { service } = makeService({
      contractorName: 'Sri Balaji Solutions',
      takenByOthers: ['SBS'],
    });
    // SBS belongs to someone else, so this contractor gets SBO.
    await expect(alloc(service, 'c1', 'u2')).resolves.toBe(
      'SBO0001',
    );
  });

  it('keeps skipping until it finds a free prefix', async () => {
    const { service } = makeService({
      contractorName: 'Sri Balaji Services',
      takenByOthers: ['SBS', 'SBE'],
    });
    await expect(alloc(service, 'c1', 'u3')).resolves.toBe(
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
    await expect(alloc(service, 'c1', 'u1')).resolves.toBe(
      'SBE0008',
    );
  });

  it('continues the sequence rather than restarting it', async () => {
    const { service } = makeService({
      contractorName: 'Sri Balaji Services',
      maxSeq: 41,
    });
    await expect(alloc(service, 'c1', 'u1')).resolves.toBe(
      'SBS0042',
    );
  });

  it('returns null for a contractor name with no letters', async () => {
    const { service } = makeService({ contractorName: '12345' });
    await expect(alloc(service, 'c1', 'u1')).resolves.toBeNull();
  });

  it('takes the per-client lock before reading, not after', async () => {
    const { service, queries } = makeService({
      contractorName: 'Sri Balaji Services',
    });
    await alloc(service, 'c1', 'u1');
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
  const queries: string[] = [];
  let allocSeq = 0;

  const run = async (sql: string, params: any[]) => {
    queries.push(sql);
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
  return { service, updates, dataSource, queries };
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
    const { service, queries } = makeBackfillService({
      nullRows: [{ id: 'e1', contractor_user_id: 'u1' }],
    });
    await service.backfillEmployeeCodes('c1');
    const update = queries.find((q) =>
      q.startsWith('UPDATE contractor_employees'),
    );
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

/**
 * Regressions for three review findings. Each was a way a duplicate or a failed
 * row could get past the design as originally written.
 */
describe('ContractorEmployeesService code allocation — review regressions', () => {
  function makeCreateService(ownCode?: string) {
    const queries: string[] = [];
    const saved: any[] = [];
    const run = async (sql: string) => {
      queries.push(sql);
      if (sql.includes('FROM users')) return [{ name: 'Sri Balaji Services' }];
      if (sql.includes('contractor_user_id = $2')) {
        return ownCode ? [{ code: ownCode }] : [];
      }
      if (sql.includes('MAX(')) return [{ seq: 1 }];
      return [];
    };
    const em = {
      query: jest.fn(run),
      create: jest.fn((_e: any, v: any) => v),
      save: jest.fn(async (v: any) => {
        // A marker in the same stream as the SQL, so the test can prove the row
        // was written while the lock was held rather than after COMMIT.
        queries.push('SAVE');
        saved.push({ value: v });
        return { id: 'new', ...v };
      }),
    };
    const dataSource = {
      query: jest.fn(run),
      transaction: jest.fn(async (cb: any) => {
        const out = await cb(em);
        queries.push('COMMIT');
        return out;
      }),
    };
    const service = new ContractorEmployeesService(
      {} as any,
      { validateSalary: jest.fn(), checkSalary: jest.fn() } as any,
      { findOne: jest.fn().mockResolvedValue(null) } as any,
      { findOne: jest.fn().mockResolvedValue({ id: 'link' }) } as any,
      dataSource as any,
    );
    return { service, em, queries, saved };
  }

  it('writes the row inside the locked transaction, before COMMIT', async () => {
    // The original bug: allocation committed (releasing the advisory lock) and
    // the insert happened afterwards, so a second writer could read the same
    // MAX before this row existed.
    const { service, queries, saved } = makeCreateService();
    await service.create('c1', 'b1', 'u1', { name: 'Ravi' } as any);

    expect(saved).toHaveLength(1);
    const saveAt = queries.indexOf('SAVE');
    const commitAt = queries.indexOf('COMMIT');
    expect(saveAt).toBeGreaterThanOrEqual(0);
    expect(saveAt).toBeLessThan(commitAt);
    expect(saved[0].value.employeeCode).toBe('SBS0001');
  });

  it('ignores a reused prefix that could not have been generated', async () => {
    // A hand-typed "A(001" would otherwise become the regex ^A([0-9]+$, which
    // is invalid and would fail every later allocation for that contractor.
    const { service, saved } = makeCreateService('A(001');
    await service.create('c1', 'b1', 'u1', { name: 'Ravi' } as any);

    // Falls back to a generated prefix rather than reusing the malformed one.
    expect(saved[0].value.employeeCode).toBe('SBS0001');
  });

  it('accepts a numeric employeeCode without throwing on trim', async () => {
    // Bulk rows are not DTO-coerced, so a spreadsheet can deliver a number.
    const { service, saved } = makeCreateService();
    await service.create('c1', 'b1', 'u1', {
      name: 'Ravi',
      employeeCode: 12345,
    } as any);

    expect(saved[0].value.employeeCode).toBe('12345');
  });
});
