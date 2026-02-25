import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject } from 'rxjs';
import { finalize, timeout, takeUntil } from 'rxjs/operators';
import { PageHeaderComponent, EmptyStateComponent, LoadingSpinnerComponent } from '../../shared/ui';
import { CcoCrmsService } from '../../core/cco-crms.service';

@Component({
  selector: 'app-cco-crm-performance',
  standalone: true,
  imports: [CommonModule, PageHeaderComponent, EmptyStateComponent, LoadingSpinnerComponent],
  template: `
    <div class="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <ui-page-header
        title="CRM Performance"
        description="Monitor CRM team performance metrics"
        icon="chart-bar">
      </ui-page-header>

      <ui-loading-spinner *ngIf="loading" text="Loading performance data..."></ui-loading-spinner>

      <div *ngIf="error" class="alert alert-error mb-4">{{ error }}</div>

      <ui-empty-state
        *ngIf="!loading && !error && crms.length === 0"
        title="No performance data"
        description="CRM performance metrics will appear here."
        icon="chart-bar">
      </ui-empty-state>

      <div *ngIf="!loading && crms.length > 0" class="card">
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">CRM Name</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Clients</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Overdue</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Status</th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              <tr *ngFor="let crm of crms" class="hover:bg-gray-50">
                <td class="px-6 py-4 text-sm font-medium">{{ crm.name }}</td>
                <td class="px-6 py-4 text-sm">{{ crm.clientCount ?? '\u2014' }}</td>
                <td class="px-6 py-4 text-sm">
                  <span [class.text-red-600]="crm.overdueCount > 0">{{ crm.overdueCount ?? 0 }}</span>
                </td>
                <td class="px-6 py-4 text-sm">{{ crm.status || '\u2014' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `,
})
export class CcoCrmPerformanceComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  crms: any[] = [];
  loading = true;
  error: string | null = null;

  constructor(private ccoCrmsService: CcoCrmsService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.loading = true;
    this.ccoCrmsService.list().pipe(
      takeUntil(this.destroy$),
      timeout(10000),
      finalize(() => { this.loading = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (data) => { this.loading = false; this.crms = data || []; this.cdr.detectChanges(); },
      error: () => { this.loading = false; this.error = 'Failed to load CRM data'; this.cdr.detectChanges(); },
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
