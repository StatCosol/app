import { RoundingService } from './rounding.service';

/**
 * Tests for RoundingService — the final money-rounding step applied to
 * component values. Rounding rules directly affect take-home pay, so each
 * mode's behaviour is pinned down.
 */
describe('RoundingService', () => {
  let svc: RoundingService;

  beforeEach(() => {
    svc = new RoundingService();
  });

  describe('applyRounding', () => {
    it('NEAREST_RUPEE rounds UP to the next whole rupee (business rule)', () => {
      expect(svc.applyRounding(100.01, 'NEAREST_RUPEE')).toBe(101);
      expect(svc.applyRounding(100.99, 'NEAREST_RUPEE')).toBe(101);
      expect(svc.applyRounding(100, 'NEAREST_RUPEE')).toBe(100);
    });

    it('FLOOR rounds down', () => {
      expect(svc.applyRounding(100.99, 'FLOOR')).toBe(100);
      expect(svc.applyRounding(100, 'FLOOR')).toBe(100);
    });

    it('CEIL rounds up', () => {
      expect(svc.applyRounding(100.01, 'CEIL')).toBe(101);
      expect(svc.applyRounding(100, 'CEIL')).toBe(100);
    });

    it('ROUND_50 rounds up to the next half-rupee', () => {
      expect(svc.applyRounding(100.2, 'ROUND_50')).toBe(100.5);
      expect(svc.applyRounding(100.5, 'ROUND_50')).toBe(100.5);
      expect(svc.applyRounding(100.6, 'ROUND_50')).toBe(101);
    });

    it('NO_ROUNDING leaves the amount unchanged', () => {
      expect(svc.applyRounding(100.55, 'NO_ROUNDING')).toBe(100.55);
    });

    it('an unknown mode defaults to rounding up (NEAREST_RUPEE behaviour)', () => {
      expect(svc.applyRounding(100.01, 'SOMETHING_ELSE')).toBe(101);
    });
  });

  describe('applyMinMax', () => {
    it('raises a value below the minimum up to the minimum', () => {
      expect(svc.applyMinMax(50, 100, null)).toBe(100);
    });

    it('caps a value above the maximum down to the maximum', () => {
      expect(svc.applyMinMax(500, null, 300)).toBe(300);
    });

    it('leaves a value within range unchanged', () => {
      expect(svc.applyMinMax(200, 100, 300)).toBe(200);
    });

    it('applies no bound when both min and max are null', () => {
      expect(svc.applyMinMax(200, null, null)).toBe(200);
    });

    it('handles equal boundary values (inclusive)', () => {
      expect(svc.applyMinMax(100, 100, 300)).toBe(100);
      expect(svc.applyMinMax(300, 100, 300)).toBe(300);
    });
  });
});
