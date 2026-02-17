import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { finalize, timeout } from 'rxjs/operators';
import { PageHeaderComponent, EmptyStateComponent, LoadingSpinnerComponent } from '../../../shared/ui';
import { CeoApiService, CeoOversightSummary } from '../../../core/api/ceo.api';

@Component({
  selector: 'app-ceo-cco-oversight',
  standalone: true,
  imports: [CommonModule, PageHeaderComponent, EmptyStateComponent, LoadingSpinnerComponent],
  template: `
    <div class="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <ui-page-header
        title="CCO Oversight"
        description="CCO workload and performance summary"
        icon="chart-bar">
      </ui-page-header>

      <ui-loading-spinner *ngIf="loading" text="Loading oversight data..."></ui-loading-spinner>

      <div *ngIf="error" class="alert alert-error mb-4">{{ error }}</div>

      <ui-empty-state
        *ngIf="!loading && !error && summary.length === 0"
        title="No oversight data"
        description="CCO workload and performance metrics will appear here."
        icon="users">
      </ui-empty-state>

      <div *ngIf="!loading && summary.length > 0" class="card">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">CCO</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Clients</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Pending</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Overdue</th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            <tr *ngFor="let cco of summary" class="hover:bg-gray-50">
              <td class="px-4 py-3 text-sm font-medium">{{ cco.name || cco.email || '—' }}</td>
              <td class="px-4 py-3 text-sm">{{ cco.clientCount ?? '—' }}</td>
              <td class="px-4 py-3 text-sm">{{ cco.pendingCount ?? '—' }}</td>
              <td class="px-4 py-3 text-sm">
                <span [class.text-red-600]="cco.overdueCount > 0">{{ cco.overdueCount ?? 0 }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `,
})
export class CeoCcoOversightComponent implements OnInit {
  summary: any[] = [];
  loading = false;
  error: string | null = null;

  constructor(private api: CeoApiService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.loading = true;
    this.api.getOversightSummary().pipe(
      timeout(10000),
      finalize(() => { this.loading = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (data) => { this.summary = data?.ccoSummary || []; this.cdr.detectChanges(); },
      error: () => { this.error = 'Failed to load oversight data'; this.cdr.detectChanges(); },
    });
  }
}
