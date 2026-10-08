import { IconComponent } from '../../../shared/ui/icon/icon.component';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subject, Subscription, takeUntil } from 'rxjs';

import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { AccountsBillingService } from '../services/accounts-billing.service';
import { Invoice, InvoicePayment, PAYMENT_MODES } from '../models/billing.models';
import { ConfirmDialogService } from '../../../shared/ui/confirm-dialog/confirm-dialog.service';
import { ToastService } from '../../../shared/toast/toast.service';

@Component({
  selector: 'app-billing-invoice-view',
  standalone: true,
  imports: [IconComponent, FormsModule, RouterModule],
  template: `
    @if (invoice) {
<div class="p-6 space-y-6">
      <!-- Header -->
      <div class="flex items-center justify-between flex-wrap gap-4">
        <div class="min-w-0 max-w-full break-words">
          <a routerLink="/accounts/invoices" class="text-brand-600 text-sm hover:underline">&larr; Back to Invoices</a>
          <h1 class="text-2xl font-bold text-slate-800 mt-1">{{ invoice.invoiceNumber }}</h1>
          <p class="text-sm text-slate-500">{{ invoice.invoiceType.replace('_',' ') }} &middot; {{ invoice.invoiceDate }}</p>
        </div>
        <div class="flex gap-2 flex-wrap">
          @if (invoice.invoiceStatus === 'DRAFT') {
<button (click)="approve()" [disabled]="actionBusy"
                  class="compact-action px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700" title="Approve" aria-label="Approve" data-action-label="Approve" data-action-icon="check-circle"><ui-icon name="check-circle" [size]="20" /></button>
}
          @if (isEditable() && !actionBusy) {
<a [routerLink]="['/accounts/invoices', invoice.id, 'edit']"
                  class="compact-action px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm hover:bg-slate-50" title="Edit" aria-label="Edit" data-action-label="Edit" data-action-icon="pencil"><ui-icon name="pencil" [size]="20" /></a>
}
          @if (canConvert()) {
<button (click)="openTaxInvoiceConversion()"
                  [disabled]="actionBusy"
                  class="compact-action px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 disabled:opacity-50" title="View Tax Invoice" aria-label="View Tax Invoice" data-action-label="View Tax Invoice" data-action-icon="eye"><ui-icon name="eye" [size]="20" /><span class="compact-action-label">
            {{ invoice.convertedInvoice ? 'View Tax Invoice' : 'Generate Tax Invoice' }}
          </span></button>
}
          <button (click)="generatePdf()" [disabled]="actionBusy"
                  class="compact-action px-4 py-2 bg-brand-600 text-white rounded-lg text-sm hover:bg-brand-700" title="Generate PDF" aria-label="Generate PDF" data-action-label="Generate PDF" data-action-icon="refresh"><ui-icon name="refresh" [size]="20" /><span class="compact-action-label">
            {{ generatingPdf ? 'Generating...' : 'Generate PDF' }}
          </span></button>
          <button (click)="openEmail()" [disabled]="actionBusy"
                  class="compact-action px-4 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700" title="Send Email" aria-label="Send Email" data-action-label="Send Email" data-action-icon="send"><ui-icon name="send" [size]="20" /></button>
          @if (canCancel()) {
<button (click)="cancel()" [disabled]="actionBusy"
                  class="standard-action px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700">Cancel</button>
}
        </div>
      </div>

      <!-- Status Badges -->
      <div class="flex gap-3 flex-wrap">
        <span class="px-3 py-1 rounded-full text-xs font-semibold bg-brand-100 text-brand-700">{{ invoice.invoiceStatus }}</span>
        @if (invoice.invoiceType !== 'PROFORMA' || payments.length) {
          <span class="px-3 py-1 rounded-full text-xs font-semibold" [class]="invoice.paymentStatus === 'PAID' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'">
            {{ invoice.paymentStatus }}
          </span>
        }
        <span class="px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">Mail: {{ invoice.mailStatus }}</span>
        @if (invoice.pdfPath) {
<button (click)="generatePdf()" type="button" [disabled]="actionBusy"
           class="compact-action px-3 py-1 rounded-full text-xs font-semibold bg-brand-100 text-brand-700 hover:underline" title="View PDF" aria-label="View PDF" data-action-label="View PDF" data-action-icon="eye"><ui-icon name="eye" [size]="20" /></button>
}
      </div>

      @if (emailWarning) {
        <p role="alert" class="border-l-4 border-amber-500 bg-amber-50 p-3 text-sm text-amber-900">{{ emailWarning }}</p>
      }

      <!-- Client & Amount Cards -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div class="bg-white rounded-xl border p-5">
          <h3 class="text-sm font-semibold text-slate-500 uppercase mb-3">Client Details</h3>
          <p class="font-bold text-lg">{{ invoice.billingClient?.legalName }}</p>
          <p class="text-sm text-slate-500 mt-1">{{ invoice.billingClient?.billingAddress }}</p>
          <p class="text-sm mt-1">GSTIN: {{ invoice.billingClient?.gstin || 'N/A' }}</p>
          <p class="text-sm">State: {{ invoice.billingClient?.stateName }} ({{ invoice.billingClient?.stateCode }})</p>
          @if (invoice.proformaReferenceNumber) {
<p class="text-sm mt-2"><span class="text-slate-500">Proforma Reference:</span> <strong>{{ invoice.proformaReferenceNumber }}</strong></p>
}
          @if (invoice.purchaseOrderNumber) {
<p class="text-sm"><span class="text-slate-500">Client PO Number:</span> <strong>{{ invoice.purchaseOrderNumber }}</strong></p>
}
        </div>
        <div class="bg-white rounded-xl border p-5">
          <h3 class="text-sm font-semibold text-slate-500 uppercase mb-3">Amount Summary</h3>
          <div class="grid grid-cols-2 gap-2 text-sm">
            <div>Sub Total:</div><div class="text-right font-medium">₹{{ fmt(invoice.subTotal) }}</div>
            <div>Discount:</div><div class="text-right">₹{{ fmt(invoice.discountTotal) }}</div>
            <div>Taxable Value:</div><div class="text-right">₹{{ fmt(invoice.taxableValue) }}</div>
            @if (+invoice.cgstAmount > 0) {
<div>CGST ({{ invoice.cgstRate }}%):</div>
}
            @if (+invoice.cgstAmount > 0) {
<div class="text-right">₹{{ fmt(invoice.cgstAmount) }}</div>
}
            @if (+invoice.sgstAmount > 0) {
<div>SGST ({{ invoice.sgstRate }}%):</div>
}
            @if (+invoice.sgstAmount > 0) {
<div class="text-right">₹{{ fmt(invoice.sgstAmount) }}</div>
}
            @if (+invoice.igstAmount > 0) {
<div>IGST ({{ invoice.igstRate }}%):</div>
}
            @if (+invoice.igstAmount > 0) {
<div class="text-right">₹{{ fmt(invoice.igstAmount) }}</div>
}
            <div>Round Off:</div><div class="text-right">₹{{ fmt(invoice.roundOff) }}</div>
            <div class="font-bold text-lg border-t pt-2">Grand Total:</div>
            <div class="text-right font-bold text-lg border-t pt-2 text-brand-700">₹{{ fmt(invoice.grandTotal) }}</div>
            @if (invoice.invoiceType !== 'PROFORMA' || payments.length) {
              <div class="text-green-600">Received:</div><div class="text-right text-green-600">₹{{ fmt(invoice.amountReceived) }}</div>
              <div class="text-red-600 font-semibold">Balance:</div><div class="text-right text-red-600 font-semibold">₹{{ fmt(invoice.balanceOutstanding) }}</div>
            }
          </div>
        </div>
      </div>

      @if (invoice.remarks) {
<div class="bg-white rounded-xl border p-5">
        <h3 class="text-sm font-semibold text-slate-500 uppercase mb-2">Remarks</h3>
        <p class="text-sm text-slate-700 whitespace-pre-line">{{ invoice.remarks }}</p>
      </div>
}

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
            @for (item of invoice.items; track item; let i = $index) {
<tr>
              <td class="px-4 py-2">{{ i + 1 }}</td>
              <td class="px-4 py-2">
                {{ item.serviceDescription }}
                @if (item.isReimbursement) {
<span class="ml-1 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] uppercase tracking-wide">Govt Fee &middot; Non-GST</span>
}
                @if (item.sacCode) {
<br>
}@if (item.sacCode) {
<small class="text-slate-400">SAC: {{ item.sacCode }}</small>
}
              </td>
              <td class="px-4 py-2 text-right">{{ item.quantity }}</td>
              <td class="px-4 py-2 text-right">₹{{ fmt(item.rate) }}</td>
              <td class="px-4 py-2 text-right">₹{{ fmt(item.amount) }}</td>
              <td class="px-4 py-2 text-right">₹{{ fmt(item.discountAmount) }}</td>
              <td class="px-4 py-2 text-right">₹{{ fmt(item.taxableAmount) }}</td>
              <td class="px-4 py-2 text-right">{{ item.gstRate }}%</td>
              <td class="px-4 py-2 text-right">₹{{ fmt(item.gstAmount) }}</td>
              <td class="px-4 py-2 text-right font-medium">₹{{ fmt(item.lineTotal) }}</td>
            </tr>
}
          </tbody>
        </table>
      </div>

      <!-- Payments Section -->
      @if (invoice.invoiceType !== 'PROFORMA' || payments.length) {
      <div class="bg-white rounded-xl border p-6 space-y-4">
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold text-slate-700">Payments</h3>
          @if (canRecordPayment()) {
<button [disabled]="actionBusy"
                  (click)="openPayment()"
                  class="compact-action px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs hover:bg-green-700" title="Record Payment" aria-label="Record Payment" data-action-label="Record Payment" data-action-icon="plus"><ui-icon name="plus" [size]="20" /></button>
}
        </div>
        @if (payments.length) {
<div class="table-wrap"><table class="w-full text-sm">
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
            @for (p of payments; track p) {
<tr>
              <td class="px-4 py-2 font-mono text-xs">{{ p.receiptNumber }}</td>
              <td class="px-4 py-2">{{ p.paymentDate }}</td>
              <td class="px-4 py-2 text-right">₹{{ fmt(p.amountReceived) }}</td>
              <td class="px-4 py-2 text-right">₹{{ fmt(p.tdsAmount) }}</td>
              <td class="px-4 py-2 text-right font-medium">₹{{ fmt(p.netReceived) }}</td>
              <td class="px-4 py-2">{{ p.paymentMode }}</td>
              <td class="px-4 py-2 text-xs">{{ p.referenceNumber || '—' }}</td>
            </tr>
}
          </tbody>
        </table></div>
}
        @if (!payments.length) {
<p class="text-slate-400 text-sm">No payments recorded yet.</p>
}
      </div>
      }

      <!-- Payment Modal -->
      @if (showConversionModal) {
<div class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
        <div class="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto">
          <div class="p-6 border-b flex items-center justify-between">
            <div>
              <h2 class="text-lg font-bold">Generate Tax Invoice</h2>
              <p class="text-xs text-slate-500 mt-1">From Proforma {{ invoice.invoiceNumber }}</p>
            </div>
            <button (click)="showConversionModal = false" class="compact-action text-slate-400 hover:text-slate-600" type="button" title="Close" aria-label="Close" data-action-label="Close" data-action-icon="x-circle"><ui-icon name="x-circle" [size]="20" /></button>
          </div>
          <div class="p-6 space-y-4">
            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1">Proforma Invoice Reference</label>
              <input [value]="invoice.invoiceNumber" readonly
                     class="w-full px-3 py-2 border rounded-lg text-sm bg-slate-50">
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1">Client PO Number *</label>
              <input [(ngModel)]="conversionForm.purchaseOrderNumber" maxlength="100"
                     class="w-full px-3 py-2 border rounded-lg text-sm"
                     placeholder="Enter PO number provided by client">
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-medium text-slate-600 mb-1">Invoice Date *</label>
                <input [(ngModel)]="conversionForm.invoiceDate" type="date"
                       class="w-full px-3 py-2 border rounded-lg text-sm">
              </div>
              <div>
                <label class="block text-xs font-medium text-slate-600 mb-1">Due Date</label>
                <input [(ngModel)]="conversionForm.dueDate" type="date"
                       class="w-full px-3 py-2 border rounded-lg text-sm">
              </div>
            </div>
            <p class="text-xs text-slate-500">
              The Proforma remains unchanged. A separately numbered Tax Invoice will be created.
            </p>
          </div>
          <div class="p-6 border-t flex justify-end gap-3">
            <button (click)="showConversionModal = false" class="standard-action px-4 py-2 border rounded-lg text-sm">Cancel</button>
            <button (click)="submitTaxInvoiceConversion()"
                    [disabled]="actionBusy || !conversionForm.purchaseOrderNumber.trim() || !conversionForm.invoiceDate"
                    class="compact-action px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 disabled:opacity-50" title="Generate Tax Invoice" aria-label="Generate Tax Invoice" data-action-label="Generate Tax Invoice" data-action-icon="refresh"><ui-icon name="refresh" [size]="20" /><span class="compact-action-label">
              {{ convertingProforma ? 'Generating...' : 'Generate Tax Invoice' }}
            </span></button>
          </div>
        </div>
      </div>
      }

      <!-- Payment Modal -->
      @if (showPaymentModal) {
<div class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
        <div class="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto">
          <div class="p-6 border-b flex items-center justify-between">
            <h2 class="text-lg font-bold">Record Payment</h2>
            <button (click)="showPaymentModal = false" class="compact-action text-slate-400 hover:text-slate-600" type="button" title="Close" aria-label="Close" data-action-label="Close" data-action-icon="x-circle"><ui-icon name="x-circle" [size]="20" /></button>
          </div>
          <div class="p-6 space-y-4">
            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1">Payment Date *</label>
              <input [(ngModel)]="payForm.paymentDate" type="date" class="w-full px-3 py-2 border rounded-lg text-sm">
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1">Amount Settled (including deductions) *</label>
              <input [(ngModel)]="payForm.amountReceived" type="number" min="0.01" step="0.01" class="w-full px-3 py-2 border rounded-lg text-sm">
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
                @for (m of paymentModes; track m) {
<option [value]="m">{{ m }}</option>
}
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
            <button (click)="showPaymentModal = false" class="standard-action px-4 py-2 border rounded-lg text-sm">Cancel</button>
            <button (click)="submitPayment()" [disabled]="actionBusy"
                    class="standard-action px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700">
              {{ savingPayment ? 'Saving...' : 'Save Payment' }}
            </button>
          </div>
        </div>
      </div>
}

      <!-- Email Modal -->
      @if (showEmailModal) {
<div class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
        <div class="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto">
          <div class="p-6 border-b flex items-center justify-between">
            <h2 class="text-lg font-bold">Send Invoice Email</h2>
            <button (click)="showEmailModal = false" class="compact-action text-slate-400 hover:text-slate-600" type="button" title="Close" aria-label="Close" data-action-label="Close" data-action-icon="x-circle"><ui-icon name="x-circle" [size]="20" /></button>
          </div>
          <div class="p-6 space-y-4">
            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1">To Email *</label>
              <input [(ngModel)]="emailForm.toEmail" type="email" class="w-full px-3 py-2 border rounded-lg text-sm">
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1">CC Email</label>
              <input [(ngModel)]="emailForm.ccEmail" placeholder="a@x.com,b@y.com" class="w-full px-3 py-2 border rounded-lg text-sm">
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1">BCC Email</label>
              <input [(ngModel)]="emailForm.bccEmail" placeholder="a@x.com,b@y.com" class="w-full px-3 py-2 border rounded-lg text-sm">
              <p class="mt-1 text-[11px] text-slate-500">Hidden from the client. CC recipients are visible to each other.</p>
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
            <button (click)="showEmailModal = false" class="standard-action px-4 py-2 border rounded-lg text-sm">Cancel</button>
            <button (click)="submitEmail()" [disabled]="actionBusy"
                    class="compact-action px-4 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700" title="Send" aria-label="Send" data-action-label="Send" data-action-icon="send"><ui-icon name="send" [size]="20" /><span class="compact-action-label">
              {{ sendingEmail ? 'Sending...' : 'Send' }}
            </span></button>
          </div>
        </div>
      </div>
}
    </div>
} @else {

      <div class="p-6 space-y-4">
        <a routerLink="/accounts/invoices" class="text-brand-600 text-sm hover:underline">&larr; Back to Invoices</a>
        <h1 class="text-2xl font-bold text-slate-800">Invoice</h1>
        <div class="bg-white rounded-xl border p-10 text-center text-slate-500">
          @if (!loadError) {
<p>Loading invoice…</p>
}
          @if (loadError) {
<p class="text-red-500">Could not load this invoice. It may have been deleted or you may not have access.</p>
<button (click)="loadInvoice(invoiceId)" class="compact-action mt-3 px-4 py-2 border rounded-lg text-sm" title="Retry invoice" aria-label="Retry invoice" data-action-label="Retry invoice" data-action-icon="refresh"><ui-icon name="refresh" [size]="20" /></button>
}
        </div>
      </div>
    
}


  `,
})
export class BillingInvoiceViewComponent implements OnInit, OnDestroy {
  invoice: Invoice | null = null;
  payments: InvoicePayment[] = [];
  paymentModes = PAYMENT_MODES;
  loadError = false;
  invoiceId = '';
  approving = false;
  cancelling = false;
  private contextVersion = 0;
  private readonly contextChanged = new Subject<void>();
  private routeSubscription?: Subscription;
  private loadSubscription?: Subscription;

  showPaymentModal = false;
  savingPayment = false;
  payForm: any = {};

  showEmailModal = false;
  sendingEmail = false;
  emailForm: any = {};
  emailWarning = '';

  generatingPdf = false;
  showConversionModal = false;
  convertingProforma = false;
  conversionForm = {
    purchaseOrderNumber: '',
    invoiceDate: '',
    dueDate: '',
  };

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private svc: AccountsBillingService,
    private dialog: ConfirmDialogService,
    private toast: ToastService,
  ) {}

  ngOnInit(): void {
    this.routeSubscription = this.route.paramMap.subscribe(params => {
      this.contextVersion++;
      this.contextChanged.next();
      this.emailWarning = '';
      this.approving = this.cancelling = this.savingPayment = false;
      this.generatingPdf = this.sendingEmail = this.convertingProforma = false;
      this.showPaymentModal = this.showEmailModal = this.showConversionModal = false;
      this.invoiceId = params.get('id') || '';
      this.loadInvoice(this.invoiceId);
    });
  }

  ngOnDestroy(): void {
    this.contextVersion++;
    this.contextChanged.next();
    this.contextChanged.complete();
    this.routeSubscription?.unsubscribe();
    this.loadSubscription?.unsubscribe();
  }

  loadInvoice(id: string): void {
    this.loadSubscription?.unsubscribe();
    this.invoice = null;
    this.payments = [];
    this.loadError = false;
    if (!id) { this.loadError = true; return; }
    this.loadSubscription = this.svc.getInvoice(id).subscribe({
      next: (inv) => {
        if (!inv) { this.loadError = true; return; }
        this.invoice = inv;
        this.payments = inv.payments || [];
        this.resetPayForm();
        this.resetEmailForm();
      },
      error: (e) => { console.error('[billing] invoice load failed', e); this.loadError = true; },
    });
  }

  approve(): void {
    if (!this.invoice || this.invoice.invoiceStatus !== 'DRAFT' || this.actionBusy) return;
    this.approving = true;
    this.svc.approveInvoice(this.invoice.id).pipe(takeUntil(this.contextChanged)).subscribe({
      next: (inv) => { this.approving = false; this.invoice = inv; },
      error: (e) => { this.approving = false; this.reportError(e, 'Could not approve invoice'); },
    });
  }

  async cancel(): Promise<void> {
    if (!this.invoice || !this.canCancel() || this.actionBusy) return;
    const id = this.invoice.id;
    const version = this.contextVersion;
    this.cancelling = true;
    let ok: boolean;
    try {
      ok = await this.dialog.confirm(
      'Cancel Invoice',
      'Cancel this invoice?',
      { confirmText: 'Cancel Invoice', variant: 'danger' },
      );
    } catch (e) {
      if (version === this.contextVersion) { this.cancelling = false; this.reportError(e, 'Could not confirm cancellation'); }
      return;
    }
    if (version !== this.contextVersion) return;
    if (!ok || !this.canCancel()) { this.cancelling = false; return; }
    this.svc.cancelInvoice(id).pipe(takeUntil(this.contextChanged)).subscribe({
      next: (inv) => { this.cancelling = false; this.invoice = inv; },
      error: (e) => { this.cancelling = false; this.reportError(e, 'Could not cancel invoice'); },
    });
  }

  generatePdf(): void {
    if (!this.invoice || this.actionBusy) return;
    const id = this.invoice.id;
    this.generatingPdf = true;
    const invNum = this.invoice.invoiceNumber;
    this.svc.generatePdf(id).pipe(takeUntil(this.contextChanged)).subscribe({
      next: (blob: Blob) => {
        this.generatingPdf = false;
        try {
          const url = URL.createObjectURL(blob);
          // Open in new tab for preview
          window.open(url, '_blank');
          // Also trigger a download with a sensible filename
          const a = document.createElement('a');
          a.href = url;
          a.download = `${(invNum || 'invoice').replace(/[/\\]/g, '-')}.pdf`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(url), 60000);
        } catch (e) {
          console.error('[billing] PDF open failed', e);
        }
        this.loadInvoice(id);
      },
      error: (e) => {
        this.generatingPdf = false;
        console.error('[billing] generate PDF failed', e);
        this.toast.error('Failed to generate PDF. ' + (e?.error?.message || e?.message || ''));
      },
    });
  }

  openTaxInvoiceConversion(): void {
    if (!this.invoice || !this.canConvert() || this.actionBusy) return;
    if (this.invoice.convertedInvoice) {
      this.router.navigate([
        '/accounts/invoices',
        this.invoice.convertedInvoice.id,
      ]);
      return;
    }

    const invoiceDate = this.localDate(new Date());
    const dueDate = new Date(`${invoiceDate}T00:00:00`);
    dueDate.setDate(
      dueDate.getDate() + (this.invoice.billingClient?.paymentTermsDays ?? 30),
    );
    this.conversionForm = {
      purchaseOrderNumber: '',
      invoiceDate,
      dueDate: this.localDate(dueDate),
    };
    this.showConversionModal = true;
  }

  submitTaxInvoiceConversion(): void {
    if (
      !this.invoice ||
      !this.canConvert() || this.actionBusy ||
      !this.conversionForm.purchaseOrderNumber.trim() ||
      !this.conversionForm.invoiceDate
    ) {
      return;
    }

    this.convertingProforma = true;
    this.svc
      .convertProformaToTaxInvoice(this.invoice.id, {
        purchaseOrderNumber:
          this.conversionForm.purchaseOrderNumber.trim(),
        invoiceDate: this.conversionForm.invoiceDate,
        dueDate: this.conversionForm.dueDate || undefined,
      })
      .pipe(takeUntil(this.contextChanged)).subscribe({
        next: (taxInvoice) => {
          this.convertingProforma = false;
          this.showConversionModal = false;
          this.toast.success(
            `Tax Invoice ${taxInvoice.invoiceNumber} generated`,
          );
          this.router.navigate(['/accounts/invoices', taxInvoice.id]);
        },
        error: (e) => {
          this.convertingProforma = false;
          this.toast.error(
            e?.error?.message ||
              e?.message ||
              'Failed to generate Tax Invoice',
          );
        },
      });
  }

  resetPayForm(): void {
    this.payForm = {
      paymentDate: this.localDate(new Date()),
      amountReceived: Number(this.invoice?.balanceOutstanding || 0),
      tdsAmount: 0, otherDeduction: 0,
      paymentMode: 'BANK_TRANSFER', referenceNumber: '', remarks: '',
    };
  }

  submitPayment(): void {
    if (!this.invoice || !this.canRecordPayment() || this.actionBusy) return;
    const amount = Number(this.payForm.amountReceived);
    const tds = Number(this.payForm.tdsAmount ?? 0);
    const deduction = Number(this.payForm.otherDeduction ?? 0);
    if (!this.payForm.paymentDate || ![amount, tds, deduction].every(value =>
      Number.isFinite(value) && value >= 0 && Math.abs(value * 100 - Math.round(value * 100)) < 0.000001,
    ) || amount <= tds + deduction || amount - Number(this.invoice.balanceOutstanding) > 0.01) {
      this.toast.error('Enter a payment date and valid amounts. Deductions must be below the settled amount, which cannot exceed the balance.');
      return;
    }
    const id = this.invoice.id;
    this.savingPayment = true;
    this.svc.recordPayment(id, { ...this.payForm, amountReceived: amount, tdsAmount: tds, otherDeduction: deduction })
      .pipe(takeUntil(this.contextChanged)).subscribe({
      next: () => {
        this.savingPayment = false;
        this.showPaymentModal = false;
        this.loadInvoice(id);
      },
      error: (e) => { this.savingPayment = false; this.reportError(e, 'Could not record payment'); },
    });
  }

  openEmail(): void {
    if (!this.invoice || this.actionBusy) return;
    this.resetEmailForm();
    this.showEmailModal = true;
  }

  resetEmailForm(): void {
    const references = [
      this.invoice?.proformaReferenceNumber
        ? `Proforma ${this.invoice.proformaReferenceNumber}`
        : '',
      this.invoice?.purchaseOrderNumber
        ? `PO ${this.invoice.purchaseOrderNumber}`
        : '',
    ].filter(Boolean);
    this.emailForm = {
      requestId: crypto.randomUUID(),
      toEmail: this.invoice?.billingClient?.billingEmail || '',
      ccEmail: this.invoice?.billingClient?.ccEmail || '',
      // Prefilled from the client so a standing blind copy is not forgotten on
      // a one-off send; still editable for this invoice only.
      bccEmail: this.invoice?.billingClient?.bccEmail || '',
      subject: this.invoice
        ? `Invoice ${this.invoice.invoiceNumber}${
            references.length ? ` | ${references.join(' | ')}` : ''
          } from StatCo Solutions`
        : '',
      body: '',
    };
  }

  submitEmail(): void {
    if (!this.invoice || this.actionBusy) return;
    this.emailForm.requestId ||= crypto.randomUUID();
    const id = this.invoice.id;
    this.sendingEmail = true;
    this.svc.sendInvoiceEmail(id, this.emailForm).pipe(takeUntil(this.contextChanged)).subscribe({
      next: (result) => {
        this.sendingEmail = false;
        if (!result?.success) {
          this.toast.error(result?.error || 'Invoice email was not sent');
          return;
        }
        this.showEmailModal = false;
        this.emailWarning = result.statusUpdatePending
          ? (result.warning || 'The mail server accepted this email, but its saved status needs reconciliation. Do not resend; contact your administrator.')
          : '';
        if (this.emailWarning) this.toast.warning('Email accepted; status update pending');
        else this.toast.success('Invoice email sent');
        this.loadInvoice(id);
      },
      error: (e) => { this.sendingEmail = false; this.reportError(e, 'Could not send invoice email'); },
    });
  }

  fmt(n: any): string {
    return (+n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // Mirrors the backend EDITABLE_STATUSES guard in invoices.service.ts —
  // invoices with recorded payments or that are cancelled cannot be edited.
  isEditable(): boolean {
    if (!this.invoice) return false;
    const editableStatuses = ['DRAFT', 'APPROVED', 'GENERATED', 'EMAILED', 'OVERDUE'];
    return (
      editableStatuses.includes(this.invoice.invoiceStatus) &&
      this.invoice.paymentStatus === 'UNPAID'
    );
  }

  get actionBusy(): boolean {
    return this.approving || this.cancelling || this.savingPayment || this.sendingEmail || this.generatingPdf || this.convertingProforma;
  }

  canCancel(): boolean {
    return !!this.invoice && !['CANCELLED', 'PAID', 'PARTIALLY_PAID'].includes(this.invoice.invoiceStatus)
      && this.invoice.paymentStatus === 'UNPAID' && Number(this.invoice.amountReceived) === 0;
  }

  canRecordPayment(): boolean {
    return !!this.invoice && this.invoice.invoiceType !== 'PROFORMA'
      && !['DRAFT', 'CANCELLED', 'PAID'].includes(this.invoice.invoiceStatus)
      && this.invoice.paymentStatus !== 'PAID' && Number(this.invoice.balanceOutstanding) > 0;
  }

  canConvert(): boolean {
    return !!this.invoice && this.invoice.invoiceType === 'PROFORMA'
      && (!!this.invoice.convertedInvoice || (this.invoice.invoiceStatus !== 'CANCELLED' && this.invoice.paymentStatus === 'UNPAID'));
  }

  openPayment(): void {
    if (!this.canRecordPayment() || this.actionBusy) return;
    this.resetPayForm();
    this.showPaymentModal = true;
  }

  private reportError(error: any, fallback: string): void {
    const message = error?.error?.message;
    this.toast.error(Array.isArray(message) ? message.join('. ') : message || fallback);
  }

  private localDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
