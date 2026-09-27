import { Invoice } from '../entities';

// Only compare data used by the document, not mail logs or PDF bookkeeping.
export function invoicePdfSnapshot(invoice: Invoice): string {
  const pick = (value: object | undefined, keys: string[]) =>
    keys.map((key) => {
      const field = (value as Record<string, unknown> | undefined)?.[key];
      if (field == null) return '';
      if (
        typeof field === 'string' ||
        typeof field === 'number' ||
        typeof field === 'boolean'
      )
        return String(field);
      return JSON.stringify(field);
    });
  return JSON.stringify({
    invoice: pick(invoice, [
      'invoiceNumber',
      'invoiceType',
      'invoiceDate',
      'dueDate',
      'financialYear',
      'billingClientId',
      'placeOfSupply',
      'stateCode',
      'gstin',
      'subTotal',
      'discountTotal',
      'taxableValue',
      'cgstRate',
      'cgstAmount',
      'sgstRate',
      'sgstAmount',
      'igstRate',
      'igstAmount',
      'roundOff',
      'grandTotal',
      'remarks',
      'purchaseOrderNumber',
      'proformaReferenceNumber',
      'invoiceStatus',
    ]),
    client: pick(invoice.billingClient, [
      'legalName',
      'billingAddress',
      'gstin',
      'stateName',
      'stateCode',
      'placeOfSupply',
      'defaultSacCode',
    ]),
    items: [...(invoice.items || [])]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((item) =>
        pick(item, [
          'id',
          'serviceCode',
          'serviceDescription',
          'sacCode',
          'periodFrom',
          'periodTo',
          'quantity',
          'rate',
          'amount',
          'discountAmount',
          'taxableAmount',
          'gstRate',
          'gstAmount',
          'lineTotal',
          'isReimbursement',
          'sequence',
        ]),
      ),
  });
}
