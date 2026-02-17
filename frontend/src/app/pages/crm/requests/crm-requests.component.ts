import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { finalize, timeout } from 'rxjs/operators';
import { PageHeaderComponent, EmptyStateComponent, LoadingSpinnerComponent } from '../../../shared/ui';

@Component({
  standalone: true,
  selector: 'app-crm-requests',
  imports: [CommonModule, PageHeaderComponent, EmptyStateComponent, LoadingSpinnerComponent],
  template: `
    <ui-page-header title="Helpdesk" description="View and track helpdesk tickets from clients"></ui-page-header>

    <ui-loading-spinner *ngIf="loading" text="Loading requests..."></ui-loading-spinner>

    <div *ngIf="error" class="alert alert-error mb-4">{{ error }}</div>

    <ui-empty-state
      *ngIf="!loading && !error && requests.length === 0"
      title="No tickets"
      description="Client helpdesk tickets will appear here."
      icon="clipboard-list">
    </ui-empty-state>

    <div *ngIf="!loading && requests.length > 0" class="card">
      <table class="min-w-full divide-y divide-gray-200">
        <thead class="bg-gray-50">
          <tr>
            <th class="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Subject</th>
            <th class="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Category</th>
            <th class="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Status</th>
            <th class="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Created</th>
          </tr>
        </thead>
        <tbody class="bg-white divide-y divide-gray-200">
          <tr *ngFor="let r of requests" class="hover:bg-gray-50">
            <td class="px-4 py-3 text-sm font-medium">{{ r.subject || r.title || '—' }}</td>
            <td class="px-4 py-3 text-sm">{{ r.category || r.type || r.entityType || '—' }}</td>
            <td class="px-4 py-3 text-sm"><span class="badge">{{ r.status }}</span></td>
            <td class="px-4 py-3 text-sm">{{ r.createdAt | date:'mediumDate' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  `,
})
export class CrmRequestsComponent implements OnInit {
  requests: any[] = [];
  loading = false;
  error: string | null = null;

  private readonly baseUrl = environment.apiBaseUrl || '';

  constructor(private http: HttpClient, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.loading = true;
    this.http.get<any[]>(`${this.baseUrl}/api/crm/helpdesk/tickets`).pipe(
      timeout(10000),
      finalize(() => { this.loading = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (data) => { this.requests = data || []; this.cdr.detectChanges(); },
      error: () => { this.requests = []; this.cdr.detectChanges(); },
    });
  }
}
