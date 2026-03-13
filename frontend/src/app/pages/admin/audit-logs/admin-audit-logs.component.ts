import {
  Component,
  OnInit,
  OnDestroy,
  ChangeDetectorRef,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';
import {
  AdminAuditLogsService,
  AuditLogEntry,
} from '../../../core/admin-audit-logs.service';
import {
  PageHeaderComponent,
  StatusBadgeComponent,
  LoadingSpinnerComponent,
  EmptyStateComponent,
} from '../../../shared/ui';

@Component({
  standalone: true,
  selector: 'app-admin-audit-logs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    PageHeaderComponent,
    StatusBadgeComponent,
    LoadingSpinnerComponent,
    EmptyStateComponent,
  ],
  template: `
    <div class="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <ui-page-header
        title="Audit Logs"
        description="Track who changed what across the system"
        icon="clipboard-list">
      </ui-page-header>

      <!-- Filters -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 mb-6 bg-white dark:bg-gray-800 rounded-lg shadow p-4">
        <div>
          <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Entity Type</label>
          <select [(ngModel)]="filters.entityType"
                  class="w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white text-sm">
            <option value="">All</option>
            <option *ngFor="let t of entityTypes" [value]="t">{{ t }}</option>
          </select>
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Action</label>
          <select [(ngModel)]="filters.action"
                  class="w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white text-sm">
            <option value="">All</option>
            <option *ngFor="let a of actions" [value]="a">{{ a }}</option>
          </select>
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Entity ID</label>
          <input type="text" [(ngModel)]="filters.entityId" placeholder="UUID or partial..."
                 class="w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white text-sm" />
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">From</label>
          <input type="date" [(ngModel)]="filters.from"
                 class="w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white text-sm" />
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">To</label>
          <input type="date" [(ngModel)]="filters.to"
                 class="w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white text-sm" />
        </div>
        <div class="flex items-end">
          <button (click)="page = 1; load()"
                  class="w-full px-4 py-2 bg-indigo-600 text-white text-sm rounded-md hover:bg-indigo-700 transition-colors">
            Search
          </button>
        </div>
      </div>

      <ui-loading-spinner *ngIf="loading"></ui-loading-spinner>

      <div *ngIf="!loading && logs.length === 0">
        <ui-empty-state title="No audit logs found" description="Try adjusting filters or date range."></ui-empty-state>
      </div>

      <!-- Results table -->
      <div *ngIf="!loading && logs.length > 0"
           class="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead class="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Time</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Entity</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Action</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Actor</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Details</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
              <tr *ngFor="let log of logs" class="hover:bg-gray-50 dark:hover:bg-gray-750">
                <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap">
                  {{ log.createdAt | date:'short' }}
                </td>
                <td class="px-4 py-3 text-sm">
                  <ui-status-badge [status]="log.entityType" size="sm"></ui-status-badge>
                  <span class="ml-1 text-xs text-gray-400 font-mono">{{ log.entityId | slice:0:8 }}…</span>
                </td>
                <td class="px-4 py-3 text-sm">
                  <span class="px-2 py-0.5 rounded text-xs font-medium"
                        [ngClass]="actionClass(log.action)">
                    {{ log.action }}
                  </span>
                </td>
                <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                  <span *ngIf="log.performedBy" class="font-mono text-xs">{{ log.performedBy | slice:0:8 }}…</span>
                  <span *ngIf="!log.performedBy" class="text-gray-400 italic">system</span>
                  <span *ngIf="log.snapshot?.['performedRole']" class="ml-1 text-xs text-gray-400">
                    ({{ log.snapshot?.['performedRole'] }})
                  </span>
                </td>
                <td class="px-4 py-3 text-sm">
                  <button (click)="expandedId = expandedId === log.id ? null : log.id"
                          class="text-indigo-600 hover:text-indigo-800 text-xs underline">
                    {{ expandedId === log.id ? 'Hide' : 'View' }}
                  </button>
                </td>
              </tr>
              <!-- Expanded detail row -->
              <tr *ngIf="expandedId !== null">
                <td colspan="5" class="px-4 py-3 bg-gray-50 dark:bg-gray-900">
                  <ng-container *ngFor="let log of logs">
                    <pre *ngIf="expandedId === log.id"
                         class="text-xs text-gray-600 dark:text-gray-300 whitespace-pre-wrap max-h-48 overflow-y-auto font-mono">{{ log.snapshot | json }}</pre>
                  </ng-container>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Pagination -->
        <div class="flex justify-between items-center px-4 py-3 border-t border-gray-200 dark:border-gray-700">
          <span class="text-sm text-gray-500 dark:text-gray-400">
            Showing {{ logs.length }} records (page {{ page }})
          </span>
          <div class="flex gap-2">
            <button [disabled]="page <= 1" (click)="page = page - 1; load()"
                    class="px-3 py-1 text-sm border rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-700 dark:border-gray-600 dark:text-gray-300">
              Previous
            </button>
            <button [disabled]="logs.length < pageSize" (click)="page = page + 1; load()"
                    class="px-3 py-1 text-sm border rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-700 dark:border-gray-600 dark:text-gray-300">
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class AdminAuditLogsComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  logs: AuditLogEntry[] = [];
  loading = false;
  expandedId: number | null = null;
  page = 1;
  pageSize = 50;

  filters = {
    entityType: '',
    action: '',
    entityId: '',
    from: '',
    to: '',
  };

  entityTypes = ['CLIENT', 'BRANCH', 'ASSIGNMENT', 'CONTRACTOR', 'USER', 'SYSTEM'];
  actions = [
    'CREATE',
    'UPDATE',
    'SOFT_DELETE',
    'RESTORE',
    'ASSIGN',
    'UNASSIGN',
    'ROTATE',
    'DELETE_REQUEST',
    'DELETE_REJECT',
    'STATUS_CHANGE',
    'PASSWORD_RESET',
    'MASTER_DATA_UPDATED',
  ];

  constructor(
    private svc: AdminAuditLogsService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit() {
    this.load();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  load() {
    this.loading = true;
    this.cdr.markForCheck();

    const params: Record<string, string | number> = {
      limit: this.pageSize,
      offset: (this.page - 1) * this.pageSize,
    };
    if (this.filters.entityType) params['entityType'] = this.filters.entityType;
    if (this.filters.action) params['action'] = this.filters.action;
    if (this.filters.entityId) params['entityId'] = this.filters.entityId;
    if (this.filters.from) params['from'] = this.filters.from;
    if (this.filters.to) params['to'] = this.filters.to;

    this.svc
      .list(params as any)
      .pipe(
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        }),
        takeUntil(this.destroy$),
      )
      .subscribe({
        next: (data) => {
          this.logs = data;
        },
        error: (err) => {
          this.logs = [];
        },
      });
  }

  actionClass(action: string): string {
    switch (action) {
      case 'CREATE':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      case 'UPDATE':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
      case 'SOFT_DELETE':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
      case 'RESTORE':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
      case 'ASSIGN':
      case 'UNASSIGN':
      case 'ROTATE':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    }
  }
}
