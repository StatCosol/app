import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { AccountsBillingService } from '../services/accounts-billing.service';
import { Invoice, InvoicePayment, PAYMENT_MODES } from '../models/billing.models';

@Component({
  selector: 'app-billing-invoice-view',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  template: `
    <div class="p-6 space-y-6" *ngIf="invoice">
      <!-- Header -->
      <div class="flex items-center justify-between flex-wrap gap-4">
        <div>
          <a routerLink="/admin/billing/invoices" class="text-blue-600 text-sm hover:underline">&larr; Back to Invoices</a>
          <h1 class="text-2xl font-bold text-slate-800 mt-1">{{ invoice.invoiceNumber }}</h1>
          <p class="text-sm text-slate-500">{{ invoice.invoiceType.replace('_',' ') }} &middot; {{ invoice.invoiceDate }}</p>
        </div>
        <div class="flex gap-2 flex-wrap">
          <button *ngIf="invoice.invoiceStatus === 'DRAFT'" (click)="approve()"
                  class="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700">Approve</button>
          <button (click)="generatePdf()" [disabled]="generatingPdf"
                  class="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700">
            {{ generatingPdf ? 'Generating...' : 'Generate PDF' }}
          </button>
          <button (click)="showEmailModal = true"
                  class="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700">Send Email</button>
          <button *ngIf="invoice.invoiceStatus !== 'CANCELLED' && invoice.invoiceStatus !== 'PAID'" (click)="cancel()"
                  class="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700">Cancel</button>
        </div>
      </div>

      <!-- Status Badges -->
      <div class="flex gap-3 flex-wrap">
        <span class="px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">{{ invoice.invoiceStatus }}</span>
        <span class="px-3 py-1 rounded-full text-xs font-semibold" [class]="invoice.paymentStatus === 'PAID' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'">
          {{ invoice.paymentStatus }}
        </span>
        <span class="px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">Mail: {{ invoice.mailStatus }}</span>
        <a *ngIf="invoice.pdfPath" [href]="invoice.pdfPath" target="_blank"
           class="px-3 py-1 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-700 hover:underline">View PDF</a>
      </div>

      <!-- Client & Amount Cards -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div class="bg-white rounded-xl border p-5">
          <h3 class="text-sm font-semibold text-slate-500 uppercase mb-3">Client Details</h3>
          <p class="font-bold text-lg">{{ invoice.billingClient?.legalName }}</p>
          <p class="text-sm text-slate-500 mt-1">{{ invoice.billingClient?.billingAddress }}</p>
          <p class="text-sm mt-1">GSTIN: {{ invoice.billingClient?.gstin || 'N/A' }}</p>
          <p class="text-sm">State: {{ invoice.billingClient?.stateName }} ({{ invoice.billingClient?.stateCode }})</p>
        </div>
        <div class="bg-white rounded-xl border p-5">
          <h3 class="text-sm font-semibold text-slate-500 uppercase mb-3">Amount Summary</h3>
          <div class="grid grid-cols-2 gap-2 text-sm">
            <div>Sub Total:</div><div class="text-right font-medium">₹{{ fmt(invoice.subTotal) }}</div>
            <div>Discount:</div><div class="text-right">₹{{ fmt(invoice.discountTotal) }}</div>
            <div>Taxable Value:</div><div class="text-right">₹{{ fmt(invoice.taxableValue) }}</div>
            <div *ngIf="+invoice.cgstAmount > 0">CGST ({{ invoice.cgstRate }}%):</div>
            <div *ngIf="+invoice.cgstAmount > 0" class="text-right">₹{{ fmt(invoice.cgstAmount) }}</div>
            <div *ngIf="+invoice.sgstAmount > 0">SGST ({{ invoice.sgstRate }}%):</div>
            <div *ngIf="+invoice.sgstAmount > 0" class="text-right">₹{{ fmt(invoice.sgstAmount) }}</div>
            <div *ngIf="+invoice.igstAmount > 0">IGST ({{ invoice.igstRate }}%):</div>
            <div *ngIf="+invoice.igstAmount > 0" class="text-right">₹{{ fmt(invoice.igstAmount) }}</div>
            <div>Round Off:</div><div class="text-right">₹{{ fmt(invoice.roundOff) }}</div>
            <div class="font-bold text-lg border-t pt-2">Grand Total:</div>
            <div class="text-right font-bold text-lg border-t pt-2 text-blue-700">₹{{ fmt(invoice.grandTotal) }}</div>
            <div class="text-green-600">Received:</div><div class="text-right text-green-600">₹{{ fmt(invoice.amountReceived) }}</div>
            <div class="text-red-600 font-semibold">Balance:</div><div class="text-right text-red-600 font-semibold">₹{{ fmt(invoice.balanceOutstanding) }}</div>
          </div>
        </div>
      </div>

      <!-- Line Items -->
      <div class="bg-white rounded-xl border shadow-sm overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-slate-50 text-slate-500 uppercase text-xs">
            <tr>
              <th class="px-4 py-3 text-left">#</th>
              <th class="px-4 py-3 text-left">Description</th>
              <th class="px-4 py-3 text-right">Qty</th>
              <th class="px-4 py-3 text-right">Rate</th>
              <th class="px-4 py-3 text-right">Amount</th>
              <th class="px-4 py-3 text-right">Discount</th>
              <th class="px-4 py-3 text-right">Taxable</th>
              <th class="px-4 py-3 text-right">GST%</th>
              <th class="px-4 py-3 text-right">GST Amt</th>
              <th class="px-4 py-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody class="divide-y">
            <tr *ngFor="let item of invoice.items; let i = index">
              <td class="px-4 py-2">{{ i + 1 }}</td>
              <td class="px-4 py-2">{{ item.serviceDescription }}<br *ngIf="item.sacCode"><small *ngIf="item.sacCode" class="text-slate-400">SAC: {{ item.sacCode }}</small></td>
              <td class="px-4 py-2 text-right">{{ item.quantity }}</td>
              <td class="px-4 py-2 text-right">₹{{ fmt(item.rate) }}</td>
              <td class="px-4 py-2 text-right">₹{{ fmt(item.amount) }}</td>
              <td class="px-4 py-2 text-right">₹{{ fmt(item.discountAmount) }}</td>
              <td class="px-4 py-2 text-right">₹{{ fmt(item.taxableAmount) }}</td>
              <td class="px-4 py-2 text-right">{{ item.gstRate }}%</td>
              <td class="px-4 py-2 text-right">₹{{ fmt(item.gstAmount) }}</td>
              <td class="px-4 py-2 text-right font-medium">₹{{ fmt(item.lineTotal) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Payments Section -->
      <div class="bg-white rounded-xl border p-6 space-y-4">
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold text-slate-700">Payments</h3>
          <button *ngIf="invoice.paymentStatus !== 'PAID' && invoice.invoiceStatus !== 'CANCELLED'"
                  (click)="showPaymentModal = true"
                  class="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs hover:bg-green-700">+ Record Payment</button>
        </div>
        <table class="w-full text-sm" *ngIf="payments.length">
          <thead class="bg-slate-50 text-xs text-slate-500 uppercase">
            <tr>
              <th class="px-4 py-2 text-left">Receipt #</th>
              <th class="px-4 py-2 text-left">Date</th>
              <th class="px-4 py-2 text-right">Amount</th>
              <th class="px-4 py-2 text-right">TDS</th>
              <th class="px-4 py-2 text-right">Net</th>
              <th class="px-4 py-2 text-left">Mode</th>
              <th class="px-4 py-2 text-left">Ref</th>
            </tr>
          </thead>
          <tbody class="divide-y">
            <tr *ngFor="let p of payments">
              <td class="px-4 py-2 font-mono text-xs">{{ p.receiptNumber }}</td>
              <td class="px-4 py-2">{{ p.paymentDate }}</td>
              <td class="px-4 py-2 text-right">₹{{ fmt(p.amountReceived) }}</td>
              <td class="px-4 py-2 text-right">₹{{ fmt(p.tdsAmount) }}</td>
              <td class="px-4 py-2 text-right font-medium">₹{{ fmt(p.netReceived) }}</td>
              <td class="px-4 py-2">{{ p.paymentMode }}</td>
              <td class="px-4 py-2 text-xs">{{ p.referenceNumber || '—' }}</td>
            </tr>
          </tbody>
        </table>
        <p *ngIf="!payments.length" class="text-slate-400 text-sm">No payments recorded yet.</p>
      </div>

      <!-- Payment Modal -->
      <div *ngIf="showPaymentModal" class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
        <div class="bg-white rounded-xl shadow-xl w-full max-w-md">
          <div class="p-6 border-b flex items-center justify-between">
            <h2 class="text-lg font-bold">Record Payment</h2>
            <button (click)="showPaymentModal = false" class="text-slate-400 hover:text-slate-600">&times;</button>
          </div>
          <div class="p-6 space-y-4">
            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1">Payment Date *</label>
              <input [(ngModel)]="payForm.paymentDate" type="date" class="w-full px-3 py-2 border rounded-lg text-sm">
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1">Amount Received *</label>
              <input [(ngModel)]="payForm.amountReceived" type="number" class="w-full px-3 py-2 border rounded-lg text-sm">
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-medium text-slate-600 mb-1">TDS Amount</label>
                <input [(ngModel)]="payForm.tdsAmount" type="number" class="w-full px-3 py-2 border rounded-lg text-sm">
              </div>
              <div>
                <label class="block text-xs font-medium text-slate-600 mb-1">Other Deduction</label>
                <input [(ngModel)]="payForm.otherDeduction" type="number" class="w-full px-3 py-2 border rounded-lg text-sm">
              </div>
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1">Payment Mode *</label>
              <select [(ngModel)]="payForm.paymentMode" class="w-full px-3 py-2 border rounded-lg text-sm">
                <option *ngFor="let m of paymentModes" [value]="m">{{ m }}</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1">Reference Number</label>
              <input [(ngModel)]="payForm.referenceNumber" class="w-full px-3 py-2 border rounded-lg text-sm">
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1">Remarks</label>
              <textarea [(ngModel)]="payForm.remarks" rows="2" class="w-full px-3 py-2 border rounded-lg text-sm"></textarea>
            </div>
          </div>
          <div class="p-6 border-t flex justify-end gap-3">
            <button (click)="showPaymentModal = false" class="px-4 py-2 border rounded-lg text-sm">Cancel</button>
            <button (click)="submitPayment()" [disabled]="savingPayment"
                    class="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700">
              {{ savingPayment ? 'Saving...' : 'Save Payment' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Email Modal -->
      <div *ngIf="showEmailModal" class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
        <div class="bg-white rounded-xl shadow-xl w-full max-w-md">
          <div class="p-6 border-b flex items-center justify-between">
            <h2 class="text-lg font-bold">Send Invoice Email</h2>
            <button (click)="showEmailModal = false" class="text-slate-400 hover:text-slate-600">&times;</button>
          </div>
          <div class="p-6 space-y-4">
            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1">To Email *</label>
              <input [(ngModel)]="emailForm.toEmail" type="email" class="w-full px-3 py-2 border rounded-lg text-sm">
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1">CC Email</label>
              <input [(ngModel)]="emailForm.ccEmail" class="w-full px-3 py-2 border rounded-lg text-sm">
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1">Subject</label>
              <input [(ngModel)]="emailForm.subject" class="w-full px-3 py-2 border rounded-lg text-sm">
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1">Body</label>
              <textarea [(ngModel)]="emailForm.body" rows="4" class="w-full px-3 py-2 border rounded-lg text-sm"></textarea>
            </div>
          </div>
          <div class="p-6 border-t flex justify-end gap-3">
            <button (click)="showEmailModal = false" class="px-4 py-2 border rounded-lg text-sm">Cancel</button>
            <button (click)="submitEmail()" [disabled]="sendingEmail"
                    class="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700">
              {{ sendingEmail ? 'Sending...' : 'Send' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class BillingInvoiceViewComponent implements OnInit {
  invoice: Invoice | null = null;
  payments: InvoicePayment[] = [];
  paymentModes = PAYMENT_MODES;

  showPaymentModal = false;
  savingPayment = false;
  payForm: any = {};

  showEmailModal = false;
  sendingEmail = false;
  emailForm: any = {};

  generatingPdf = false;

  constructor(
    private route: ActivatedRoute,
    private svc: AccountsBillingService,
  ) {}

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.loadInvoice(id);
  }

  loadInvoice(id: string): void {
    this.svc.getInvoice(id).subscribe((inv) => {
      this.invoice = inv;
      this.payments = inv.payments || [];
      this.resetPayForm();
      this.resetEmailForm();
    });
  }

  approve(): void {
    if (!this.invoice) return;
    this.svc.approveInvoice(this.invoice.id).subscribe((inv) => {
      this.invoice = inv;
    });
  }

  cancel(): void {
    if (!this.invoice || !confirm('Cancel this invoice?')) return;
    this.svc.cancelInvoice(this.invoice.id).subscribe((inv) => {
      this.invoice = inv;
    });
  }

  generatePdf(): void {
    if (!this.invoice) return;
    this.generatingPdf = true;
    this.svc.generatePdf(this.invoice.id).subscribe({
      next: () => {
        this.generatingPdf = false;
        this.loadInvoice(this.invoice!.id);
      },
      error: () => (this.generatingPdf = false),
    });
  }

  resetPayForm(): void {
    this.payForm = {
      paymentDate: new Date().toISOString().split('T')[0],
      amountReceived: this.invoice?.balanceOutstanding || 0,
      tdsAmount: 0, otherDeduction: 0,
      paymentMode: 'BANK_TRANSFER', referenceNumber: '', remarks: '',
    };
  }

  submitPayment(): void {
    if (!this.invoice) return;
    this.savingPayment = true;
    this.svc.recordPayment(this.invoice.id, this.payForm).subscribe({
      next: () => {
        this.savingPayment = false;
        this.showPaymentModal = false;
        this.loadInvoice(this.invoice!.id);
      },
      error: () => (this.savingPayment = false),
    });
  }

  resetEmailForm(): void {
    this.emailForm = {
      toEmail: this.invoice?.billingClient?.billingEmail || '',
      ccEmail: this.invoice?.billingClient?.ccEmail || '',
      subject: this.invoice ? `Invoice ${this.invoice.invoiceNumber} from StatCo Solutions` : '',
      body: '',
    };
  }

  submitEmail(): void {
    if (!this.invoice) return;
    this.sendingEmail = true;
    this.svc.sendInvoiceEmail(this.invoice.id, this.emailForm).subscribe({
      next: () => {
        this.sendingEmail = false;
        this.showEmailModal = false;
        this.loadInvoice(this.invoice!.id);
      },
      error: () => (this.sendingEmail = false),
    });
  }

  fmt(n: any): string {
    return (+n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
}
