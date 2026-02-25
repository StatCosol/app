import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Subject } from 'rxjs';
import { takeUntil, finalize, timeout } from 'rxjs/operators';
import { PageHeaderComponent, EmptyStateComponent, LoadingSpinnerComponent } from '../../shared/ui';

export interface CeoReport {
  id: number;
  title: string;
  type?: string;
  generatedAt?: string;
  downloadUrl?: string;
}

@Component({
  selector: 'app-ceo-reports',
  standalone: true,
  imports: [CommonModule, PageHeaderComponent, EmptyStateComponent, LoadingSpinnerComponent],
  template: `
    <div class="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <ui-page-header
        title="CEO Reports"
        description="Business and compliance reports"
        icon="chart-bar">
      </ui-page-header>

      <ui-loading-spinner *ngIf="loading" text="Loading reports..."></ui-loading-spinner>

      <div *ngIf="error" class="alert alert-error mb-4">{{ error }}</div>

      <ui-empty-state
        *ngIf="!loading && !error && reports.length === 0"
        title="No reports available"
        description="Business and compliance reports will appear here."
        icon="document-report">
      </ui-empty-state>

      <div *ngIf="!loading && reports.length > 0" class="card">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Title</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Type</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Generated</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            <tr *ngFor="let r of reports" class="hover:bg-gray-50">
              <td class="px-4 py-3 text-sm font-medium">{{ r.title }}</td>
              <td class="px-4 py-3 text-sm">{{ r.type || '—' }}</td>
              <td class="px-4 py-3 text-sm">{{ r.generatedAt | date:'mediumDate' }}</td>
              <td class="px-4 py-3 text-sm">
                <a *ngIf="r.downloadUrl" [href]="r.downloadUrl" target="_blank" class="btn-primary-sm">Download</a>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `,
})
export class CeoReportsComponent implements OnInit, OnDestroy {
  reports: CeoReport[] = [];
  loading = true;
  error: string | null = null;
  private destroy$ = new Subject<void>();

  constructor(private http: HttpClient, private cdr: ChangeDetectorRef) {}

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  ngOnInit(): void {
    this.loading = true;
    this.http.get<CeoReport[]>('/api/v1/ceo/reports').pipe(
      takeUntil(this.destroy$),
      timeout(10000),
      finalize(() => { this.loading = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (data) => { this.loading = false; this.reports = data || []; this.cdr.detectChanges(); },
      error: () => { this.loading = false; this.reports = []; this.cdr.detectChanges(); },
    });
  }
}
