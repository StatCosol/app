import { Component, ChangeDetectorRef, OnInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs/operators';

import { CrmReturnsService } from '../../../core/crm-returns.service';
import { ToastService } from '../../../shared/toast/toast.service';
import {
  PageHeaderComponent,
  LoadingSpinnerComponent,
  EmptyStateComponent,
  StatusBadgeComponent,
  ActionButtonComponent,
} from '../../../shared/ui';

@Component({
  standalone: true,
  selector: 'app-crm-returns-filings',
  imports: [
    CommonModule,
    FormsModule,
    PageHeaderComponent,
    LoadingSpinnerComponent,
    EmptyStateComponent,
    StatusBadgeComponent,
    ActionButtonComponent,
  ],
  template: `
    <div class="page">
      <ui-page-header
        title="Returns / Filings"
        subtitle="Manage compliance filings — upload ACK & Challan proofs for your assigned clients">
      </ui-page-header>

      <!-- Filters -->
      <div class="flex flex-wrap items-end gap-3 mb-4">
        <div>
          <label class="block text-xs text-gray-500 mb-1">Status</label>
          <select [(ngModel)]="filters.status" (ngModelChange)="loadFilings()" class="input-sm">
            <option value="">All</option>
            <option value="PENDING">Pending</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="SUBMITTED">Submitted</option>
            <option value="APPROVED">Approved</option>
            <option value="OVERDUE">Overdue</option>
          </select>
        </div>
        <div>
          <label class="block text-xs text-gray-500 mb-1">Year</label>
          <select [(ngModel)]="filters.periodYear" (ngModelChange)="loadFilings()" class="input-sm">
            <option value="">All</option>
            <option *ngFor="let y of yearOptions" [value]="y">{{ y }}</option>
          </select>
        </div>
        <div>
          <label class="block text-xs text-gray-500 mb-1">Month</label>
          <select [(ngModel)]="filters.periodMonth" (ngModelChange)="loadFilings()" class="input-sm">
            <option value="">All</option>
            <option *ngFor="let m of monthOptions" [value]="m.value">{{ m.label }}</option>
          </select>
        </div>
        <ui-button variant="secondary" (clicked)="loadFilings()">Refresh</ui-button>
      </div>

      <ui-loading-spinner *ngIf="loading" text="Loading filings..."></ui-loading-spinner>
      <ui-empty-state *ngIf="!loading && !filings.length" title="No filings found" description="Adjust filters or check back later."></ui-empty-state>

      <!-- Filings Table -->
      <div *ngIf="!loading && filings.length" class="overflow-x-auto bg-white rounded-2xl border border-gray-200 shadow-sm">
        <table class="min-w-full divide-y divide-gray-200 text-sm">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Return Type</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Period</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Due Date</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Status</th>
              <th class="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase">ACK</th>
              <th class="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase">Challan</th>
              <th class="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            <tr *ngFor="let f of filings" class="hover:bg-gray-50/50">
              <td class="px-4 py-3 font-medium text-gray-900">{{ f.returnType || f.lawType || '—' }}</td>
              <td class="px-4 py-3 text-gray-600">
                {{ f.periodYear }}{{ f.periodMonth ? '-' + (f.periodMonth < 10 ? '0' + f.periodMonth : f.periodMonth) : '' }}
              </td>
              <td class="px-4 py-3 text-gray-600">{{ f.dueDate || '—' }}</td>
              <td class="px-4 py-3">
                <ui-status-badge [status]="f.status"></ui-status-badge>
              </td>
              <td class="px-4 py-3 text-center">
                <a *ngIf="f.ackFilePath" [href]="f.ackFilePath" target="_blank"
                   class="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-2 py-0.5">
                  ✓ View ACK
                </a>
                <span *ngIf="!f.ackFilePath" class="text-xs text-gray-400">—</span>
              </td>
              <td class="px-4 py-3 text-center">
                <a *ngIf="f.challanFilePath" [href]="f.challanFilePath" target="_blank"
                   class="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-2 py-0.5">
                  ✓ View Challan
                </a>
                <span *ngIf="!f.challanFilePath" class="text-xs text-gray-400">—</span>
              </td>
              <td class="px-4 py-3 text-right">
                <div class="flex items-center justify-end gap-2">
                  <button type="button" class="btn-action" [disabled]="uploadingAck"
                          (click)="openAckUpload(f.id)">
                    {{ uploadingAck && selectedFilingIdForAck === f.id ? 'Uploading...' : 'Upload ACK' }}
                  </button>
                  <button type="button" class="btn-action" [disabled]="uploadingChallan"
                          (click)="openChallanUpload(f.id)">
                    {{ uploadingChallan && selectedFilingIdForChallan === f.id ? 'Uploading...' : 'Upload Challan' }}
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Hidden file inputs -->
      <input #ackInput type="file" hidden (change)="onAckFileSelected($event)" accept=".pdf,.png,.jpg,.jpeg,.xlsx" />
      <input #challanInput type="file" hidden (change)="onChallanFileSelected($event)" accept=".pdf,.png,.jpg,.jpeg,.xlsx" />
    </div>
  `,
  styles: [`
    .page { max-width: 1200px; margin: 0 auto; padding: 1rem; }
    .input-sm {
      border: 1px solid #d1d5db; border-radius: 0.5rem;
      padding: 0.375rem 0.75rem; font-size: 0.875rem;
      background: white; min-width: 120px;
    }
    .btn-action {
      display: inline-flex; align-items: center; gap: 0.25rem;
      padding: 0.25rem 0.75rem; font-size: 0.75rem; font-weight: 500;
      border: 1px solid #93c5fd; border-radius: 0.5rem;
      background: #eff6ff; color: #1d4ed8; cursor: pointer;
      transition: background 0.15s, border-color 0.15s;
    }
    .btn-action:hover:not(:disabled) { background: #dbeafe; border-color: #60a5fa; }
    .btn-action:disabled { opacity: 0.5; cursor: not-allowed; }
  `],
})
export class CrmReturnsFilingsComponent implements OnInit {
  @ViewChild('ackInput') ackInput!: ElementRef<HTMLInputElement>;
  @ViewChild('challanInput') challanInput!: ElementRef<HTMLInputElement>;

  filings: any[] = [];
  loading = false;

  filters: any = { status: '', periodYear: '', periodMonth: '' };

  yearOptions: number[] = [];
  monthOptions = [
    { value: 1, label: 'Jan' }, { value: 2, label: 'Feb' },
    { value: 3, label: 'Mar' }, { value: 4, label: 'Apr' },
    { value: 5, label: 'May' }, { value: 6, label: 'Jun' },
    { value: 7, label: 'Jul' }, { value: 8, label: 'Aug' },
    { value: 9, label: 'Sep' }, { value: 10, label: 'Oct' },
    { value: 11, label: 'Nov' }, { value: 12, label: 'Dec' },
  ];

  selectedFilingIdForAck: string | null = null;
  selectedFilingIdForChallan: string | null = null;
  uploadingAck = false;
  uploadingChallan = false;

  constructor(
    private readonly crmReturns: CrmReturnsService,
    private readonly toast: ToastService,
    private readonly cdr: ChangeDetectorRef,
  ) {
    const now = new Date().getFullYear();
    for (let y = now; y >= now - 3; y--) this.yearOptions.push(y);
  }

  ngOnInit() {
    this.loadFilings();
  }

  loadFilings() {
    this.loading = true;
    const params: any = {};
    if (this.filters.status) params.status = this.filters.status;
    if (this.filters.periodYear) params.periodYear = this.filters.periodYear;
    if (this.filters.periodMonth) params.periodMonth = this.filters.periodMonth;

    this.crmReturns.listFilings(params)
      .pipe(finalize(() => { this.loading = false; this.cdr.detectChanges(); }))
      .subscribe({
        next: (res) => { this.filings = res || []; this.cdr.detectChanges(); },
        error: (e) => {
          this.toast.error(e?.error?.message || 'Failed to load filings');
          this.cdr.detectChanges();
        },
      });
  }

  // ── ACK Upload ──
  openAckUpload(filingId: string) {
    this.selectedFilingIdForAck = filingId;
    this.ackInput.nativeElement.value = '';
    this.ackInput.nativeElement.click();
  }

  onAckFileSelected(evt: Event) {
    const input = evt.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !this.selectedFilingIdForAck) return;

    const ackNumber = prompt('Enter ACK number (optional)') || undefined;

    this.uploadingAck = true;
    this.cdr.detectChanges();
    this.crmReturns.uploadAck(this.selectedFilingIdForAck, file, ackNumber)
      .pipe(finalize(() => { this.uploadingAck = false; this.cdr.detectChanges(); }))
      .subscribe({
        next: () => {
          this.loadFilings();
          this.toast.success('ACK uploaded successfully');
        },
        error: (e) => this.toast.error(e?.error?.message || 'ACK upload failed'),
      });
  }

  // ── Challan Upload ──
  openChallanUpload(filingId: string) {
    this.selectedFilingIdForChallan = filingId;
    this.challanInput.nativeElement.value = '';
    this.challanInput.nativeElement.click();
  }

  onChallanFileSelected(evt: Event) {
    const input = evt.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !this.selectedFilingIdForChallan) return;

    this.uploadingChallan = true;
    this.cdr.detectChanges();
    this.crmReturns.uploadChallan(this.selectedFilingIdForChallan, file)
      .pipe(finalize(() => { this.uploadingChallan = false; this.cdr.detectChanges(); }))
      .subscribe({
        next: () => {
          this.loadFilings();
          this.toast.success('Challan uploaded successfully');
        },
        error: (e) => this.toast.error(e?.error?.message || 'Challan upload failed'),
      });
  }
}
