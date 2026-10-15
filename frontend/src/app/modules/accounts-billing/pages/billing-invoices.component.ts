import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { IconComponent } from '../../../shared/ui/icon/icon.component';

import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { AccountsBillingService } from '../services/accounts-billing.service';
import { Invoice, INVOICE_STATUSES, INVOICE_TYPES } from '../models/billing.models';

@Component({
  selector: 'app-billing-invoices',
  styles: ['tr.proforma-converted > td { background-color: #ecfdf5; } tr.proforma-converted:hover > td { background-color: #d1fae5; }'],
  standalone: true,
  imports: [IconComponent, FormsModule, RouterModule],
  template: `
    @if (loadError) { <div role="alert" class="p-4 text-red-700">{{ loadError }} <button (click)="load()">Retry</button></div> }
    @if (loading) { <div role="status" class="p-4">Loading…</div> }
    <div class="p-6 space-y-6">
      <div class="flex items-center justify-between">
        <h1 class="text-2xl font-bold text-slate-800">Invoices</h1>
        <a routerLink="/accounts/invoices/new"
           class="compact-action px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition text-sm font-medium" title="New Invoice" aria-label="New Invoice" data-action-label="New Invoice" data-action-icon="plus"><ui-icon name="plus" [size]="20" /></a>
      </div>

      <!-- Filters -->
      <div class="flex flex-wrap gap-3">
        <input [(ngModel)]="search" (keyup.enter)="filtersChanged()" aria-label="Search invoices" placeholder="Search invoice, proforma # or client..."
               class="workspace-search px-3 py-2 border rounded-lg text-sm w-64 focus:ring-2 focus:ring-brand-500 outline-none">
        <select aria-label="Invoice type" [(ngModel)]="typeFilter" (change)="invoiceTypeChanged()" class="px-3 py-2 border rounded-lg text-sm">
          <option value="">All Invoice Types</option>
          @for (type of invoiceTypes; track type.value) { <option [value]="type.value">{{ type.label }}</option> }
        </select>
        <select aria-label="Proforma conversion status" [(ngModel)]="conversionFilter" (change)="conversionChanged()" class="px-3 py-2 border rounded-lg text-sm">
          <option value="">All Conversion Statuses</option>
          <option value="CONVERTED">Tax Invoice Created</option>
          <option value="PENDING">Tax Invoice Not Created</option>
          <option value="CANCELLED">Tax Invoice Cancelled</option>
        </select>
        <select aria-label="Invoice status" [(ngModel)]="statusFilter" (change)="filtersChanged()" class="px-3 py-2 border rounded-lg text-sm">
          <option value="">All Status</option>
          @for (s of statuses; track s) {
<option [value]="s">{{ s }}</option>
}
        </select>
        <select aria-label="Payment status" [disabled]="typeFilter === 'PROFORMA'" [(ngModel)]="paymentFilter" (change)="filtersChanged()" class="px-3 py-2 border rounded-lg text-sm">
          <option value="">All Payments</option>
          <option value="UNPAID">Unpaid</option>
          <option value="PARTIALLY_PAID">Partial</option>
          <option value="PAID">Paid</option>
        </select>
        <input [(ngModel)]="fromDate" (change)="filtersChanged()" type="date" class="px-3 py-2 border rounded-lg text-sm">
        <input [(ngModel)]="toDate" (change)="filtersChanged()" type="date" class="px-3 py-2 border rounded-lg text-sm">
      </div>

      <p class="text-sm text-slate-600">Green proforma rows have a tax invoice. Open the linked number to view it; its current status is shown alongside.</p>
      <!-- Table -->
      <div class="bg-white rounded-xl border shadow-sm overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-slate-50 text-slate-500 uppercase text-xs">
            <tr>
              <th class="px-4 py-3 text-left">Invoice #</th>
              <th class="px-4 py-3 text-left">Client</th>
              <th class="px-4 py-3 text-left">Type</th>
              <th class="px-4 py-3 text-left">Tax Invoice / Proforma Link</th>
              <th class="px-4 py-3 text-left">Date</th>
              <th class="px-4 py-3 text-right">Grand Total</th>
              <th class="px-4 py-3 text-right">Balance</th>
              <th class="px-4 py-3 text-center">Status</th>
              <th class="px-4 py-3 text-center">Payment</th>
              <th class="px-4 py-3 text-center">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y">
            @for (inv of invoices; track inv) {
<tr class="hover:bg-slate-50" [class.proforma-converted]="hasActiveTaxInvoice(inv)" [attr.data-invoice-id]="inv.id">
              <td class="px-4 py-3 font-mono text-xs font-medium">
                <a [routerLink]="['/accounts/invoices', inv.id]" class="text-brand-600 hover:underline">{{ inv.invoiceNumber }}</a>
              </td>
              <td class="px-4 py-3">{{ inv.billingClient?.legalName || '—' }}</td>
              <td class="px-4 py-3 text-xs">{{ inv.invoiceType.replace('_',' ') }}</td>
              <td class="px-4 py-3 text-xs">
                @if (inv.invoiceType === 'PROFORMA') {
                  @if (inv.convertedInvoice; as tax) {
                    <span class="inline-block px-2 py-1 rounded-full font-medium" [class]="tax.invoiceStatus === 'CANCELLED' ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-900'">{{ tax.invoiceStatus === 'CANCELLED' ? 'Tax invoice cancelled' : 'Tax invoice created' }}</span>
                    <a class="block mt-1 text-brand-700 underline font-mono" [routerLink]="['/accounts/invoices', tax.id]">{{ tax.invoiceNumber }}</a>
                    <span class="block mt-1 text-slate-600">{{ tax.invoiceStatus }}</span>
                  } @else { <span class="text-slate-600">Tax invoice not created</span> }
                } @else if (inv.proformaReferenceNumber) {
                  <span class="block text-slate-500">From proforma</span>
                  @if (inv.convertedFromProformaId) {
                    <a class="text-brand-700 underline font-mono" [routerLink]="['/accounts/invoices', inv.convertedFromProformaId]">{{ inv.proformaReferenceNumber }}</a>
                  } @else { <span>{{ inv.proformaReferenceNumber }}</span> }
                } @else { <span>—</span> }
              </td>
              <td class="px-4 py-3">{{ inv.invoiceDate }}</td>
              <td class="px-4 py-3 text-right font-medium">₹{{ fmt(inv.grandTotal) }}</td>
              <td class="px-4 py-3 text-right" [class.text-red-600]="(inv.invoiceType !== 'PROFORMA' || hasHistoricalPayment(inv)) && inv.balanceOutstanding > 0">
                {{ inv.invoiceType === 'PROFORMA' && !hasHistoricalPayment(inv) ? '—' : '₹' + fmt(inv.balanceOutstanding) }}
              </td>
              <td class="px-4 py-3 text-center">
                <span [class]="statusClass(inv.invoiceStatus)" class="px-2 py-0.5 rounded-full text-xs font-medium">
                  {{ inv.invoiceStatus }}
                </span>
              </td>
              <td class="px-4 py-3 text-center">
                <span [class]="paymentClass(inv)" class="px-2 py-0.5 rounded-full text-xs font-medium">
                  {{ paymentLabel(inv) }}
                </span>
              </td>
              <td class="px-4 py-3 text-center">
                <a [routerLink]="['/accounts/invoices', inv.id]" class="compact-action text-brand-600 hover:underline text-xs" title="View" aria-label="View" data-action-label="View" data-action-icon="eye"><ui-icon name="eye" [size]="20" /></a>
              </td>
            </tr>
}
            @if (!loading && !loadError && !invoices.length) {
<tr>
              <td colspan="10" class="px-4 py-8 text-center text-slate-400">No invoices found</td>
            </tr>
}
          </tbody>
        </table>
      </div>

      @if (totalPages > 1) {
<div class="flex items-center justify-between text-sm text-slate-500">
        <span>Page {{ page }} of {{ totalPages }} ({{ total }} records)</span>
        <div class="flex gap-2">
          <button (click)="page = page - 1; load()" [disabled]="page <= 1"
                  class="standard-action px-3 py-1 border rounded disabled:opacity-50">Prev</button>
          <button (click)="page = page + 1; load()" [disabled]="page >= totalPages"
                  class="standard-action px-3 py-1 border rounded disabled:opacity-50">Next</button>
        </div>
      </div>
}
    </div>
  `,
})
export class BillingInvoicesComponent implements OnInit {
  invoices: Invoice[] = [];
  statuses = INVOICE_STATUSES;
  invoiceTypes = INVOICE_TYPES;
  typeFilter = '';
  conversionFilter = '';
  search = '';
  statusFilter = '';
  paymentFilter = '';
  fromDate = '';
  toDate = '';
  page = 1;
  loadError = '';
  loading = false;
  private loadGeneration = 0;
  total = 0;
  totalPages = 0;

  constructor(private svc: AccountsBillingService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void { this.load(); }

  hasActiveTaxInvoice(invoice: Invoice): boolean {
    return invoice.invoiceType === 'PROFORMA' && !!invoice.convertedInvoice && invoice.convertedInvoice.invoiceStatus !== 'CANCELLED';
  }

  filtersChanged(): void { this.page = 1; this.load(); }

  invoiceTypeChanged(): void {
    if (this.typeFilter !== 'PROFORMA') this.conversionFilter = '';
    if (this.typeFilter === 'PROFORMA') this.paymentFilter = '';
    this.filtersChanged();
  }

  conversionChanged(): void {
    if (this.conversionFilter) { this.typeFilter = 'PROFORMA'; this.paymentFilter = ''; }
    this.filtersChanged();
  }

  load(): void {
    const generation = ++this.loadGeneration;
    this.loading = true;
    this.loadError = '';
    this.invoices = [];
    const p: Record<string, string> = { page: String(this.page) };
    if (this.typeFilter) p['invoiceType'] = this.typeFilter;
    if (this.conversionFilter) p['conversionStatus'] = this.conversionFilter;
    if (this.search) p['search'] = this.search;
    if (this.statusFilter) p['status'] = this.statusFilter;
    if (this.paymentFilter) p['paymentStatus'] = this.paymentFilter;
    if (this.fromDate) p['fromDate'] = this.fromDate;
    if (this.toDate) p['toDate'] = this.toDate;
    this.svc.getInvoices(p).subscribe({
      next: (r) => {
        if (generation !== this.loadGeneration) return;
        this.loading = false;
        this.cdr.markForCheck();
        this.invoices = (r && r.data) || [];
        this.total = (r && r.total) || 0;
        this.totalPages = (r && r.totalPages) || 0;
      },
      error: () => { if (generation !== this.loadGeneration) return; this.loading = false; this.loadError = 'Unable to load invoices. Please retry.'; this.invoices = []; this.total = 0; this.totalPages = 0; this.cdr.markForCheck(); },
    });
  }

  fmt(n: number): string {
    return (+n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  statusClass(s: string): string {
    const m: Record<string, string> = {
      DRAFT: 'bg-slate-100 text-slate-600', APPROVED: 'bg-brand-100 text-brand-700',
      GENERATED: 'bg-brand-100 text-brand-700', EMAILED: 'bg-purple-100 text-purple-700',
      PARTIALLY_PAID: 'bg-amber-100 text-amber-700', PAID: 'bg-green-100 text-green-700',
      OVERDUE: 'bg-red-100 text-red-700', CANCELLED: 'bg-red-50 text-red-500',
    };
    return m[s] || 'bg-slate-100 text-slate-600';
  }

  paymentLabel(invoice: Invoice): string {
    return invoice.invoiceType === 'PROFORMA' && !this.hasHistoricalPayment(invoice)
      ? 'N/A'
      : invoice.paymentStatus;
  }

  paymentClass(invoice: Invoice): string {
    if (invoice.invoiceType === 'PROFORMA' && !this.hasHistoricalPayment(invoice)) {
      return 'bg-slate-100 text-slate-500';
    }
    const s = invoice.paymentStatus;
    const m: Record<string, string> = {
      UNPAID: 'bg-red-100 text-red-600', PARTIALLY_PAID: 'bg-amber-100 text-amber-600',
      PAID: 'bg-green-100 text-green-700', WRITTEN_OFF: 'bg-slate-100 text-slate-500',
    };
    return m[s] || 'bg-slate-100 text-slate-500';
  }

  hasHistoricalPayment(invoice: Invoice): boolean {
    return +invoice.amountReceived > 0 || invoice.paymentStatus !== 'UNPAID';
  }
}
