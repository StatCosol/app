import { BadRequestException, Injectable } from '@nestjs/common';

interface ItemCalc {
  quantity: number;
  rate: number;
  discountAmount?: number;
  gstRate?: number;
}

interface ItemResult {
  amount: number;
  discountAmount: number;
  taxableAmount: number;
  gstAmount: number;
  lineTotal: number;
}

@Injectable()
export class BillingCalculationService {
  calculateItem(item: ItemCalc): ItemResult {
    const values = [
      item.quantity,
      item.rate,
      item.discountAmount ?? 0,
      item.gstRate ?? 0,
    ].map(Number);
    if (
      values.some(
        (value) =>
          !Number.isFinite(value) ||
          value < 0 ||
          Math.abs(value * 100 - Math.round(value * 100)) > 1e-7,
      ) ||
      values[0] <= 0 ||
      values[3] > 100
    ) {
      throw new BadRequestException(
        'Invoice line values must use at most two decimal places, positive quantity and GST between 0 and 100.',
      );
    }
    const amount = +(item.quantity * item.rate).toFixed(2);
    const discountAmount = +(item.discountAmount || 0);
    if (discountAmount > amount)
      throw new BadRequestException('Line discount cannot exceed its amount.');
    const taxableAmount = +(amount - discountAmount).toFixed(2);
    const gstRate = item.gstRate || 0;
    const gstAmount = +((taxableAmount * gstRate) / 100).toFixed(2);
    const lineTotal = +(taxableAmount + gstAmount).toFixed(2);
    return { amount, discountAmount, taxableAmount, gstAmount, lineTotal };
  }

  isIntraState(supplierStateCode: string, clientStateCode: string): boolean {
    return supplierStateCode === clientStateCode;
  }

  calculateInvoiceTotals(
    items: ItemResult[],
    gstRate: number,
    intraState: boolean,
  ) {
    const subTotal = +items.reduce((s, i) => s + i.amount, 0).toFixed(2);
    const discountTotal = +items
      .reduce((s, i) => s + i.discountAmount, 0)
      .toFixed(2);
    const taxableValue = +items
      .reduce((s, i) => s + i.taxableAmount, 0)
      .toFixed(2);
    const totalGst = +items.reduce((s, i) => s + i.gstAmount, 0).toFixed(2);

    let cgstRate = 0,
      cgstAmount = 0,
      sgstRate = 0,
      sgstAmount = 0;
    let igstRate = 0,
      igstAmount = 0;

    if (intraState) {
      cgstRate = +(gstRate / 2).toFixed(2);
      sgstRate = +(gstRate / 2).toFixed(2);
      cgstAmount = +(totalGst / 2).toFixed(2);
      sgstAmount = +(totalGst - cgstAmount).toFixed(2);
    } else {
      igstRate = +gstRate;
      igstAmount = +totalGst;
    }

    const rawTotal = taxableValue + totalGst;
    const grandTotal = Math.round(rawTotal);
    const roundOff = +(grandTotal - rawTotal).toFixed(2);

    return {
      subTotal,
      discountTotal,
      taxableValue,
      totalGst,
      cgstRate,
      cgstAmount,
      sgstRate,
      sgstAmount,
      igstRate,
      igstAmount,
      roundOff,
      grandTotal,
      balanceOutstanding: grandTotal,
    };
  }
}
