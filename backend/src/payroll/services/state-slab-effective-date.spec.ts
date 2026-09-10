import { StateSlabService, SHARED_SLAB_CLIENT_ID } from './state-slab.service';

/**
 * Which generation of a state's PT/LWF slabs a payroll month is measured
 * against.
 *
 * The table had no period columns and resolveAmount() took no date, so a state
 * could hold exactly one version of its rates. Revising one mid-year meant
 * overwriting the old rows — reprocessing an earlier month then produced the
 * new figure for a month it never applied to — and keeping both versions side
 * by side was worse, because the band match took whichever row sorted first.
 *
 * A missing slab still resolves to 0. That is deliberate: PT and LWF do not
 * apply in every state, and there is no way to tell "this state has no PT" from
 * "nobody configured it yet" without master data that says so.
 */
describe('state slabs — effective dates', () => {
  const slab = (
    fromAmount: number,
    valueAmount: number,
    effectiveFrom: string,
    effectiveTo: string | null = null,
  ) => ({
    clientId: 'c1',
    stateCode: 'KA',
    componentCode: 'PT',
    fromAmount: String(fromAmount),
    toAmount: null,
    valueAmount: String(valueAmount),
    valuePercent: null,
    effectiveFrom,
    effectiveTo,
  });

  const makeService = (rows: any[]) =>
    new StateSlabService({
      find: async ({ where }: any) =>
        where.clientId === 'c1' && where.stateCode === 'KA' ? rows : [],
    } as any);

  const resolve = (svc: StateSlabService, asOfDate?: string) =>
    svc.resolveAmount({
      clientId: 'c1',
      stateCode: 'KA',
      componentCode: 'PT',
      baseAmount: 25000,
      asOfDate,
    });

  it('uses the rate that applied to the month being processed', async () => {
    const svc = makeService([
      slab(0, 200, '2025-04-01', '2026-03-31'),
      slab(0, 300, '2026-04-01'),
    ]);

    // A March run reprocessed today must still produce March's figure.
    await expect(resolve(svc, '2026-03-01')).resolves.toBe(200);
    await expect(resolve(svc, '2026-04-01')).resolves.toBe(300);
  });

  it('ignores a revision that has not started yet', async () => {
    const svc = makeService([
      slab(0, 200, '2025-04-01'),
      slab(0, 300, '2027-04-01'),
    ]);
    await expect(resolve(svc, '2026-06-01')).resolves.toBe(200);
  });

  it('prefers the newest generation when an old row was never closed off', async () => {
    // Both are "in force" on the date because nobody set effective_to on the
    // superseded row. Without picking the newest, the band match would take
    // whichever sorted first.
    const svc = makeService([
      slab(0, 200, '2025-04-01'),
      slab(0, 300, '2026-04-01'),
    ]);
    await expect(resolve(svc, '2026-06-01')).resolves.toBe(300);
  });

  it('resolves 0 when nothing is in force for that period', async () => {
    const svc = makeService([slab(0, 300, '2026-04-01')]);
    await expect(resolve(svc, '2025-06-01')).resolves.toBe(0);
  });

  it('resolves 0 when the state has no slabs at all', async () => {
    const svc = makeService([]);
    await expect(resolve(svc, '2026-06-01')).resolves.toBe(0);
  });

  it('falls back to today when the caller gives no period', async () => {
    const svc = makeService([slab(0, 300, '2000-01-01')]);
    await expect(resolve(svc)).resolves.toBe(300);
  });

  it('ignores a malformed date rather than filtering everything out', async () => {
    // A bad string must not silently zero a statutory deduction.
    const svc = makeService([slab(0, 300, '2000-01-01')]);
    await expect(resolve(svc, 'not-a-date')).resolves.toBe(300);
  });

  it('still walks the shared-default fallback chain', async () => {
    const svc = new StateSlabService({
      find: async ({ where }: any) =>
        where.clientId === SHARED_SLAB_CLIENT_ID && where.stateCode === 'KA'
          ? [slab(0, 150, '2025-04-01')]
          : [],
    } as any);

    await expect(
      svc.resolveAmount({
        clientId: 'c1',
        stateCode: 'KA',
        componentCode: 'PT',
        baseAmount: 25000,
        asOfDate: '2026-06-01',
      }),
    ).resolves.toBe(150);
  });
});
