import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BillingSetting, Invoice } from '../entities';

@Injectable()
export class InvoiceTemplateService {
  constructor(
    @InjectRepository(BillingSetting)
    private readonly settingsRepo: Repository<BillingSetting>,
  ) {}

  async renderInvoiceHtml(invoice: Invoice): Promise<string> {
    const settings = await this.settingsRepo.findOne({ where: {} });
    const client = invoice.billingClient;

    const itemsHtml = (invoice.items || [])
      .sort((a, b) => a.sequence - b.sequence)
      .map(
        (item, idx) => `
        <tr>
          <td style="padding:8px;border:1px solid #ddd;text-align:center">${idx + 1}</td>
          <td style="padding:8px;border:1px solid #ddd">${item.serviceDescription}${item.sacCode ? `<br><small>SAC: ${item.sacCode}</small>` : ''}</td>
          <td style="padding:8px;border:1px solid #ddd;text-align:center">${item.quantity}</td>
          <td style="padding:8px;border:1px solid #ddd;text-align:right">₹${this.fmt(item.rate)}</td>
          <td style="padding:8px;border:1px solid #ddd;text-align:right">₹${this.fmt(item.amount)}</td>
          <td style="padding:8px;border:1px solid #ddd;text-align:right">₹${this.fmt(item.discountAmount)}</td>
          <td style="padding:8px;border:1px solid #ddd;text-align:right">₹${this.fmt(item.taxableAmount)}</td>
          <td style="padding:8px;border:1px solid #ddd;text-align:right">${item.gstRate}%</td>
          <td style="padding:8px;border:1px solid #ddd;text-align:right">₹${this.fmt(item.gstAmount)}</td>
          <td style="padding:8px;border:1px solid #ddd;text-align:right">₹${this.fmt(item.lineTotal)}</td>
        </tr>`,
      )
      .join('');

    const intraState = +invoice.cgstAmount > 0;
    const taxLines = intraState
      ? `<tr><td colspan="2" style="padding:6px 8px;border:1px solid #ddd">CGST @ ${invoice.cgstRate}%</td>
         <td style="padding:6px 8px;border:1px solid #ddd;text-align:right">₹${this.fmt(invoice.cgstAmount)}</td></tr>
         <tr><td colspan="2" style="padding:6px 8px;border:1px solid #ddd">SGST @ ${invoice.sgstRate}%</td>
         <td style="padding:6px 8px;border:1px solid #ddd;text-align:right">₹${this.fmt(invoice.sgstAmount)}</td></tr>`
      : `<tr><td colspan="2" style="padding:6px 8px;border:1px solid #ddd">IGST @ ${invoice.igstRate}%</td>
         <td style="padding:6px 8px;border:1px solid #ddd;text-align:right">₹${this.fmt(invoice.igstAmount)}</td></tr>`;

    return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body{font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#333;margin:0;padding:20px}
  .invoice-box{max-width:800px;margin:auto;border:1px solid #eee;padding:30px}
  h2{margin:0 0 5px}
  table{width:100%;border-collapse:collapse}
</style></head>
<body>
<div class="invoice-box">
  <h2 style="text-align:center;color:#1a56db">${invoice.invoiceType.replace(/_/g, ' ')}</h2>
  <p style="text-align:center;font-size:12px;color:#666">${invoice.invoiceNumber}</p>
  <hr style="border:none;border-top:2px solid #1a56db;margin:15px 0">
  <table style="margin-bottom:20px">
    <tr>
      <td style="width:50%;vertical-align:top;padding:10px;background:#f8fafc;border:1px solid #eee">
        <strong>From:</strong><br>
        <strong>${settings?.legalName || 'StatCo Solutions'}</strong><br>
        ${settings?.address || ''}<br>
        GSTIN: ${settings?.gstin || ''}<br>
        State: ${settings?.stateName || ''} (${settings?.stateCode || ''})
      </td>
      <td style="width:50%;vertical-align:top;padding:10px;background:#f8fafc;border:1px solid #eee">
        <strong>To:</strong><br>
        <strong>${client?.legalName || ''}</strong><br>
        ${client?.billingAddress || ''}<br>
        GSTIN: ${client?.gstin || 'N/A'}<br>
        State: ${client?.stateName || ''} (${client?.stateCode || ''})
      </td>
    </tr>
  </table>
  <table style="margin-bottom:15px">
    <tr>
      <td><strong>Invoice Date:</strong> ${invoice.invoiceDate}</td>
      <td><strong>Due Date:</strong> ${invoice.dueDate}</td>
      <td><strong>Place of Supply:</strong> ${invoice.placeOfSupply || client?.stateName || ''}</td>
    </tr>
  </table>
  <table style="margin-bottom:15px">
    <thead>
      <tr style="background:#1a56db;color:#fff">
        <th style="padding:8px;border:1px solid #ddd">#</th>
        <th style="padding:8px;border:1px solid #ddd">Description</th>
        <th style="padding:8px;border:1px solid #ddd">Qty</th>
        <th style="padding:8px;border:1px solid #ddd">Rate</th>
        <th style="padding:8px;border:1px solid #ddd">Amount</th>
        <th style="padding:8px;border:1px solid #ddd">Disc.</th>
        <th style="padding:8px;border:1px solid #ddd">Taxable</th>
        <th style="padding:8px;border:1px solid #ddd">GST%</th>
        <th style="padding:8px;border:1px solid #ddd">GST Amt</th>
        <th style="padding:8px;border:1px solid #ddd">Total</th>
      </tr>
    </thead>
    <tbody>${itemsHtml}</tbody>
  </table>
  <table style="width:300px;margin-left:auto;margin-bottom:20px">
    <tr><td colspan="2" style="padding:6px 8px;border:1px solid #ddd">Sub Total</td>
        <td style="padding:6px 8px;border:1px solid #ddd;text-align:right">₹${this.fmt(invoice.subTotal)}</td></tr>
    <tr><td colspan="2" style="padding:6px 8px;border:1px solid #ddd">Discount</td>
        <td style="padding:6px 8px;border:1px solid #ddd;text-align:right">₹${this.fmt(invoice.discountTotal)}</td></tr>
    <tr><td colspan="2" style="padding:6px 8px;border:1px solid #ddd">Taxable Value</td>
        <td style="padding:6px 8px;border:1px solid #ddd;text-align:right">₹${this.fmt(invoice.taxableValue)}</td></tr>
    ${taxLines}
    <tr><td colspan="2" style="padding:6px 8px;border:1px solid #ddd">Round Off</td>
        <td style="padding:6px 8px;border:1px solid #ddd;text-align:right">₹${this.fmt(invoice.roundOff)}</td></tr>
    <tr style="background:#1a56db;color:#fff;font-weight:bold">
        <td colspan="2" style="padding:8px;border:1px solid #ddd">Grand Total</td>
        <td style="padding:8px;border:1px solid #ddd;text-align:right">₹${this.fmt(invoice.grandTotal)}</td></tr>
  </table>
  <div style="display:flex;gap:20px;margin-bottom:20px">
    <div style="flex:1;padding:10px;background:#f8fafc;border:1px solid #eee;font-size:12px">
      <strong>Bank Details:</strong><br>
      Account Name: ${settings?.bankAccountName || ''}<br>
      Bank: ${settings?.bankName || ''}<br>
      A/C No: ${settings?.accountNumber || ''}<br>
      IFSC: ${settings?.ifscCode || ''}<br>
      Branch: ${settings?.branchName || ''}
    </div>
    <div style="flex:1;padding:10px;background:#f8fafc;border:1px solid #eee;font-size:12px">
      <strong>Declaration:</strong><br>
      ${settings?.termsAndConditions || 'We declare that this invoice shows the actual price of the services provided and that all particulars are true and correct.'}
    </div>
  </div>
  <div style="text-align:right;margin-top:40px">
    <p style="font-size:12px">For <strong>${settings?.legalName || 'StatCo Solutions'}</strong></p>
    <br><br>
    <p style="font-size:12px">Authorized Signatory<br>${settings?.authorizedSignatoryName || ''}<br>${settings?.authorizedSignatoryDesignation || ''}</p>
  </div>
</div>
</body>
</html>`;
  }

  private fmt(n: number | string): string {
    const num = typeof n === 'string' ? parseFloat(n) : n;
    if (isNaN(num)) return '0.00';
    return num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
}
