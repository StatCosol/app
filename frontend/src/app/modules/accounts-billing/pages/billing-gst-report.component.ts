import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AccountsBillingService } from '../services/accounts-billing.service';

@Component({
  selector: 'app-billing-gst-report',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="p-6 space-y-6">
      <h1 class="text-2xl font-bold text-slate-800">GST Summary Report</h1>

      <div class="flex gap-3 items-end">
        <div>
          <label class="block text-xs font-medium text-slate-600 mb-1">From Date</label>
          <input [(ngModel)]="fromDate" type="date" class="px-3 py-2 border rounded-lg text-sm">
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-600 mb-1">To Date</label>
          <input [(ngModel)]="toDate" type="date" class="px-3 py-2 border rounded-lg text-sm">
        </div>
        <button (click)="load()" [disabled]="loading" class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
          {{ loading ? 'Loading...' : 'Generate' }}
        </button>
      </div>

      <!-- Empty state -->
      <div *ngIf="loaded && !rows.length && !loading" class="bg-white rounded-xl border shadow-sm p-10 text-center">
        <svg class="mx-auto h-12 w-12 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z"/>
        </svg>
        <p class="mt-3 text-sm text-slate-500">No invoices found for the selected date range.</p>
        <p class="text-xs text-slate-400 mt-1">Try adjusting the dates or create invoices first.</p>
      </div>

      <!-- Totals -->
      <div class="grid grid-cols-2 md:grid-cols-5 gap-4" *ngIf="rows.length">
        <div class="bg-white rounded-xl border p-4">
          <p class="text-xs text-slate-400">Taxable Value</p>
          <p class="text-xl font-bold text-slate-800">₹{{ fmt(totals.taxable) }}</p>
        </div>
        <div class="bg-white rounded-xl border p-4">
          <p class="text-xs text-slate-400">CGST</p>
          <p class="text-xl font-bold text-blue-600">₹{{ fmt(totals.cgst) }}</p>
        </div>
        <div class="bg-white rounded-xl border p-4">
          <p class="text-xs text-slate-400">SGST</p>
          <p class="text-xl font-bold text-blue-600">₹{{ fmt(totals.sgst) }}</p>
        </div>
        <div class="bg-white rounded-xl border p-4">
          <p class="text-xs text-slate-400">IGST</p>
          <p class="text-xl font-bold text-purple-600">₹{{ fmt(totals.igst) }}</p>
        </div>
        <div class="bg-white rounded-xl border p-4">
          <p class="text-xs text-slate-400">Grand Total</p>
          <p class="text-xl font-bold text-green-600">₹{{ fmt(totals.grand) }}</p>
        </div>
      </div>

      <div class="bg-white rounded-xl border shadow-sm overflow-x-auto" *ngIf="rows.length">
        <table class="w-full text-sm">
          <thead class="bg-slate-50 text-slate-500 uppercase text-xs">
            <tr>
              <th class="px-4 py-3 text-left">Invoice #</th>
              <th class="px-4 py-3 text-left">Date</th>
              <th class="px-4 py-3 text-left">Client</th>
              <th class="px-4 py-3 text-left">Client GSTIN</th>
              <th class="px-4 py-3 text-right">Taxable</th>
              <th class="px-4 py-3 text-right">CGST</th>
              <th class="px-4 py-3 text-right">SGST</th>
              <th class="px-4 py-3 text-right">IGST</th>
              <th class="px-4 py-3 text-right">Grand Total</th>
            </tr>
          </thead>
          <tbody class="divide-y">
            <tr *ngFor="let r of rows" class="hover:bg-slate-50">
              <td class="px-4 py-2 font-mono text-xs">{{ r.invoiceNumber }}</td>
              <td class="px-4 py-2">{{ r.invoiceDate }}</td>
              <td class="px-4 py-2">{{ r.clientName }}</td>
              <td class="px-4 py-2 font-mono text-xs">{{ r.clientGstin || '—' }}</td>
              <td class="px-4 py-2 text-right">₹{{ fmt(r.taxableValue) }}</td>
              <td class="px-4 py-2 text-right">₹{{ fmt(r.cgstAmount) }}</td>
              <td class="px-4 py-2 text-right">₹{{ fmt(r.sgstAmount) }}</td>
              <td class="px-4 py-2 text-right">₹{{ fmt(r.igstAmount) }}</td>
              <td class="px-4 py-2 text-right font-medium">₹{{ fmt(r.grandTotal) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `,
})
export class BillingGstReportComponent implements OnInit {
  fromDate = '';
  toDate = '';
  rows: any[] = [];
  totals = { taxable: 0, cgst: 0, sgst: 0, igst: 0, grand: 0 };
  loading = false;
  loaded = false;

  constructor(private svc: AccountsBillingService) {}

  ngOnInit(): void {
    const now = new Date();
    const fy = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    this.fromDate = `${fy}-04-01`;
    this.toDate = now.toISOString().split('T')[0];
  }

  load(): void {
    this.loading = true;
    this.svc.getGstSummary(this.fromDate, this.toDate).subscribe({
      next: (data) => {
        this.rows = data;
        this.totals = {
          taxable: data.reduce((s: number, r: any) => s + (+r.taxableValue || 0), 0),
          cgst: data.reduce((s: number, r: any) => s + (+r.cgstAmount || 0), 0),
          sgst: data.reduce((s: number, r: any) => s + (+r.sgstAmount || 0), 0),
          igst: data.reduce((s: number, r: any) => s + (+r.igstAmount || 0), 0),
          grand: data.reduce((s: number, r: any) => s + (+r.grandTotal || 0), 0),
        };
        this.loading = false;
        this.loaded = true;
      },
      error: () => {
        this.loading = false;
        this.loaded = true;
      },
    });
  }

  fmt(n: any): string {
    return (+n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
}
