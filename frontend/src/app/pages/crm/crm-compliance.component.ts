import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs/operators';

interface ComplianceTaskItem {
  id: string | number;
  title: string;
  clientName?: string;
  branchName?: string;
  status: string;
  dueDate?: string;
  frequency?: string;
}

type ComplianceTab = 'ALL' | 'OVERDUE' | 'PENDING' | 'APPROVED';

@Component({
  selector: 'app-crm-compliance',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="page-card">
      <div class="page-header">
        <div>
          <h2>Compliance</h2>
          <p>Track assigned compliance tasks and due dates.</p>
        </div>
        <button type="button" class="primary-btn" (click)="loadTasks()">Refresh</button>
      </div>

      <div class="stats-row">
        <div class="stat-card">
          <span class="stat-label">Total Tasks</span>
          <strong>{{ tasks().length }}</strong>
        </div>
        <div class="stat-card">
          <span class="stat-label">Overdue</span>
          <strong>{{ overdueCount() }}</strong>
        </div>
        <div class="stat-card">
          <span class="stat-label">Pending</span>
          <strong>{{ pendingCount() }}</strong>
        </div>
      </div>

      <div class="tabs-row">
        <button
          type="button"
          class="tab-btn"
          [class.tab-active]="activeTab() === 'ALL'"
          (click)="setTab('ALL')"
        >
          All
        </button>
        <button
          type="button"
          class="tab-btn"
          [class.tab-active]="activeTab() === 'OVERDUE'"
          (click)="setTab('OVERDUE')"
        >
          Overdue
        </button>
        <button
          type="button"
          class="tab-btn"
          [class.tab-active]="activeTab() === 'PENDING'"
          (click)="setTab('PENDING')"
        >
          Pending
        </button>
        <button
          type="button"
          class="tab-btn"
          [class.tab-active]="activeTab() === 'APPROVED'"
          (click)="setTab('APPROVED')"
        >
          Approved
        </button>
      </div>

      <div *ngIf="loading" class="state-box">Loading compliance tasks...</div>
      <div *ngIf="error" class="state-box error">{{ error }}</div>

      <div class="table-wrap" *ngIf="!loading && !error">
        <table class="data-table" *ngIf="filteredTasks().length; else noTasks">
          <thead>
            <tr>
              <th>Title</th>
              <th>Client</th>
              <th>Branch</th>
              <th>Frequency</th>
              <th>Due Date</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let task of filteredTasks()">
              <td>{{ task.title }}</td>
              <td>{{ task.clientName || '-' }}</td>
              <td>{{ task.branchName || '-' }}</td>
              <td>{{ task.frequency || '-' }}</td>
              <td>{{ task.dueDate ? (task.dueDate | date:'dd-MMM-yyyy') : '-' }}</td>
              <td>
                <span class="badge" [ngClass]="statusClass(task.status)">
                  {{ task.status }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>

        <ng-template #noTasks>
          <div class="state-box">No compliance tasks found for selected filter.</div>
        </ng-template>
      </div>
    </section>
  `,
  styles: [
    `
      .page-card {
        margin-top: 20px;
        background: #fff;
        border-radius: 16px;
        padding: 20px;
        box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
      }

      .page-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
        margin-bottom: 20px;
      }

      .page-header h2 {
        margin: 0 0 6px;
        color: #0f172a;
      }

      .page-header p {
        margin: 0;
        color: #64748b;
      }

      .primary-btn,
      .tab-btn {
        border: 0;
        border-radius: 10px;
        padding: 10px 14px;
        font-weight: 600;
        cursor: pointer;
      }

      .primary-btn {
        background: #2563eb;
        color: #fff;
      }

      .tabs-row {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        margin-bottom: 20px;
      }

      .tab-btn {
        background: #e2e8f0;
        color: #0f172a;
      }

      .tab-active {
        background: #0f172a;
        color: #fff;
      }

      .stats-row {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 14px;
        margin-bottom: 20px;
      }

      .stat-card {
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 14px;
        padding: 16px;
      }

      .stat-label {
        display: block;
        color: #64748b;
        font-size: 13px;
        margin-bottom: 6px;
      }

      .state-box {
        padding: 14px 16px;
        border-radius: 12px;
        background: #f8fafc;
        color: #334155;
      }

      .state-box.error {
        background: #fef2f2;
        color: #b91c1c;
      }

      .table-wrap {
        overflow: auto;
      }

      .data-table {
        width: 100%;
        border-collapse: collapse;
      }

      .data-table th,
      .data-table td {
        text-align: left;
        padding: 12px 10px;
        border-bottom: 1px solid #e2e8f0;
      }

      .badge {
        display: inline-block;
        padding: 4px 10px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 700;
      }

      .badge-pending {
        background: #fef3c7;
        color: #92400e;
      }

      .badge-overdue {
        background: #fee2e2;
        color: #991b1b;
      }

      .badge-approved {
        background: #dcfce7;
        color: #166534;
      }

      .badge-default {
        background: #e2e8f0;
        color: #334155;
      }

      @media (max-width: 900px) {
        .stats-row {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
})
export class CrmComplianceComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);

  readonly tasks = signal<ComplianceTaskItem[]>([]);
  readonly activeTab = signal<ComplianceTab>('ALL');

  readonly filteredTasks = computed(() => {
    const tab = this.activeTab();
    const items = this.tasks();

    if (tab === 'ALL') return items;
    if (tab === 'OVERDUE') {
      return items.filter((t) => String(t.status).toUpperCase() === 'OVERDUE');
    }
    if (tab === 'PENDING') {
      return items.filter((t) =>
        ['PENDING', 'IN_PROGRESS', 'SUBMITTED'].includes(String(t.status).toUpperCase()),
      );
    }
    if (tab === 'APPROVED') {
      return items.filter((t) =>
        ['APPROVED', 'COMPLETED'].includes(String(t.status).toUpperCase()),
      );
    }
    return items;
  });

  readonly overdueCount = computed(
    () => this.tasks().filter((t) => String(t.status).toUpperCase() === 'OVERDUE').length,
  );

  readonly pendingCount = computed(
    () =>
      this.tasks().filter((t) =>
        ['PENDING', 'IN_PROGRESS', 'SUBMITTED'].includes(String(t.status).toUpperCase()),
      ).length,
  );

  loading = false;
  error = '';

  ngOnInit(): void {
    this.loadTasks();
  }

  setTab(tab: ComplianceTab): void {
    this.activeTab.set(tab);
  }

  loadTasks(): void {
    this.loading = true;
    this.error = '';

    this.http
      .get<ComplianceTaskItem[]>('/api/v1/compliance/tasks')
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => (this.loading = false)),
      )
      .subscribe({
        next: (response) => {
          this.tasks.set(Array.isArray(response) ? response : []);
        },
        error: (err) => {
          this.error = err?.error?.message || 'Failed to load compliance tasks.';
          this.tasks.set([]);
        },
      });
  }

  statusClass(status: string): string {
    const value = String(status || '').toUpperCase();

    if (value === 'PENDING' || value === 'IN_PROGRESS' || value === 'SUBMITTED') {
      return 'badge badge-pending';
    }

    if (value === 'OVERDUE' || value === 'REJECTED') {
      return 'badge badge-overdue';
    }

    if (value === 'APPROVED' || value === 'COMPLETED') {
      return 'badge badge-approved';
    }

    return 'badge badge-default';
  }
}