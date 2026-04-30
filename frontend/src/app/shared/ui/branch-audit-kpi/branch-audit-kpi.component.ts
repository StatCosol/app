import { Component, Input, OnChanges, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { AuditsKpiApi, BranchAuditKpiItem } from '../../../core/api/audits-kpi.api';

@Component({
  selector: 'app-branch-audit-kpi',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="rounded-2xl border border-gray-200 bg-white p-4">
      <div class="flex items-center justify-between mb-3">
        <div>
          <div class="text-lg font-semibold text-gray-900">Audit KPI (Branch)</div>
          <div class="text-xs text-gray-500">Period: {{ from }} to {{ to }}</div>
        </div>
        <button class="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          (click)="load()" [disabled]="loading">
          {{ loading ? 'Loading…' : 'Refresh' }}
        </button>
      </div>

      <div *ngIf="loading" class="text-sm text-gray-400 py-4 text-center">Loading audit KPIs…</div>
      <div *ngIf="!loading && errorMsg" class="text-sm text-red-600 py-4 text-center">{{ errorMsg }}</div>

      <!-- Summary Cards -->
      <ng-container *ngIf="!loading && !errorMsg">
        <div class="grid grid-cols-2 md:grid-cols-6 gap-2 mb-4">
          <div class="rounded-xl border border-gray-200 p-3">
            <div class="text-xs text-gray-500">Critical</div>
            <div class="text-xl font-semibold text-red-600">{{ total.critical }}</div>
          </div>
          <div class="rounded-xl border border-gray-200 p-3">
            <div class="text-xs text-gray-500">High</div>
            <div class="text-xl font-semibold text-orange-600">{{ total.high }}</div>
          </div>
          <div class="rounded-xl border border-gray-200 p-3">
            <div class="text-xs text-gray-500">Medium</div>
            <div class="text-xl font-semibold text-amber-600">{{ total.medium }}</div>
          </div>
          <div class="rounded-xl border border-gray-200 p-3">
            <div class="text-xs text-gray-500">Low</div>
            <div class="text-xl font-semibold text-blue-600">{{ total.low }}</div>
          </div>
          <div class="rounded-xl border border-gray-200 p-3">
            <div class="text-xs text-gray-500">Open</div>
            <div class="text-xl font-semibold text-gray-900">{{ total.open }}</div>
          </div>
          <div class="rounded-xl border border-gray-200 p-3">
            <div class="text-xs text-gray-500">Closed</div>
            <div class="text-xl font-semibold text-green-600">{{ total.closed }}</div>
          </div>
        </div>

        <!-- Month-wise table -->
        <div class="overflow-auto">
          <table class="min-w-full text-sm">
            <thead>
              <tr class="text-left border-b border-gray-200 text-xs text-gray-500 uppercase">
                <th class="py-2 pr-3">Month</th>
                <th class="py-2 pr-3">Critical</th>
                <th class="py-2 pr-3">High</th>
                <th class="py-2 pr-3">Medium</th>
                <th class="py-2 pr-3">Low</th>
                <th class="py-2 pr-3">Open</th>
                <th class="py-2 pr-3">Closed</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let x of items" class="border-b border-gray-100">
                <td class="py-2 pr-3 font-medium text-gray-900">{{ x.periodCode }}</td>
                <td class="py-2 pr-3 text-red-600">{{ x.critical }}</td>
                <td class="py-2 pr-3 text-orange-600">{{ x.high }}</td>
                <td class="py-2 pr-3 text-amber-600">{{ x.medium }}</td>
                <td class="py-2 pr-3 text-blue-600">{{ x.low }}</td>
                <td class="py-2 pr-3">{{ x.open }}</td>
                <td class="py-2 pr-3 text-green-600">{{ x.closed }}</td>
              </tr>
              <tr *ngIf="items.length === 0">
                <td colspan="7" class="py-3 text-gray-400 text-center">No audit observations found for this period.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </ng-container>
    </div>
  `,
})
export class BranchAuditKpiComponent implements OnChanges, OnDestroy {
  @Input() branchId = '';
  @Input() from = '';
  @Input() to = '';

  loading = false;
  errorMsg = '';
  items: BranchAuditKpiItem[] = [];
  total = { critical: 0, high: 0, medium: 0, low: 0, open: 0, closed: 0 };

  private loadSub?: Subscription;

  constructor(
    private api: AuditsKpiApi,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnChanges(): void {
    if (!this.branchId || !this.from || !this.to) return;
    this.load();
  }

  ngOnDestroy(): void {
    this.loadSub?.unsubscribe();
  }

  load(): void {
    this.loading = true;
    this.errorMsg = '';
    this.items = [];
    this.total = { critical: 0, high: 0, medium: 0, low: 0, open: 0, closed: 0 };

    this.loadSub?.unsubscribe();
    this.loadSub = this.api.getBranchAuditKpi(this.branchId, this.from, this.to).subscribe({
      next: (res) => {
        this.items = res.items || [];
        for (const x of this.items) {
          this.total.critical += x.critical || 0;
          this.total.high += x.high || 0;
          this.total.medium += x.medium || 0;
          this.total.low += x.low || 0;
          this.total.open += x.open || 0;
          this.total.closed += x.closed || 0;
        }
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.errorMsg = 'Failed to load audit KPI';
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }
}
