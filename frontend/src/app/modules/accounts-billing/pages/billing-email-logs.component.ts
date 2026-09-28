import { Component, OnInit, OnDestroy } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Subscription } from 'rxjs';
import { AuthService } from '../../../core/auth.service';
import { IconComponent } from '../../../shared/ui/icon/icon.component';

import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { AccountsBillingService } from '../services/accounts-billing.service';
import { InvoiceEmailLog, InvoiceFileInventory } from '../models/billing.models';

@Component({
  selector: 'app-billing-email-logs',
  standalone: true,
  imports: [FormsModule, RouterModule, DatePipe, IconComponent],
  template: `
    <div class="p-6 space-y-6">
      <header class="flex items-center justify-between gap-4">
        <h1 class="text-2xl font-bold text-slate-800">Email Logs</h1>
        <button
          type="button"
          class="icon-action"
          title="Refresh email logs"
          aria-label="Refresh email logs"
          (click)="load()"
          [disabled]="loading || saving"
        >
          <ui-icon name="refresh" />
        </button>
      </header>
      @if (error) {
        <p role="alert" class="text-red-700">{{ error }}</p>
      }
      @if (message) {
        <p role="status" class="text-green-700">{{ message }}</p>
      }
      @if (loading) {
        <p role="status">Loading email logs...</p>
      }

      <div
        class="bg-white border-y overflow-auto max-h-[65vh]"
        tabindex="0"
        role="region"
        aria-label="Email delivery history"
      >
        <table class="w-full text-sm min-w-[1000px]">
          <thead class="bg-slate-50 text-slate-500 uppercase text-xs">
            <tr>
              <th class="px-4 py-3 text-left">Invoice #</th>
              <th class="px-4 py-3 text-left">To</th>
              <th class="px-4 py-3 text-left">Subject</th>
              <th class="px-4 py-3 text-center">Status</th>
              <th class="px-4 py-3 text-left">Sent At (IST)</th>
              <th class="px-4 py-3 text-left">Failure Reason</th>
              <th class="px-4 py-3 text-left">Delivery Review</th>
            </tr>
          </thead>
          <tbody class="divide-y">
            @for (l of logs; track l) {
              <tr class="hover:bg-slate-50">
                <td class="px-4 py-3">
                  @if (l.invoice) {
                    <a
                      [routerLink]="['/accounts/invoices', l.invoice.id]"
                      class="text-brand-600 hover:underline text-xs font-mono"
                      >{{ l.invoice.invoiceNumber }}</a
                    >
                  }
                  @if (!l.invoice && l.pendingPayment) {
                    <a
                      [routerLink]="['/accounts/pending-payments']"
                      class="text-amber-600 hover:underline text-xs font-mono"
                      [title]="'Pending payment: ' + l.pendingPayment.clientName"
                    >
                      {{ l.pendingPayment.invoiceNumber }}
                      <span class="ml-1 text-[10px] text-slate-400">(pending)</span>
                    </a>
                  }
                </td>
                <td class="px-4 py-3">{{ l.toEmail }}</td>
                <td class="px-4 py-3 max-w-xs truncate">{{ l.subject }}</td>
                <td class="px-4 py-3 text-center">
                  <span
                    [class]="
                      l.sentStatus === 'SENT' || l.sentStatus === 'DELIVERED'
                        ? 'bg-green-100 text-green-700'
                        : l.sentStatus === 'FAILED'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-slate-100 text-slate-600'
                    "
                    class="px-2 py-0.5 rounded text-xs font-medium"
                    >{{
                      l.delivery
                        ? deliveryLabels[l.delivery.status] || l.delivery.status
                        : l.sentStatus
                    }}</span
                  >
                </td>
                <td class="px-4 py-3 text-xs">
                  {{
                    l.delivery?.acceptedAt || l.sentAt
                      ? (l.delivery?.acceptedAt || l.sentAt | date: 'dd MMM yyyy, HH:mm' : '+0530')
                      : '-'
                  }}
                </td>
                <td class="px-4 py-3 text-xs text-red-500 max-w-xs truncate">
                  {{ l.failureReason || '' }}
                </td>
                <td class="px-4 py-3 text-xs">
                  <span class="block max-w-xs break-words">{{
                    l.delivery?.messageId || l.delivery?.resolutionNote || ''
                  }}</span>
                  @if (l.delivery?.status === 'UNKNOWN' && isAdmin) {
                    <button
                      type="button"
                      class="text-green-700 underline"
                      (click)="openReview(l)"
                      [disabled]="saving"
                    >
                      Review outcome
                    </button>
                  }
                </td>
              </tr>
            }
            @if (!logs.length && !loading) {
              <tr>
                <td colspan="7" class="px-4 py-8 text-center text-slate-400">
                  {{ error ? 'Email logs unavailable' : 'No email logs' }}
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>

      @if (totalPages > 1) {
        <div class="flex items-center justify-between text-sm text-slate-500">
          <span>Page {{ page }} of {{ totalPages }}</span>
          <div class="flex gap-2">
            <button
              (click)="movePage(-1)"
              [disabled]="page <= 1 || loading || saving"
              class="icon-action"
              aria-label="Previous page"
              title="Previous page"
            >
              <ui-icon name="chevron-right" class="rotate-180" />
            </button>
            <button
              (click)="movePage(1)"
              [disabled]="page >= totalPages || loading || saving"
              class="icon-action"
              aria-label="Next page"
              title="Next page"
            >
              <ui-icon name="chevron-right" />
            </button>
          </div>
        </div>
      }
      @if (selected) {
        <section class="border-t pt-5 space-y-3" aria-label="Delivery outcome review">
          <h2 class="text-lg font-semibold break-words">
            Delivery outcome: {{ selected.invoice?.invoiceNumber || selected.subject }}
          </h2>
          <label class="block"
            >Verified outcome
            <select [(ngModel)]="outcome" [disabled]="saving" class="border rounded p-2">
              <option value="SENT">Mail server accepted</option>
              <option value="NOT_SENT">Provider confirmed not sent</option>
            </select></label
          >
          <label class="block"
            >Provider evidence
            <textarea
              [(ngModel)]="note"
              [disabled]="saving"
              maxlength="2000"
              rows="3"
              class="block w-full max-w-2xl border rounded p-2"
            ></textarea>
          </label>
          <label class="flex items-start gap-2"
            ><input type="checkbox" [(ngModel)]="providerVerified" [disabled]="saving" />Provider
            outcome verified; no send remains in progress.</label
          >
          <div class="flex gap-3">
            <button
              type="button"
              class="border rounded px-3 py-2"
              (click)="resolve()"
              [disabled]="saving || !providerVerified || note.trim().length < 10"
            >
              Save outcome
            </button>
            <button
              type="button"
              class="border rounded px-3 py-2"
              (click)="selected = null"
              [disabled]="saving"
            >
              Cancel
            </button>
          </div>
        </section>
      }
      @if (isAdmin) {
        <section class="border-t pt-5 space-y-3">
          <h2 class="text-lg font-semibold">Invoice PDF inventory</h2>
          <div class="flex flex-wrap gap-3 items-center">
            <label
              >Age threshold (days)
              <input
                type="number"
                min="1"
                max="36500"
                [(ngModel)]="minAgeDays"
                class="border rounded p-2 w-24"
            /></label>
            <button
              type="button"
              class="border rounded px-3 py-2"
              (click)="loadInventory()"
              [disabled]="inventoryLoading"
            >
              {{ inventoryLoading ? 'Scanning...' : 'Preview inventory' }}
            </button>
            <span class="text-sm text-slate-500">Deletion disabled</span>
          </div>
          @if (inventoryError) {
            <p role="alert" class="text-red-700">{{ inventoryError }}</p>
          }
          @if (inventory) {
            <p class="text-sm">
              {{ inventory.scanned }} PDFs scanned
              @if (inventory.truncated) {
                <strong class="text-amber-700"> - Partial inventory</strong>
              }
            </p>
            <div
              class="overflow-auto max-h-80"
              tabindex="0"
              role="region"
              aria-label="Read-only PDF inventory"
            >
              <table class="w-full min-w-[600px] text-sm">
                <thead>
                  <tr>
                    <th class="text-left p-2">File</th>
                    <th class="p-2">Age (days)</th>
                    <th class="p-2">Bytes</th>
                    <th class="p-2">Reference status</th>
                  </tr>
                </thead>
                <tbody>
                  @for (file of inventory.items; track file.name) {
                    <tr>
                      <td class="p-2 break-all">{{ file.name }}</td>
                      <td class="p-2 text-center">{{ file.ageDays }}</td>
                      <td class="p-2 text-center">{{ file.bytes }}</td>
                      <td class="p-2 text-center">{{ file.status }}</td>
                    </tr>
                  } @empty {
                    <tr>
                      <td colspan="4" class="p-3">No invoice PDFs found.</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </section>
      }
    </div>
  `,
  styles: [
    `
      .icon-action {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        width: 40px;
        height: 40px;
        border: 1px solid #b6c7c1;
        border-radius: 4px;
        color: #126b58;
      }
      .icon-action ui-icon {
        width: 20px;
        height: 20px;
        flex: 0 0 20px;
      }
      .icon-action:disabled {
        opacity: 0.45;
      }
    `,
  ],
})
export class BillingEmailLogsComponent implements OnInit, OnDestroy {
  logs: InvoiceEmailLog[] = [];
  page = 1;
  totalPages = 0;
  loading = false;
  saving = false;
  error = '';
  message = '';
  selected: InvoiceEmailLog | null = null;
  outcome: 'SENT' | 'NOT_SENT' = 'SENT';
  note = '';
  providerVerified = false;
  readonly deliveryLabels: Record<string, string> = {
    PREPARING: 'Preparing',
    SENDING: 'Sending',
    UNKNOWN: 'Needs verification',
    ACCEPTED: 'Accepted; status pending',
    RECONCILED: 'Accepted and recorded',
    NOT_SENT: 'Not sent',
  };
  private listRequest?: Subscription;
  private reviewRequest?: Subscription;
  private inventoryRequest?: Subscription;
  inventory: InvoiceFileInventory | null = null;
  inventoryLoading = false;
  inventoryError = '';
  minAgeDays = 365;

  constructor(
    private svc: AccountsBillingService,
    private auth: AuthService,
  ) {}
  get isAdmin() {
    return this.auth.getRoleCode() === 'ADMIN';
  }
  ngOnDestroy() {
    this.listRequest?.unsubscribe();
    this.reviewRequest?.unsubscribe();
    this.inventoryRequest?.unsubscribe();
  }

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.listRequest?.unsubscribe();
    this.loading = true;
    this.error = '';
    this.logs = [];
    this.listRequest = this.svc.getEmailLogs({ page: String(this.page) }).subscribe({
      next: (r) => {
        this.logs = (r && r.data) || [];
        this.totalPages = (r && r.totalPages) || 0;
        this.loading = false;
      },
      error: () => {
        this.error = 'Unable to load email logs. Please refresh.';
        this.loading = false;
        this.logs = [];
        this.totalPages = 0;
      },
    });
  }

  movePage(delta: number) {
    if (this.loading || this.saving || this.page + delta < 1 || this.page + delta > this.totalPages)
      return;
    this.page += delta;
    this.load();
  }
  openReview(log: InvoiceEmailLog) {
    if (!this.isAdmin || this.saving || log.delivery?.status !== 'UNKNOWN') return;
    this.selected = log;
    this.outcome = 'SENT';
    this.note = '';
    this.providerVerified = false;
    this.message = '';
  }
  resolve() {
    if (
      !this.isAdmin ||
      !this.selected ||
      this.saving ||
      !this.providerVerified ||
      this.note.trim().length < 10
    )
      return;
    this.saving = true;
    this.error = '';
    this.reviewRequest = this.svc
      .resolveInvoiceDelivery(
        this.selected.id,
        this.outcome,
        this.note.trim(),
        this.providerVerified,
      )
      .subscribe({
        next: () => {
          this.saving = false;
          this.selected = null;
          this.message = 'Delivery outcome recorded. No email was sent by this action.';
          this.load();
        },
        error: () => {
          this.saving = false;
          this.error =
            'Unable to record the outcome. Refresh to check whether the delivery state changed.';
        },
      });
  }
  loadInventory() {
    if (!this.isAdmin || this.inventoryLoading) return;
    if (!Number.isInteger(this.minAgeDays) || this.minAgeDays < 1 || this.minAgeDays > 36500) {
      this.inventoryError = 'Enter an age threshold from 1 to 36500 days.';
      return;
    }
    this.inventoryLoading = true;
    this.inventoryError = '';
    this.inventory = null;
    this.inventoryRequest = this.svc.getInvoiceFileInventory(this.minAgeDays).subscribe({
      next: (result) => {
        this.inventory = result;
        this.inventoryLoading = false;
      },
      error: () => {
        this.inventoryLoading = false;
        this.inventoryError = 'Inventory unavailable. No files were changed.';
      },
    });
  }
}
