import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { finalize, timeout } from 'rxjs/operators';
import { PageHeaderComponent, EmptyStateComponent, LoadingSpinnerComponent } from '../../shared/ui';
import { CeoApiService, CeoEscalation } from '../../core/api/ceo.api';

@Component({
  selector: 'app-ceo-escalations',
  standalone: true,
  imports: [CommonModule, RouterModule, PageHeaderComponent, EmptyStateComponent, LoadingSpinnerComponent],
  template: `
    <div class="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <ui-page-header
        title="Escalations Inbox"
        description="Escalated issues requiring CEO attention"
        icon="exclamation">
      </ui-page-header>

      <ui-loading-spinner *ngIf="loading" text="Loading escalations..."></ui-loading-spinner>

      <div *ngIf="error" class="alert alert-error mb-4">{{ error }}</div>

      <ui-empty-state
        *ngIf="!loading && !error && items.length === 0"
        title="No escalations"
        description="Escalated issues requiring CEO attention will appear here."
        icon="exclamation-circle">
      </ui-empty-state>

      <div *ngIf="!loading && items.length > 0" class="card">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">ID</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Subject</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Status</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Created</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            <tr *ngFor="let e of items" class="hover:bg-gray-50">
              <td class="px-4 py-3 text-sm">{{ e.id }}</td>
              <td class="px-4 py-3 text-sm">{{ e.subject || '—' }}</td>
              <td class="px-4 py-3 text-sm"><span class="badge badge-warning">{{ e.status }}</span></td>
              <td class="px-4 py-3 text-sm">{{ e.createdAt | date:'mediumDate' }}</td>
              <td class="px-4 py-3 text-sm">
                <a [routerLink]="['/ceo/escalations', e.id]" class="btn-primary-sm">View</a>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `,
})
export class CeoEscalationsComponent implements OnInit {
  items: CeoEscalation[] = [];
  loading = false;
  error: string | null = null;

  constructor(private api: CeoApiService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.loading = true;
    this.api.getEscalations().pipe(
      timeout(10000),
      finalize(() => { this.loading = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (res) => { this.items = res?.items || []; this.cdr.detectChanges(); },
      error: () => { this.error = 'Failed to load escalations'; this.cdr.detectChanges(); },
    });
  }
}
