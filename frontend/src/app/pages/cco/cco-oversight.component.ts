import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { finalize, timeout } from 'rxjs/operators';
import { PageHeaderComponent, EmptyStateComponent, LoadingSpinnerComponent } from '../../shared/ui';
import { ShortIdPipe } from '../../shared/pipes/short-id.pipe';

@Component({
  selector: 'app-cco-oversight',
  standalone: true,
  imports: [CommonModule, PageHeaderComponent, EmptyStateComponent, LoadingSpinnerComponent, ShortIdPipe],
  template: `
    <main class="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <ui-page-header
        title="Compliance Oversight"
        description="Monitor escalated tasks and compliance status"
        icon="clipboard-check">
      </ui-page-header>

      <ui-loading-spinner *ngIf="loading" text="Loading oversight data..."></ui-loading-spinner>

      <div *ngIf="error" class="alert alert-error mb-4">{{ error }}</div>

      <ui-empty-state
        *ngIf="!loading && !error && tasks.length === 0"
        title="No escalated tasks"
        description="Escalated compliance tasks will appear here."
        icon="clipboard-check">
      </ui-empty-state>

      <div *ngIf="!loading && tasks.length > 0" class="card overflow-hidden">
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Task ID</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Client</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Branch</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Due Date</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Escalated At</th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              <tr *ngFor="let t of tasks" class="hover:bg-gray-50">
                <td class="px-6 py-4 text-sm font-medium font-mono" title="{{ t.id }}">{{ t.id | shortId }}</td>
                <td class="px-6 py-4 text-sm">{{ t.client || '\u2014' }}</td>
                <td class="px-6 py-4 text-sm">{{ t.branch || '\u2014' }}</td>
                <td class="px-6 py-4 text-sm">{{ t.dueDate | date:'mediumDate' }}</td>
                <td class="px-6 py-4 text-sm"><span class="badge badge-warning">{{ t.status }}</span></td>
                <td class="px-6 py-4 text-sm">{{ t.escalatedAt | date:'medium' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </main>
  `,
})
export class CcoOversightComponent implements OnInit {
  tasks: any[] = [];
  loading = false;
  error: string | null = null;

  constructor(private http: HttpClient, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.loading = true;
    this.http.get<any[]>('/api/cco/oversight').pipe(
      timeout(10000),
      finalize(() => { this.loading = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (data) => { this.tasks = data || []; this.cdr.detectChanges(); },
      error: () => { this.tasks = []; this.cdr.detectChanges(); },
    });
  }
}
