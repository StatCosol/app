import { ContractorComputationService } from './contractor-computation.service';

/**
 * Contractor PT/LWF resolves through StateSlabService, not a private copy.
 *
 * ContractorComputationService used to carry its own fallback chain and band
 * match. The two had already drifted: the copy fell through to the next
 * fallback tier when a tier's bands did not cover the amount, where the shared
 * service stops at the first tier that has any slabs at all. A rule added to
 * one and not the other is how contractor and employee payroll end up
 * deducting different PT for the same state.
 */
describe('contractor PT/LWF resolution', () => {
  function makeService(resolveAmount: jest.Mock) {
    const args: any[] = new Array(12).fill({});
    const svc = new (ContractorComputationService as any)(...args);
    svc.stateSlab = { resolveAmount };
    return svc;
  }

  const call = (svc: any, over: Record<string, unknown> = {}) =>
    svc.resolveSlabAmount({
      clientId: 'client-a',
      stateCode: 'KA',
      componentCode: 'PT',
      baseAmount: 25000,
      enabled: true,
      asOfDate: '2026-04-01',
      ...over,
    });

  it('asks the shared service, passing the payroll period through', async () => {
    const resolveAmount = jest.fn().mockResolvedValue(200);
    const svc = makeService(resolveAmount);

    await expect(call(svc)).resolves.toBe(200);
    expect(resolveAmount).toHaveBeenCalledWith({
      clientId: 'client-a',
      stateCode: 'KA',
      componentCode: 'PT',
      baseAmount: 25000,
      asOfDate: '2026-04-01',
    });
  });

  it('rounds up, because contractor figures are ceiled at the point of use', async () => {
    // StateSlabService returns the raw amount so its other callers can round
    // on their own terms; this is where contractor payroll does its rounding.
    const svc = makeService(jest.fn().mockResolvedValue(200.4));
    await expect(call(svc)).resolves.toBe(201);
  });

  it('short-circuits when the deduction is disabled', async () => {
    const resolveAmount = jest.fn();
    const svc = makeService(resolveAmount);

    await expect(call(svc, { enabled: false })).resolves.toBe(0);
    expect(resolveAmount).not.toHaveBeenCalled();
  });

  it('short-circuits when there is no state', async () => {
    // No state means no slab table to consult; asking would be a wasted query
    // that can only answer 0.
    const resolveAmount = jest.fn();
    const svc = makeService(resolveAmount);

    await expect(call(svc, { stateCode: null })).resolves.toBe(0);
    expect(resolveAmount).not.toHaveBeenCalled();
  });

  it('passes a zero through rather than inventing a deduction', async () => {
    const svc = makeService(jest.fn().mockResolvedValue(0));
    await expect(call(svc)).resolves.toBe(0);
  });
});
