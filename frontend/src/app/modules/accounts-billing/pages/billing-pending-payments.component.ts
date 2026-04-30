import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AccountsBillingService } from '../services/accounts-billing.service';
import { PendingPaymentFollowup } from '../models/billing.models';

@Component({
  selector: 'app-billing-pending-payments',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="p-6 space-y-6">
      <div class="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 class="text-2xl font-bold text-slate-800">Pending Payments — Follow-ups</h1>
          <p class="text-sm text-slate-500 mt-1">
            Upload a CSV of already-issued invoices awaiting payment. The system can
            send a reminder email to each client immediately.
          </p>
        </div>
        <div class="flex gap-2">
          <button type="button" (click)="downloadTemplate()"
             class="px-3 py-2 text-sm border rounded text-slate-700 hover:bg-slate-50">
            Download CSV Template
          </button>
        </div>
      </div>

      <!-- Upload card -->
      <div class="bg-white border rounded-xl shadow-sm p-5 space-y-3">
        <h2 class="font-semibold text-slate-700">Bulk Upload</h2>
        <p class="text-xs text-slate-500">
          CSV columns: <code>invoiceNumber, clientName, clientEmail, ccEmail, amount, invoiceDate, dueDate, notes</code>.
          Dates accept <code>YYYY-MM-DD</code> or <code>DD/MM/YYYY</code>.
        </p>
        <div class="flex items-center gap-3 flex-wrap">
          <input #fileInput type="file" accept=".csv" (change)="onFile($event)" class="text-sm" />
          <label class="flex items-center gap-2 text-sm">
            <input type="checkbox" [(ngModel)]="autoSend" />
            Send reminder email immediately for each row
          </label>
          <button (click)="upload(fileInput)"
                  [disabled]="!selectedFile || uploading"
                  class="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50">
            {{ uploading ? 'Uploading…' : 'Upload' }}
          </button>
        </div>
        <div *ngIf="uploadResult" class="text-sm bg-slate-50 border rounded p-3 space-y-1">
          <div><strong>Created:</strong> {{ uploadResult.created }}</div>
          <div><strong>Reminders sent:</strong> {{ uploadResult.sent }}
               &nbsp; <strong>Failed:</strong> {{ uploadResult.failed }}</div>
          <div *ngIf="uploadResult.parseErrors?.length" class="text-red-600">
            <strong>Skipped rows:</strong>
            <ul class="list-disc ml-5">
              <li *ngFor="let e of uploadResult.parseErrors">Line {{ e.line }}: {{ e.reason }}</li>
            </ul>
          </div>
        </div>
        <div *ngIf="error" class="text-sm text-red-600">{{ error }}</div>
      </div>

      <!-- Filter -->
      <div class="flex items-center gap-3 flex-wrap">
        <label class="text-sm">Status:</label>
        <select [(ngModel)]="filterStatus" (ngModelChange)="load()"
                class="border rounded px-2 py-1 text-sm">
          <option value="ALL">All</option>
          <option value="PENDING">Pending</option>
          <option value="PAID">Paid</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
        <button *ngIf="selectedIds.size > 0"
                (click)="sendBulk()"
                class="ml-auto px-3 py-1.5 bg-amber-600 text-white text-sm rounded hover:bg-amber-700">
          Send reminder to {{ selectedIds.size }} selected
        </button>
      </div>

      <!-- Table -->
      <div class="bg-white border rounded-xl shadow-sm overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-slate-50 text-slate-500 uppercase text-xs">
            <tr>
              <th class="px-3 py-3"><input type="checkbox" (change)="toggleAll($event)" [checked]="allSelected()" /></th>
              <th class="px-3 py-3 text-left">Invoice #</th>
              <th class="px-3 py-3 text-left">Client</th>
              <th class="px-3 py-3 text-left">Email</th>
              <th class="px-3 py-3 text-right">Amount</th>
              <th class="px-3 py-3 text-left">Due Date</th>
              <th class="px-3 py-3 text-center">Reminders</th>
              <th class="px-3 py-3 text-left">Last Sent</th>
              <th class="px-3 py-3 text-center">Status</th>
              <th class="px-3 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y">
            <tr *ngFor="let p of rows" class="hover:bg-slate-50">
              <td class="px-3 py-2 text-center">
                <input type="checkbox"
                       [checked]="selectedIds.has(p.id)"
                       (change)="toggle(p.id)" />
              </td>
              <td class="px-3 py-2 font-mono text-xs">{{ p.invoiceNumber }}</td>
              <td class="px-3 py-2">{{ p.clientName }}</td>
              <td class="px-3 py-2 text-xs">
                {{ p.clientEmail }}
                <div *ngIf="p.ccEmail" class="text-slate-400">cc: {{ p.ccEmail }}</div>
              </td>
              <td class="px-3 py-2 text-right">₹ {{ p.amount | number:'1.2-2' }}</td>
              <td class="px-3 py-2 text-xs">{{ p.dueDate || '—' }}</td>
              <td class="px-3 py-2 text-center">{{ p.reminderCount }}</td>
              <td class="px-3 py-2 text-xs">
                <span *ngIf="p.lastReminderSentAt">
                  {{ p.lastReminderSentAt | date:'short' }}
                  <span [class]="p.lastReminderStatus === 'SENT' ? 'text-green-600' : 'text-red-600'">
                    ({{ p.lastReminderStatus }})
                  </span>
                </span>
                <span *ngIf="!p.lastReminderSentAt" class="text-slate-400">never</span>
              </td>
              <td class="px-3 py-2 text-center">
                <span [class]="statusClass(p.status)"
                      class="px-2 py-0.5 rounded-full text-xs font-medium">{{ p.status }}</span>
              </td>
              <td class="px-3 py-2 text-right whitespace-nowrap">
                <button *ngIf="p.status === 'PENDING'"
                        (click)="sendOne(p)"
                        class="text-blue-600 hover:underline text-xs mr-2">Remind</button>
                <button *ngIf="p.status === 'PENDING'"
                        (click)="markPaid(p)"
                        class="text-green-600 hover:underline text-xs mr-2">Mark Paid</button>
                <button (click)="onDelete(p)"
                        class="text-red-600 hover:underline text-xs">Delete</button>
              </td>
            </tr>
            <tr *ngIf="!rows.length">
              <td colspan="10" class="px-4 py-10 text-center text-slate-400">
                No pending payments. Upload a CSV to get started.
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div *ngIf="totalPages > 1" class="flex items-center justify-between text-sm text-slate-500">
        <span>Page {{ page }} of {{ totalPages }}</span>
        <div class="flex gap-2">
          <button (click)="page = page - 1; load()" [disabled]="page <= 1"
                  class="px-3 py-1 border rounded disabled:opacity-50">Prev</button>
          <button (click)="page = page + 1; load()" [disabled]="page >= totalPages"
                  class="px-3 py-1 border rounded disabled:opacity-50">Next</button>
        </div>
      </div>

      <div *ngIf="message"
           [class]="messageError ? 'bg-red-50 border-red-200 text-red-700' : 'bg-green-50 border-green-200 text-green-700'"
           class="border px-4 py-2 rounded text-sm">
        {{ message }}
      </div>
    </div>
  `,
})
export class BillingPendingPaymentsComponent implements OnInit {
  rows: PendingPaymentFollowup[] = [];
  page = 1;
  totalPages = 0;
  filterStatus = 'PENDING';

  selectedFile: File | null = null;
  uploading = false;
  autoSend = true;
  uploadResult: any = null;

  selectedIds = new Set<string>();
  message = '';
  messageError = false;
  error = '';

  templateUrl: string;

  constructor(private svc: AccountsBillingService) {
    this.templateUrl = svc.pendingPaymentsCsvTemplateUrl();
  }

  ngOnInit(): void {
    this.load();
  }

  downloadTemplate(): void {
    this.svc.downloadPendingPaymentsCsvTemplate().subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'pending-payments-template.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      },
      error: (e) => this.flash('Template download failed: ' + (e.error?.message || e.message), true),
    });
  }

  load(): void {
    this.svc.listPendingPayments({
      status: this.filterStatus,
      page: String(this.page),
    }).subscribe({
      next: (r: any) => {
        this.rows = r?.data || [];
        this.totalPages = r?.totalPages || 0;
        this.selectedIds.clear();
      },
      error: (e) => {
        this.flash('Load failed: ' + (e.error?.message || e.message), true);
      },
    });
  }

  onFile(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    this.selectedFile = input.files?.[0] || null;
    this.uploadResult = null;
    this.error = '';
  }

  upload(fileInput: HTMLInputElement): void {
    if (!this.selectedFile) return;
    this.uploading = true;
    this.error = '';
    this.svc.uploadPendingPaymentsCsv(this.selectedFile, this.autoSend).subscribe({
      next: (r) => {
        this.uploading = false;
        this.uploadResult = r;
        this.selectedFile = null;
        if (fileInput) fileInput.value = '';
        this.load();
      },
      error: (e) => {
        this.uploading = false;
        this.error = e.error?.message || e.message || 'Upload failed';
      },
    });
  }

  toggle(id: string): void {
    if (this.selectedIds.has(id)) this.selectedIds.delete(id);
    else this.selectedIds.add(id);
  }

  allSelected(): boolean {
    return this.rows.length > 0 && this.rows.every((r) => this.selectedIds.has(r.id));
  }

  toggleAll(ev: Event): void {
    const checked = (ev.target as HTMLInputElement).checked;
    if (checked) this.rows.forEach((r) => this.selectedIds.add(r.id));
    else this.rows.forEach((r) => this.selectedIds.delete(r.id));
  }

  sendOne(p: PendingPaymentFollowup): void {
    if (!confirm(`Send reminder to ${p.clientEmail} for invoice ${p.invoiceNumber}?`)) return;
    this.svc.sendPendingPaymentReminder(p.id).subscribe({
      next: (r) => {
        this.flash(r?.success ? 'Reminder sent.' : 'Reminder send failed.', !r?.success);
        this.load();
      },
      error: (e) => this.flash('Send failed: ' + (e.error?.message || e.message), true),
    });
  }

  sendBulk(): void {
    const ids = Array.from(this.selectedIds);
    if (!ids.length) return;
    if (!confirm(`Send reminders to ${ids.length} client(s)?`)) return;
    this.svc.sendPendingPaymentReminders(ids).subscribe({
      next: (r) => {
        this.flash(`Sent: ${r.sent}, failed: ${r.failed}, skipped: ${r.skipped}.`,
          r.failed > 0);
        this.load();
      },
      error: (e) => this.flash('Bulk send failed: ' + (e.error?.message || e.message), true),
    });
  }

  markPaid(p: PendingPaymentFollowup): void {
    if (!confirm(`Mark invoice ${p.invoiceNumber} as PAID?`)) return;
    this.svc.updatePendingPayment(p.id, { status: 'PAID' }).subscribe({
      next: () => { this.flash('Marked paid.'); this.load(); },
      error: (e) => this.flash('Update failed: ' + (e.error?.message || e.message), true),
    });
  }

  onDelete(p: PendingPaymentFollowup): void {
    if (!confirm(`Delete pending entry for invoice ${p.invoiceNumber}?`)) return;
    this.svc.deletePendingPayment(p.id).subscribe({
      next: () => { this.flash('Deleted.'); this.load(); },
      error: (e) => this.flash('Delete failed: ' + (e.error?.message || e.message), true),
    });
  }

  statusClass(s: string): string {
    if (s === 'PAID') return 'bg-green-100 text-green-700';
    if (s === 'CANCELLED') return 'bg-slate-100 text-slate-600';
    return 'bg-amber-100 text-amber-700';
  }

  flash(msg: string, isError = false): void {
    this.message = msg;
    this.messageError = isError;
    setTimeout(() => (this.message = ''), 5000);
  }
}
