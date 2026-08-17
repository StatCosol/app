import { StateStatutoryService } from './state-statutory.service';
import { StateSlabService } from './state-slab.service';

/**
 * StateStatutoryService tests — applies PT / LWF deductions by resolving
 * slab amounts (mocked here) and writing ceil'd values into the map.
 */
describe('StateStatutoryService', () => {
  const buildSlab = (amounts: Record<string, number>) =>
    ({
      resolveAmount: jest.fn(
        async ({ componentCode }: { componentCode: string }) =>
          amounts[componentCode] ?? 0,
      ),
    }) as unknown as StateSlabService;

  const apply = (
    svc: StateStatutoryService,
    over: Partial<
      Parameters<StateStatutoryService['applyStateDeductions']>[0]
    > = {},
  ) =>
    svc.applyStateDeductions({
      clientId: 'c1',
      stateCode: 'MH',
      values: { GROSS: 25000 },
      ptEnabled: true,
      lwfEnabled: true,
      ...over,
    });

  it('writes ceil-rounded PT and LWF (emp + er) amounts', async () => {
    const svc = new StateStatutoryService(
      buildSlab({ PT: 199.5, LWF_EMP: 20, LWF_ER: 40 }),
    );
    const values = await apply(svc);
    expect(values.PT).toBe(200); // ceil(199.5)
    expect(values.LWF_EMP).toBe(20);
    expect(values.LWF_ER).toBe(40);
  });

  it('skips PT when it is disabled', async () => {
    const svc = new StateStatutoryService(buildSlab({ PT: 200 }));
    const values = await apply(svc, { ptEnabled: false });
    expect(values.PT).toBeUndefined();
  });

  it('skips LWF when it is disabled', async () => {
    const svc = new StateStatutoryService(
      buildSlab({ LWF_EMP: 20, LWF_ER: 40 }),
    );
    const values = await apply(svc, { lwfEnabled: false });
    expect(values.LWF_EMP).toBeUndefined();
    expect(values.LWF_ER).toBeUndefined();
  });

  it('skips deductions when no state code is provided', async () => {
    const svc = new StateStatutoryService(buildSlab({ PT: 200 }));
    const values = await apply(svc, { stateCode: '' });
    expect(values.PT).toBeUndefined();
  });
});
