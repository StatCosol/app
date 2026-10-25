import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs/operators';
import { AuthService } from '../../../core/auth.service';
import { ClientComplianceService } from '../../../core/client-compliance.service';
import { ReturnsService } from '../../../core/returns.service';
import { EmptyStateComponent, LoadingSpinnerComponent, PageHeaderComponent } from '../../../shared/ui';

type StatusTab = 'ALL' | 'PENDING' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'OVERDUE';

@Component({
  standalone: true,
  selector: 'app-client-returns-page',
  imports: [RouterLink, CommonModule, FormsModule, PageHeaderComponent, LoadingSpinnerComponent, EmptyStateComponent],
  template: `
    <div class="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <ui-page-header
        title="Returns Status"
        subtitle="Filing queue across branches, with status and period filters">
      </ui-page-header>

      <div class="flex flex-wrap gap-2 mb-4">
        @for (tab of tabs; track tab) {
          <button (click)="activeTab = tab; applyFilter()"
            [class]="activeTab === tab
              ? 'px-3 py-1 rounded-full text-sm font-medium bg-brand-600 text-white'
              : 'px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200'">
            {{ tab }}
          </button>
        }
      </div>

      <div class="mb-4 flex gap-3 items-center flex-wrap">
        <select [(ngModel)]="branchId" (ngModelChange)="load()" class="border border-gray-300 rounded-lg px-3 py-2 text-sm">
          <option value="">All Branches</option>
          @for (branch of branches; track branch.id) {
            <option [value]="branch.id">{{ branch.name || branch.branchName || branch.code }}</option>
          }
        </select>
        <label>Month <select aria-label="Filing month" [(ngModel)]="periodMonth" (ngModelChange)="load()" class="border rounded-lg px-3 py-2">
          <option [ngValue]="0">All months</option>
          @for (m of months; track m) { <option [ngValue]="m">{{ m }}</option> }
        </select></label>
        <label>Year <input aria-label="Filing year" placeholder="All years" type="number" min="2000" max="2200" [(ngModel)]="periodYear" (ngModelChange)="load()" class="border rounded-lg px-3 py-2 w-24" /></label>
        <input type="text" [(ngModel)]="searchTerm" (ngModelChange)="applyFilter()"
          placeholder="Search returns..." class="workspace-search border border-gray-300 rounded-lg px-3 py-2 text-sm w-56" />
      </div>

      @if (loading) {
        <ui-loading-spinner text="Loading returns..."></ui-loading-spinner>
      }

      @if (!loading && filtered.length === 0) {
        <ui-empty-state title="No returns found" description="Try another branch, status tab, or search term."></ui-empty-state>
      }

      @if (!loading && filtered.length > 0) {
        <div class="table-wrap rounded-lg border border-gray-200 bg-white">
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
              @for (r of filtered; track r) {
                <tr class="hover:bg-gray-50">
                  <td class="px-4 py-3">{{ r.branch_name || '—' }}</td>
                  <td class="px-4 py-3">{{ r.law_type }}</td>
                  <td class="px-4 py-3"><a class="text-brand-700 underline" routerLink="/client/compliance/returns"
                    [queryParams]="{branchId: r.branch_id, periodMonth: r.period_month, periodYear: r.period_year, code: r.return_type, filingId: r.id}">{{ r.return_type }} â€” open filing</a></td>
                  <td class="px-4 py-3">{{ r.period_label || (r.period_month + '/' + r.period_year) }}</td>
                  <td class="px-4 py-3">{{ r.due_date | date:'mediumDate' }}</td>
                  <td class="px-4 py-3">{{ r.filed_date ? (r.filed_date | date:'mediumDate') : '—' }}</td>
                  <td class="px-4 py-3">
                    <span [class]="statusBadge(r.status)" class="px-2 py-0.5 rounded-full text-xs font-medium">
                      {{ r.status }}
                    </span>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
})
export class ClientReturnsPageComponent implements OnInit {
  tabs: StatusTab[] = ['ALL', 'PENDING', 'SUBMITTED', 'APPROVED', 'REJECTED', 'OVERDUE'];
  activeTab: StatusTab = 'ALL';
  branchId = '';
  months = Array.from({length: 12}, (_, i) => i + 1);
  periodMonth = 0;
  periodYear: number | null = null;
  searchTerm = '';
  loading = false;
  branches: Array<{ id: string; name?: string; branchName?: string; code?: string }> = [];

  rows: any[] = [];
  filtered: any[] = [];
  private clientId = '';
  private readonly cdr = inject(ChangeDetectorRef);

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly returnsService: ReturnsService,
    private readonly auth: AuthService,
    private readonly complianceSvc: ClientComplianceService,
  ) {}

  ngOnInit(): void {
    this.branchId = this.route.snapshot.queryParamMap.get('branchId') || '';
    this.periodMonth = Number(this.route.snapshot.queryParamMap.get('periodMonth')) || 0;
    this.periodYear = Number(this.route.snapshot.queryParamMap.get('periodYear') || this.route.snapshot.queryParamMap.get('year')) || null;

    this.clientId =
      this.route.parent?.snapshot.params['clientId'] || this.auth.getUser()?.clientId || '';
    this.loadBranches();
    this.load();
  }

  loadBranches(): void {
    this.complianceSvc.getBranches().subscribe({
      next: (res: any) => {
        this.branches = res?.data || res || [];
        this.cdr.markForCheck();
      },
      error: () => {
        this.branches = [];
        this.cdr.markForCheck();
      },
    });
  }

  load(): void {
    if (!this.clientId) return;
    void this.router.navigate([], {relativeTo: this.route, replaceUrl: true, queryParamsHandling: 'merge',
      queryParams: {branchId: this.branchId || null, periodMonth: this.periodMonth || null, periodYear: this.periodYear || null}});

    this.loading = true;
    this.cdr.markForCheck();
    this.returnsService
      .getClientReturns(this.clientId, this.branchId || undefined)
      .pipe(finalize(() => {
        this.loading = false;
        this.cdr.markForCheck();
      }))
      .subscribe({
        next: (data) => { this.rows = data || []; this.applyFilter(); },
        error: (err) => console.error('Failed to load returns', err?.message || err?.statusText),
      });
  }

  applyFilter(): void {
    let list = this.rows;
    if (this.periodMonth) list = list.filter(r => Number(r.period_month) === this.periodMonth);
    if (this.periodYear) list = list.filter(r => Number(r.period_year) === this.periodYear);

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
    this.cdr.markForCheck();
  }

  statusBadge(status: string): string {
    const map: Record<string, string> = {
      PENDING: 'bg-yellow-100 text-yellow-800',
      SUBMITTED: 'bg-brand-100 text-brand-800',
      APPROVED: 'bg-green-100 text-green-800',
      REJECTED: 'bg-red-100 text-red-800',
      OVERDUE: 'bg-red-200 text-red-900',
    };
    return map[(status || '').toUpperCase()] || 'bg-gray-100 text-gray-700';
  }
}
