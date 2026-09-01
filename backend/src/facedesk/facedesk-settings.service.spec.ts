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
    // 97% default → ~0.88. Raised from 90%/0.78, where unrelated faces scored
    // 0.73–0.84 in production and blocked every enrollment.
    expect(eff.duplicateCosine).toBeCloseTo(0.884, 3);
    expect(eff.livenessRequired).toBe(true);
    expect(eff.identificationMode).toBe('PIN_THEN_FACE');
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
      identificationMode: 'FACE_ONLY',
    });
    const eff = await service.getEffective('client-1');
    expect(eff.acceptCosine).toBeCloseTo(0.95, 3);
    expect(eff.duplicateCosine).toBeCloseTo(0.84, 3); // 95% → 0.84
    expect(eff.minFaceSamples).toBe(7);
    expect(eff.livenessRequired).toBe(false);
    expect(eff.identificationMode).toBe('PIN_THEN_FACE');
  });
});

describe('FaceDeskSettingsService — duplicate defaults', () => {
  const makeService = (row: any = null) => {
    const repo = {
      findOne: jest.fn().mockResolvedValue(row),
      create: jest.fn((v: any) => v),
      merge: jest.fn((a: any, b: any, c: any) => ({ ...a, ...b, ...c })),
      save: jest.fn(async (v: any) => v),
    };
    return new FaceDeskSettingsService(repo as any);
  };

  // Production evidence: several DIFFERENT employees matched the same profiles
  // at these scores under the old 0.78 bar, so every enrollment was blocked.
  const observedFalsePositives = [0.838, 0.807, 0.803, 0.751, 0.746, 0.731];

  it('clears every observed false positive', async () => {
    const eff = await makeService().getEffective('c1');

    for (const score of observedFalsePositives) {
      expect(score).toBeLessThan(eff.duplicateCosine);
      // The review band must not silently re-block below the threshold.
      expect(score).toBeLessThan(eff.duplicateReviewCosine);
    }
  });

  it('leaves punch acceptance untouched', async () => {
    const eff = await makeService().getEffective('c1');
    // Raising the duplicate bar must not make punching stricter or looser.
    expect(eff.acceptCosine).toBeCloseTo(0.84, 3);
  });

  it('still honours an explicit per-client threshold', async () => {
    const eff = await makeService({ duplicateThreshold: 90 }).getEffective('c1');
    expect(eff.duplicateCosine).toBeCloseTo(0.78, 3);
  });
});
