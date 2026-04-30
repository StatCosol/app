import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { AccountsBillingService } from '../services/accounts-billing.service';
import { InvoicePayment } from '../models/billing.models';

@Component({
  selector: 'app-billing-payments',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  template: `
    <div class="p-6 space-y-6">
      <h1 class="text-2xl font-bold text-slate-800">Payment Receipts</h1>

      <div class="bg-white rounded-xl border shadow-sm overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-slate-50 text-slate-500 uppercase text-xs">
            <tr>
              <th class="px-4 py-3 text-left">Receipt #</th>
              <th class="px-4 py-3 text-left">Invoice #</th>
              <th class="px-4 py-3 text-left">Date</th>
              <th class="px-4 py-3 text-right">Amount</th>
              <th class="px-4 py-3 text-right">TDS</th>
              <th class="px-4 py-3 text-right">Net Received</th>
              <th class="px-4 py-3 text-left">Mode</th>
              <th class="px-4 py-3 text-left">Reference</th>
            </tr>
          </thead>
          <tbody class="divide-y">
            <tr *ngFor="let p of payments" class="hover:bg-slate-50">
              <td class="px-4 py-3 font-mono text-xs">{{ p.receiptNumber }}</td>
              <td class="px-4 py-3">
                <a *ngIf="p.invoice" [routerLink]="['/admin/billing/invoices', p.invoice.id]"
                   class="text-blue-600 hover:underline text-xs font-mono">{{ p.invoice.invoiceNumber }}</a>
              </td>
              <td class="px-4 py-3">{{ p.paymentDate }}</td>
              <td class="px-4 py-3 text-right">₹{{ fmt(p.amountReceived) }}</td>
              <td class="px-4 py-3 text-right">₹{{ fmt(p.tdsAmount) }}</td>
              <td class="px-4 py-3 text-right font-medium text-green-600">₹{{ fmt(p.netReceived) }}</td>
              <td class="px-4 py-3 text-xs">{{ p.paymentMode }}</td>
              <td class="px-4 py-3 text-xs">{{ p.referenceNumber || '—' }}</td>
            </tr>
            <tr *ngIf="!payments.length">
              <td colspan="8" class="px-4 py-8 text-center text-slate-400">No payments found</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="flex items-center justify-between text-sm text-slate-500" *ngIf="totalPages > 1">
        <span>Page {{ page }} of {{ totalPages }}</span>
        <div class="flex gap-2">
          <button (click)="page = page - 1; load()" [disabled]="page <= 1" class="px-3 py-1 border rounded disabled:opacity-50">Prev</button>
          <button (click)="page = page + 1; load()" [disabled]="page >= totalPages" class="px-3 py-1 border rounded disabled:opacity-50">Next</button>
        </div>
      </div>
    </div>
  `,
})
export class BillingPaymentsComponent implements OnInit {
  payments: InvoicePayment[] = [];
  page = 1;
  totalPages = 0;

  constructor(private svc: AccountsBillingService) {}

  ngOnInit(): void { this.load(); }

  load(): void {
    this.svc.getAllPayments({ page: String(this.page) }).subscribe((r) => {
      this.payments = r.data;
      this.totalPages = r.totalPages;
    });
  }

  fmt(n: any): string {
    return (+n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
}
