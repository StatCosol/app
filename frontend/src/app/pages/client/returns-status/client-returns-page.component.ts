import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { finalize } from 'rxjs/operators';
import { ReturnsService } from '../../../core/returns.service';

type StatusTab = 'ALL' | 'PENDING' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'OVERDUE';

@Component({
  standalone: true,
  selector: 'app-client-returns-page',
  imports: [CommonModule, FormsModule],
  template: `
    <div class="p-6">
      <h2 class="text-xl font-semibold text-gray-800 mb-4">Returns Status</h2>

      <div class="flex flex-wrap gap-2 mb-4">
        <button *ngFor="let tab of tabs" (click)="activeTab = tab; applyFilter()"
          [class]="activeTab === tab
            ? 'px-3 py-1 rounded-full text-sm font-medium bg-indigo-600 text-white'
            : 'px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200'">
          {{ tab }}
        </button>
      </div>

      <div class="mb-4 flex gap-3 items-center flex-wrap">
        <select [(ngModel)]="branchId" (ngModelChange)="load()" class="border border-gray-300 rounded-lg px-3 py-2 text-sm">
          <option value="">All Branches</option>
        </select>
        <input type="text" [(ngModel)]="searchTerm" (ngModelChange)="applyFilter()"
          placeholder="Search returns..." class="border border-gray-300 rounded-lg px-3 py-2 text-sm w-56" />
      </div>

      <div *ngIf="loading" class="text-center py-10 text-gray-500">Loading returns...</div>

      <div *ngIf="!loading && filtered.length === 0" class="text-center py-10 text-gray-400">
        No returns found.
      </div>

      <div *ngIf="!loading && filtered.length > 0" class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200 text-sm">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-4 py-3 text-left font-medium text-gray-600">Branch</th>
              <th class="px-4 py-3 text-left font-medium text-gray-600">Law Type</th>
              <th class="px-4 py-3 text-left font-medium text-gray-600">Return Type</th>
              <th class="px-4 py-3 text-left font-medium text-gray-600">Period</th>
              <th class="px-4 py-3 text-left font-medium text-gray-600">Due Date</th>
              <th class="px-4 py-3 text-left font-medium text-gray-600">Filed Date</th>
              <th class="px-4 py-3 text-left font-medium text-gray-600">Status</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            <tr *ngFor="let r of filtered" class="hover:bg-gray-50">
              <td class="px-4 py-3">{{ r.branch_name || '—' }}</td>
              <td class="px-4 py-3">{{ r.law_type }}</td>
              <td class="px-4 py-3">{{ r.return_type }}</td>
              <td class="px-4 py-3">{{ r.period_label || (r.period_month + '/' + r.period_year) }}</td>
              <td class="px-4 py-3">{{ r.due_date | date:'mediumDate' }}</td>
              <td class="px-4 py-3">{{ r.filed_date ? (r.filed_date | date:'mediumDate') : '—' }}</td>
              <td class="px-4 py-3">
                <span [class]="statusBadge(r.status)" class="px-2 py-0.5 rounded-full text-xs font-medium">
                  {{ r.status }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `,
})
export class ClientReturnsPageComponent implements OnInit {
  tabs: StatusTab[] = ['ALL', 'PENDING', 'SUBMITTED', 'APPROVED', 'REJECTED', 'OVERDUE'];
  activeTab: StatusTab = 'ALL';
  branchId = '';
  searchTerm = '';
  loading = false;

  rows: any[] = [];
  filtered: any[] = [];
  private clientId = '';

  constructor(
    private readonly route: ActivatedRoute,
    private readonly returnsService: ReturnsService,
  ) {}

  ngOnInit(): void {
    this.clientId = this.route.parent?.snapshot.params['clientId'] || '';
    this.load();
  }

  load(): void {
    if (!this.clientId) return;
    this.loading = true;
    this.returnsService
      .getClientReturns(this.clientId, this.branchId || undefined)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (data) => { this.rows = data || []; this.applyFilter(); },
        error: (err) => console.error('Failed to load returns', err?.message || err?.statusText),
      });
  }

  applyFilter(): void {
    let list = this.rows;
    if (this.activeTab !== 'ALL') {
      list = list.filter((r) => (r.status || '').toUpperCase() === this.activeTab);
    }
    if (this.searchTerm) {
      const q = this.searchTerm.toLowerCase();
      list = list.filter((r) =>
        (r.law_type || '').toLowerCase().includes(q) ||
        (r.return_type || '').toLowerCase().includes(q) ||
        (r.branch_name || '').toLowerCase().includes(q)
      );
    }
    this.filtered = list;
  }

  statusBadge(status: string): string {
    const map: Record<string, string> = {
      PENDING: 'bg-yellow-100 text-yellow-800',
      SUBMITTED: 'bg-blue-100 text-blue-800',
      APPROVED: 'bg-green-100 text-green-800',
      REJECTED: 'bg-red-100 text-red-800',
      OVERDUE: 'bg-red-200 text-red-900',
    };
    return map[(status || '').toUpperCase()] || 'bg-gray-100 text-gray-700';
  }
}
