import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';

import { Subject } from 'rxjs';
import { takeUntil, finalize, timeout } from 'rxjs/operators';
import { PageHeaderComponent, EmptyStateComponent, LoadingSpinnerComponent } from '../../../shared/ui';
import { CeoApiService } from '../../../core/api/ceo.api';

@Component({
  selector: 'app-ceo-cco-oversight',
  standalone: true,
  imports: [PageHeaderComponent, EmptyStateComponent, LoadingSpinnerComponent],
  template: `
    <div class="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <ui-page-header
        title="CCO Oversight"
        description="Deep analysis — CCO workload, team metrics, and performance drill-down"
        icon="chart-bar">
      </ui-page-header>

      @if (loading) {
<ui-loading-spinner text="Loading oversight data..."></ui-loading-spinner>
}

      @if (error) {
<div class="alert alert-error mb-4">{{ error }}</div>
}

      @if (!loading && !error && summary.length === 0) {
<ui-empty-state
       
        title="No oversight data"
        description="CCO workload and performance metrics will appear here."
        icon="users">
      </ui-empty-state>
}

      @if (!loading && summary.length > 0) {
<div class="card">
        <div class="table-wrap"><table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">CCO</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Clients</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Pending</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Overdue</th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            @for (cco of summary; track cco) {
<tr class="hover:bg-gray-50">
              <td class="px-4 py-3 text-sm font-medium">
                <div>{{ cco.ccoName || cco.name || '—' }}</div>
                @if (cco.ccoEmail) {
<div class="text-xs text-gray-500">{{ cco.ccoEmail }}</div>
}
              </td>
              <td class="px-4 py-3 text-sm">{{ cco.totalClients ?? cco.clientCount ?? 0 }}</td>
              <td class="px-4 py-3 text-sm">{{ cco.pendingCount ?? 0 }}</td>
              <td class="px-4 py-3 text-sm">
                <span [class.text-red-600]="(cco.overdueCount ?? 0) > 0">{{ cco.overdueCount ?? 0 }}</span>
              </td>
            </tr>
}
          </tbody>
        </table></div>
      </div>
}
    </div>
  `,
})
export class CeoCcoOversightComponent implements OnInit, OnDestroy {
  summary: any[] = [];
  loading = true;
  error: string | null = null;
  private destroy$ = new Subject<void>();

  constructor(private api: CeoApiService, private cdr: ChangeDetectorRef) {}

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  ngOnInit(): void {
    this.loading = true;
    this.api.getOversightSummary().pipe(
      takeUntil(this.destroy$),
      timeout(10000),
      finalize(() => { this.loading = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (data) => { this.loading = false; this.summary = data?.ccoSummary || []; this.cdr.detectChanges(); },
      error: () => { this.loading = false; this.error = 'Failed to load oversight data'; this.cdr.detectChanges(); },
    });
  }
}
