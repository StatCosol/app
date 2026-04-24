import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { AccountsBillingService } from '../services/accounts-billing.service';
import { Invoice, INVOICE_STATUSES } from '../models/billing.models';

@Component({
  selector: 'app-billing-invoices',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  template: `
    <div class="p-6 space-y-6">
      <div class="flex items-center justify-between">
        <h1 class="text-2xl font-bold text-slate-800">Invoices</h1>
        <a routerLink="/admin/billing/create-invoice"
           class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium">
          + New Invoice
        </a>
      </div>

      <!-- Filters -->
      <div class="flex flex-wrap gap-3">
        <input [(ngModel)]="search" (keyup.enter)="load()" placeholder="Search invoice # or client..."
               class="px-3 py-2 border rounded-lg text-sm w-64 focus:ring-2 focus:ring-blue-500 outline-none">
        <select [(ngModel)]="statusFilter" (change)="load()" class="px-3 py-2 border rounded-lg text-sm">
          <option value="">All Status</option>
          <option *ngFor="let s of statuses" [value]="s">{{ s }}</option>
        </select>
        <select [(ngModel)]="paymentFilter" (change)="load()" class="px-3 py-2 border rounded-lg text-sm">
          <option value="">All Payments</option>
          <option value="UNPAID">Unpaid</option>
          <option value="PARTIALLY_PAID">Partial</option>
          <option value="PAID">Paid</option>
        </select>
        <input [(ngModel)]="fromDate" (change)="load()" type="date" class="px-3 py-2 border rounded-lg text-sm">
        <input [(ngModel)]="toDate" (change)="load()" type="date" class="px-3 py-2 border rounded-lg text-sm">
      </div>

      <!-- Table -->
      <div class="bg-white rounded-xl border shadow-sm overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-slate-50 text-slate-500 uppercase text-xs">
            <tr>
              <th class="px-4 py-3 text-left">Invoice #</th>
              <th class="px-4 py-3 text-left">Client</th>
              <th class="px-4 py-3 text-left">Type</th>
              <th class="px-4 py-3 text-left">Date</th>
              <th class="px-4 py-3 text-right">Grand Total</th>
              <th class="px-4 py-3 text-right">Balance</th>
              <th class="px-4 py-3 text-center">Status</th>
              <th class="px-4 py-3 text-center">Payment</th>
              <th class="px-4 py-3 text-center">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y">
            <tr *ngFor="let inv of invoices" class="hover:bg-slate-50">
              <td class="px-4 py-3 font-mono text-xs font-medium">
                <a [routerLink]="['/admin/billing/invoices', inv.id]" class="text-blue-600 hover:underline">{{ inv.invoiceNumber }}</a>
              </td>
              <td class="px-4 py-3">{{ inv.billingClient?.legalName || '—' }}</td>
              <td class="px-4 py-3 text-xs">{{ inv.invoiceType.replace('_',' ') }}</td>
              <td class="px-4 py-3">{{ inv.invoiceDate }}</td>
              <td class="px-4 py-3 text-right font-medium">₹{{ fmt(inv.grandTotal) }}</td>
              <td class="px-4 py-3 text-right" [class.text-red-600]="inv.balanceOutstanding > 0">₹{{ fmt(inv.balanceOutstanding) }}</td>
              <td class="px-4 py-3 text-center">
                <span [class]="statusClass(inv.invoiceStatus)" class="px-2 py-0.5 rounded-full text-xs font-medium">
                  {{ inv.invoiceStatus }}
                </span>
              </td>
              <td class="px-4 py-3 text-center">
                <span [class]="paymentClass(inv.paymentStatus)" class="px-2 py-0.5 rounded-full text-xs font-medium">
                  {{ inv.paymentStatus }}
                </span>
              </td>
              <td class="px-4 py-3 text-center">
                <a [routerLink]="['/admin/billing/invoices', inv.id]" class="text-blue-600 hover:underline text-xs">View</a>
              </td>
            </tr>
            <tr *ngIf="!invoices.length">
              <td colspan="9" class="px-4 py-8 text-center text-slate-400">No invoices found</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="flex items-center justify-between text-sm text-slate-500" *ngIf="totalPages > 1">
        <span>Page {{ page }} of {{ totalPages }} ({{ total }} records)</span>
        <div class="flex gap-2">
          <button (click)="page = page - 1; load()" [disabled]="page <= 1"
                  class="px-3 py-1 border rounded disabled:opacity-50">Prev</button>
          <button (click)="page = page + 1; load()" [disabled]="page >= totalPages"
                  class="px-3 py-1 border rounded disabled:opacity-50">Next</button>
        </div>
      </div>
    </div>
  `,
})
export class BillingInvoicesComponent implements OnInit {
  invoices: Invoice[] = [];
  statuses = INVOICE_STATUSES;
  search = '';
  statusFilter = '';
  paymentFilter = '';
  fromDate = '';
  toDate = '';
  page = 1;
  total = 0;
  totalPages = 0;

  constructor(private svc: AccountsBillingService) {}

  ngOnInit(): void { this.load(); }

  load(): void {
    const p: Record<string, string> = { page: String(this.page) };
    if (this.search) p['search'] = this.search;
    if (this.statusFilter) p['status'] = this.statusFilter;
    if (this.paymentFilter) p['paymentStatus'] = this.paymentFilter;
    if (this.fromDate) p['fromDate'] = this.fromDate;
    if (this.toDate) p['toDate'] = this.toDate;
    this.svc.getInvoices(p).subscribe((r) => {
      this.invoices = r.data;
      this.total = r.total;
      this.totalPages = r.totalPages;
    });
  }

  fmt(n: number): string {
    return (+n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  statusClass(s: string): string {
    const m: Record<string, string> = {
      DRAFT: 'bg-slate-100 text-slate-600', APPROVED: 'bg-blue-100 text-blue-700',
      GENERATED: 'bg-indigo-100 text-indigo-700', EMAILED: 'bg-purple-100 text-purple-700',
      PARTIALLY_PAID: 'bg-amber-100 text-amber-700', PAID: 'bg-green-100 text-green-700',
      OVERDUE: 'bg-red-100 text-red-700', CANCELLED: 'bg-red-50 text-red-500',
    };
    return m[s] || 'bg-slate-100 text-slate-600';
  }

  paymentClass(s: string): string {
    const m: Record<string, string> = {
      UNPAID: 'bg-red-100 text-red-600', PARTIALLY_PAID: 'bg-amber-100 text-amber-600',
      PAID: 'bg-green-100 text-green-700', WRITTEN_OFF: 'bg-slate-100 text-slate-500',
    };
    return m[s] || 'bg-slate-100 text-slate-500';
  }
}
