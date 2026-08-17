import { BillingCalculationService } from './billing-calculation.service';

/**
 * Billing calculation tests — GST invoice math (line items, CGST/SGST vs IGST,
 * round-off). Money + tax, so the arithmetic is pinned down.
 */
describe('BillingCalculationService', () => {
  let svc: BillingCalculationService;
  beforeEach(() => {
    svc = new BillingCalculationService();
  });

  describe('calculateItem', () => {
    it('computes a simple line with no discount or GST', () => {
      expect(svc.calculateItem({ quantity: 2, rate: 100 })).toEqual({
        amount: 200,
        discountAmount: 0,
        taxableAmount: 200,
        gstAmount: 0,
        lineTotal: 200,
      });
    });

    it('applies discount then GST on the taxable amount', () => {
      expect(
        svc.calculateItem({
          quantity: 10,
          rate: 50,
          discountAmount: 100,
          gstRate: 18,
        }),
      ).toEqual({
        amount: 500,
        discountAmount: 100,
        taxableAmount: 400,
        gstAmount: 72, // 18% of 400
        lineTotal: 472,
      });
    });
  });

  describe('isIntraState', () => {
    it('is true only when supplier and client states match', () => {
      expect(svc.isIntraState('27', '27')).toBe(true);
      expect(svc.isIntraState('27', '29')).toBe(false);
    });
  });

  describe('calculateInvoiceTotals', () => {
    const item = {
      amount: 400,
      discountAmount: 0,
      taxableAmount: 400,
      gstAmount: 72,
      lineTotal: 472,
    };

    it('splits GST into equal CGST/SGST for an intra-state supply', () => {
      const t = svc.calculateInvoiceTotals([item], 18, true);
      expect(t.taxableValue).toBe(400);
      expect(t.cgstRate).toBe(9);
      expect(t.sgstRate).toBe(9);
      expect(t.cgstAmount).toBe(36);
      expect(t.sgstAmount).toBe(36);
      expect(t.igstAmount).toBe(0);
      expect(t.grandTotal).toBe(472);
      expect(t.roundOff).toBe(0);
    });

    it('uses IGST for an inter-state supply', () => {
      const t = svc.calculateInvoiceTotals([item], 18, false);
      expect(t.igstRate).toBe(18);
      expect(t.igstAmount).toBe(72);
      expect(t.cgstAmount).toBe(0);
      expect(t.sgstAmount).toBe(0);
      expect(t.grandTotal).toBe(472);
    });

    it('applies round-off to the nearest rupee', () => {
      const odd = {
        amount: 100.3,
        discountAmount: 0,
        taxableAmount: 100.3,
        gstAmount: 18.05,
        lineTotal: 118.35,
      };
      const t = svc.calculateInvoiceTotals([odd], 18, false);
      // rawTotal 118.35 → grandTotal 118, roundOff −0.35
      expect(t.grandTotal).toBe(118);
      expect(t.roundOff).toBeCloseTo(-0.35, 2);
    });

    it('CGST + SGST always equals the total GST (remainder on SGST)', () => {
      const oddGst = {
        amount: 333.34,
        discountAmount: 0,
        taxableAmount: 333.34,
        gstAmount: 60.01, // odd -> not evenly halved
        lineTotal: 393.35,
      };
      const t = svc.calculateInvoiceTotals([oddGst], 18, true);
      expect(+(t.cgstAmount + t.sgstAmount).toFixed(2)).toBe(60.01);
    });
  });
});
