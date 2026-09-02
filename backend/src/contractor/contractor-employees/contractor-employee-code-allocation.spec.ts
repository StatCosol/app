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
