import { FaceDeskSettingsService } from './facedesk-settings.service';

describe('FaceDeskSettingsService', () => {
  const makeService = (row: any = null) => {
    const repo = {
      findOne: jest.fn().mockResolvedValue(row),
      create: jest.fn((v: any) => v),
      merge: jest.fn((a: any, b: any, c: any) => ({ ...a, ...b, ...c })),
      save: jest.fn(async (v: any) => v),
    };
    return { service: new FaceDeskSettingsService(repo as any), repo };
  };

  it('maps spec percentages to calibrated cosine anchors', () => {
    const { service } = makeService();
    // Anchored to V1's proven thresholds, not literal cosine.
    expect(service.percentToCosine(100)).toBeCloseTo(0.95, 3);
    expect(service.percentToCosine(95)).toBeCloseTo(0.84, 3);
    expect(service.percentToCosine(90)).toBeCloseTo(0.78, 3);
    expect(service.percentToCosine(80)).toBeCloseTo(0.6, 3);
  });

  it('interpolates monotonically between anchors', () => {
    const { service } = makeService();
    const c975 = service.percentToCosine(97.5); // between 95 and 100
    expect(c975).toBeGreaterThan(0.84);
    expect(c975).toBeLessThan(0.95);
    // strictly increasing with percentage
    expect(service.percentToCosine(92)).toBeGreaterThan(
      service.percentToCosine(90),
    );
  });

  it('clamps out-of-range percentages', () => {
    const { service } = makeService();
    expect(service.percentToCosine(150)).toBeLessThanOrEqual(0.95);
    expect(service.percentToCosine(-10)).toBeGreaterThanOrEqual(0);
  });

  it('returns calibrated effective settings with defaults when no row', async () => {
    const { service } = makeService(null);
    const eff = await service.getEffective('client-1');
    expect(eff.matchConfidencePct).toBe(95);
    expect(eff.minFaceSamples).toBe(5);
    expect(eff.frameCaptureCount).toBe(15);
    expect(eff.acceptCosine).toBeCloseTo(0.84, 3);
    expect(eff.duplicateCosine).toBeCloseTo(0.78, 3); // 90% → 0.78
    expect(eff.livenessRequired).toBe(true);
  });

  it('honors per-client overrides', async () => {
    const { service } = makeService({
      clientId: 'client-1',
      faceMatchConfidence: 100,
      faceRetryConfidence: 95,
      duplicateThreshold: 95,
      minFaceSamples: 7,
      frameCaptureCount: 20,
      livenessRequired: false,
      offlineSyncEnabled: false,
    });
    const eff = await service.getEffective('client-1');
    expect(eff.acceptCosine).toBeCloseTo(0.95, 3);
    expect(eff.duplicateCosine).toBeCloseTo(0.84, 3); // 95% → 0.84
    expect(eff.minFaceSamples).toBe(7);
    expect(eff.livenessRequired).toBe(false);
  });
});
