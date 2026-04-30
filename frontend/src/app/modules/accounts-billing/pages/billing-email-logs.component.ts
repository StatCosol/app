import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { AccountsBillingService } from '../services/accounts-billing.service';
import { InvoiceEmailLog } from '../models/billing.models';

@Component({
  selector: 'app-billing-email-logs',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  template: `
    <div class="p-6 space-y-6">
      <h1 class="text-2xl font-bold text-slate-800">Email Logs</h1>

      <div class="bg-white rounded-xl border shadow-sm overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-slate-50 text-slate-500 uppercase text-xs">
            <tr>
              <th class="px-4 py-3 text-left">Invoice #</th>
              <th class="px-4 py-3 text-left">To</th>
              <th class="px-4 py-3 text-left">Subject</th>
              <th class="px-4 py-3 text-center">Status</th>
              <th class="px-4 py-3 text-left">Sent At</th>
              <th class="px-4 py-3 text-left">Failure Reason</th>
            </tr>
          </thead>
          <tbody class="divide-y">
            <tr *ngFor="let l of logs" class="hover:bg-slate-50">
              <td class="px-4 py-3">
                <a *ngIf="l.invoice" [routerLink]="['/admin/billing/invoices', l.invoice.id]"
                   class="text-blue-600 hover:underline text-xs font-mono">{{ l.invoice.invoiceNumber }}</a>
              </td>
              <td class="px-4 py-3">{{ l.toEmail }}</td>
              <td class="px-4 py-3 max-w-xs truncate">{{ l.subject }}</td>
              <td class="px-4 py-3 text-center">
                <span [class]="l.sentStatus === 'SENT' || l.sentStatus === 'DELIVERED' ? 'bg-green-100 text-green-700' : l.sentStatus === 'FAILED' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'"
                      class="px-2 py-0.5 rounded-full text-xs font-medium">{{ l.sentStatus }}</span>
              </td>
              <td class="px-4 py-3 text-xs">{{ l.sentAt || '—' }}</td>
              <td class="px-4 py-3 text-xs text-red-500 max-w-xs truncate">{{ l.failureReason || '' }}</td>
            </tr>
            <tr *ngIf="!logs.length">
              <td colspan="6" class="px-4 py-8 text-center text-slate-400">No email logs</td>
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
export class BillingEmailLogsComponent implements OnInit {
  logs: InvoiceEmailLog[] = [];
  page = 1;
  totalPages = 0;

  constructor(private svc: AccountsBillingService) {}

  ngOnInit(): void { this.load(); }

  load(): void {
    this.svc.getEmailLogs({ page: String(this.page) }).subscribe((r) => {
      this.logs = r.data;
      this.totalPages = r.totalPages;
    });
  }
}
