import { StateSlabService, SHARED_SLAB_CLIENT_ID } from './state-slab.service';

/**
 * StateSlabService tests — professional-tax / LWF slab resolution.
 *
 * Exercises the four-tier fallback chain (per-client state → per-client ALL →
 * shared-default state → shared-default ALL) and slab matching (range +
 * fixed-amount vs percentage) against a mocked repository.
 */

type Slab = {
  fromAmount: number | string;
  toAmount: number | string | null;
  valueAmount: number | string | null;
  valuePercent: number | string | null;
};

const slab = (
  fromAmount: number,
  toAmount: number | null,
  valueAmount: number | null,
  valuePercent: number | null = null,
): Slab => ({ fromAmount, toAmount, valueAmount, valuePercent });

/** Repo whose find() returns rows keyed by `${clientId}::${stateCode}`. */
function repoWith(dataset: Record<string, Slab[]>) {
  return {
    find: jest.fn(
      async ({ where }: { where: { clientId: string; stateCode: string } }) =>
        dataset[`${where.clientId}::${where.stateCode}`] ?? [],
    ),
  };
}

const CLIENT = 'client-1';
const build = (dataset: Record<string, Slab[]>) => {
  const repo = repoWith(dataset);
  return { svc: new StateSlabService(repo as never), repo };
};
const resolve = (
  svc: StateSlabService,
  stateCode: string,
  baseAmount: number,
) =>
  svc.resolveAmount({
    clientId: CLIENT,
    stateCode,
    componentCode: 'PT',
    baseAmount,
  });

describe('StateSlabService.resolveAmount — fallback chain', () => {
  it('uses a per-client, state-specific slab first', async () => {
    const { svc, repo } = build({ [`${CLIENT}::MH`]: [slab(0, null, 200)] });
    await expect(resolve(svc, 'MH', 25000)).resolves.toBe(200);
    expect(repo.find).toHaveBeenCalledTimes(1); // no fallback needed
  });

  it('falls back to the per-client ALL slab', async () => {
    const { svc } = build({ [`${CLIENT}::ALL`]: [slab(0, null, 150)] });
    await expect(resolve(svc, 'MH', 25000)).resolves.toBe(150);
  });

  it('falls back to shared-default state-specific slabs', async () => {
    const { svc } = build({
      [`${SHARED_SLAB_CLIENT_ID}::KA`]: [slab(0, null, 100)],
    });
    await expect(resolve(svc, 'KA', 25000)).resolves.toBe(100);
  });

  it('falls back to shared-default ALL slabs', async () => {
    const { svc } = build({
      [`${SHARED_SLAB_CLIENT_ID}::ALL`]: [slab(0, null, 50)],
    });
    await expect(resolve(svc, 'TN', 25000)).resolves.toBe(50);
  });

  it('returns 0 when no slab is found anywhere', async () => {
    const { svc } = build({});
    await expect(resolve(svc, 'MH', 25000)).resolves.toBe(0);
  });
});

describe('StateSlabService.resolveAmount — slab matching', () => {
  const ptSlabs = {
    [`${CLIENT}::MH`]: [
      slab(0, 7500, 0),
      slab(7501, 10000, 175),
      slab(10001, null, 200),
    ],
  };

  it('selects the band matching the base amount', async () => {
    const { svc } = build(ptSlabs);
    await expect(resolve(svc, 'MH', 5000)).resolves.toBe(0);
    await expect(resolve(svc, 'MH', 8000)).resolves.toBe(175);
    await expect(resolve(svc, 'MH', 25000)).resolves.toBe(200);
  });

  it('computes a percentage when only valuePercent is set', async () => {
    const { svc } = build({ [`${CLIENT}::MH`]: [slab(0, null, null, 2)] });
    await expect(resolve(svc, 'MH', 10000)).resolves.toBe(200); // 2% of 10,000
  });

  it('prefers a fixed valueAmount over valuePercent', async () => {
    const { svc } = build({ [`${CLIENT}::MH`]: [slab(0, null, 300, 2)] });
    await expect(resolve(svc, 'MH', 10000)).resolves.toBe(300);
  });

  it('returns 0 when the base amount falls outside every band', async () => {
    const { svc } = build({ [`${CLIENT}::MH`]: [slab(7501, 10000, 175)] });
    await expect(resolve(svc, 'MH', 5000)).resolves.toBe(0);
  });
});

describe('StateSlabService.listEffective — source tier', () => {
  const list = (svc: StateSlabService, stateCode: string) =>
    svc.listEffective({ clientId: CLIENT, stateCode, componentCode: 'PT' });

  it('reports CLIENT for a per-client state match', async () => {
    const { svc } = build({ [`${CLIENT}::MH`]: [slab(0, null, 200)] });
    await expect(list(svc, 'MH')).resolves.toMatchObject({ source: 'CLIENT' });
  });

  it('reports SHARED when only shared-default state slabs exist', async () => {
    const { svc } = build({
      [`${SHARED_SLAB_CLIENT_ID}::KA`]: [slab(0, null, 100)],
    });
    await expect(list(svc, 'KA')).resolves.toMatchObject({ source: 'SHARED' });
  });

  it('reports NONE with an empty slab list when nothing matches', async () => {
    const { svc } = build({});
    const res = await list(svc, 'MH');
    expect(res.source).toBe('NONE');
    expect(res.slabs).toEqual([]);
  });
});
