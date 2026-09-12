import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { forkJoin, of, Subject, Subscription } from 'rxjs';
import { catchError, defaultIfEmpty, finalize, takeUntil, timeout } from 'rxjs/operators';
import { AuthService } from '../../core/auth.service';
import { ClientBranchesService } from '../../core/client-branches.service';
import {
  BranchComplianceService,
  BranchComplianceResponse,
  ComplianceScheduleEntry,
} from './branch-compliance.service';

@Component({
  selector: 'app-branch-compliance-items',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, DatePipe],
  template: `
    <div class="page-container">
      <!-- Header -->
      <div class="page-header">
        <div>
          <h1 class="page-title">Branch Compliance Schedule</h1>
          @if (data) {
<p class="page-subtitle">
            {{ data.branchName }} &middot; {{ data.stateCode | uppercase }} &middot; {{ data.establishmentType }}
          </p>
}
        </div>

        <!-- Month picker -->
        <div class="flex items-center gap-3">
          <button class="btn-icon" (click)="prevMonth()" title="Previous month">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
            </svg>
          </button>
          <input
            type="month"
            class="month-input"
            aria-label="Schedule month"
            [ngModel]="selectedMonth"
            (ngModelChange)="onMonthChange($event)"
          />
          <button class="btn-icon" (click)="nextMonth()" title="Next month">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- Branch selector (for client portal with multiple branches) -->
      @if (branchIds.length > 1 && !fixedBranchId) {
<div class="branch-selector">
        <label class="text-sm font-medium text-gray-600" for="bci-selected-branch-id">Branch</label>
        <select id="bci-selected-branch-id" name="selectedBranchId" class="select-input" [(ngModel)]="selectedBranchId" (ngModelChange)="load()">
          @for (id of branchIds; track id) {
<option [value]="id">{{ id }}</option>
}
        </select>
      </div>
}

      <!-- Loading skeleton -->
      @if (loading) {
<div class="space-y-3 mt-6" role="status" aria-label="Loading compliance schedule">
        @for (i of [1,2,3,4,5]; track i) {
<div class="skeleton-row"></div>
}
      </div>
}

      <!-- Error -->
      @if (error && !loading) {
<div class="error-banner mt-6" role="alert">
        <svg class="w-5 h-5 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
        </svg>
        <span>{{ error }}</span>
        <button type="button" class="retry-button" (click)="retry()">Retry</button>
      </div>
}

      <!-- Empty state -->
      @if (!loading && !error && data && data.items.length === 0) {
<div class="empty-state mt-6">
        <svg class="w-12 h-12 mx-auto text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
        <p class="text-gray-500">No compliance items applicable for this branch in {{ selectedMonth }}.</p>
      </div>
}

      <!-- Results -->
      @if (!loading && !error && data && data.items.length > 0) {
<div class="mt-6 space-y-6">
        <!-- Summary cards -->
        <div class="summary-grid">
          <div class="summary-card summary-card--returns">
            <span class="summary-count">{{ returnsItems.length }}</span>
            <span class="summary-label">Returns / Payments</span>
          </div>
          <div class="summary-card summary-card--mcd">
            <span class="summary-count">{{ mcdItems.length }}</span>
            <span class="summary-label">MCD / Document</span>
          </div>
        </div>

        <!-- Returns section -->
        @if (returnsItems.length) {
<div class="section-card">
          <h2 class="section-title">
            <svg class="w-5 h-5 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6M9 8h6m2-4H7l-2 2v12a2 2 0 002 2h10a2 2 0 002-2V6a2 2 0 00-2-2z"/>
            </svg>
            Returns &amp; Payments Due
          </h2>
          <div class="table-wrapper">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Compliance</th>
                  <th>Module</th>
                  <th>Frequency</th>
                  <th>Due Date</th>
                  <th>Priority</th>
                </tr>
              </thead>
              <tbody>
                @for (item of returnsItems; track item) {
<tr class="table-row">
                  <td class="font-medium">{{ item.name }}</td>
                  <td>{{ item.module }}</td>
                  <td>
                    <span class="freq-badge" [ngClass]="'freq--' + item.frequency.toLowerCase()">
                      {{ item.frequency }}
                    </span>
                  </td>
                  <td class="font-mono text-sm">{{ item.dueDate | date:'dd MMM yyyy' }}</td>
                  <td>
                    <span class="priority-badge" [ngClass]="'priority--' + item.priority.toLowerCase()">
                      {{ item.priority }}
                    </span>
                  </td>
                </tr>
}
              </tbody>
            </table>
          </div>
        </div>
}

        <!-- MCD section -->
        @if (mcdItems.length) {
<div class="section-card">
          <h2 class="section-title">
            <svg class="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
            </svg>
            Monthly Compliance Documents
          </h2>
          <div class="table-wrapper">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Compliance</th>
                  <th>Module</th>
                  <th>Window Open</th>
                  <th>Window Close</th>
                  <th>Priority</th>
                </tr>
              </thead>
              <tbody>
                @for (item of mcdItems; track item) {
<tr class="table-row">
                  <td class="font-medium">{{ item.name }}</td>
                  <td>{{ item.module }}</td>
                  <td class="font-mono text-sm">{{ item.windowOpen | date:'dd MMM yyyy' }}</td>
                  <td class="font-mono text-sm">{{ item.windowClose | date:'dd MMM yyyy' }}</td>
                  <td>
                    <span class="priority-badge" [ngClass]="'priority--' + item.priority.toLowerCase()">
                      {{ item.priority }}
                    </span>
                  </td>
                </tr>
}
              </tbody>
            </table>
          </div>
        </div>
}
      </div>
}
    </div>
  `,
  styles: [`
    .page-container {
      max-width: 960px;
      margin: 0 auto;
      padding: 24px 20px 48px;
    }

    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      flex-wrap: wrap;
      gap: 16px;
    }

    .page-title {
      font-size: 1.5rem;
      font-weight: 700;
      color: #1e293b;
    }

    .page-subtitle {
      font-size: 0.875rem;
      color: #64748b;
      margin-top: 4px;
    }

    .btn-icon {
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
      background: #fff;
      cursor: pointer;
      color: #475569;
      transition: all 0.15s;
    }
    .btn-icon:hover {
      background: #f1f5f9;
      border-color: #cbd5e1;
    }

    .btn-icon svg { width: 20px; height: 20px; flex: none; }
    .retry-button {
      margin-left: auto; padding: 8px 16px; border: 1px solid currentColor;
      border-radius: 8px; background: #fff; color: #991b1b; font-weight: 600;
      cursor: pointer;
    }
    .retry-button:focus-visible, .btn-icon:focus-visible {
      outline: 2px solid #1d4ed8; outline-offset: 2px;
    }

    .month-input {
      padding: 6px 12px;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
      font-size: 0.875rem;
      font-weight: 500;
      color: #334155;
      background: #fff;
    }

    .branch-selector {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-top: 16px;
    }

    .select-input {
      padding: 6px 12px;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      font-size: 0.875rem;
      background: #fff;
      color: #334155;
    }

    .skeleton-row {
      height: 48px;
      border-radius: 8px;
      background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%);
      background-size: 200% 100%;
      animation: shimmer 1.5s infinite;
    }

    @keyframes shimmer {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }

    .error-banner {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 16px;
      border-radius: 10px;
      background: #fef2f2;
      border: 1px solid #fecaca;
      color: #991b1b;
      font-size: 0.875rem;
    }

    .empty-state {
      text-align: center;
      padding: 48px 24px;
      background: #fafafa;
      border-radius: 12px;
      border: 1px dashed #e2e8f0;
    }

    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 16px;
    }

    .summary-card {
      padding: 20px;
      border-radius: 12px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .summary-card--returns {
      background: linear-gradient(135deg, #eff6ff, #dbeafe);
      border: 1px solid #bfdbfe;
    }
    .summary-card--mcd {
      background: linear-gradient(135deg, #ecfdf5, #d1fae5);
      border: 1px solid #a7f3d0;
    }
    .summary-count {
      font-size: 2rem;
      font-weight: 700;
      color: #1e293b;
    }
    .summary-label {
      font-size: 0.8rem;
      color: #64748b;
      font-weight: 500;
    }

    .section-card {
      background: #fff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      overflow: hidden;
    }

    .section-title {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 16px 20px;
      font-size: 1rem;
      font-weight: 600;
      color: #1e293b;
      border-bottom: 1px solid #f1f5f9;
    }

    .table-wrapper {
      overflow-x: auto;
    }

    .data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.875rem;
    }
    .data-table th {
      text-align: left;
      padding: 10px 16px;
      font-weight: 600;
      color: #64748b;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      background: #f8fafc;
      border-bottom: 1px solid #e2e8f0;
    }
    .data-table td {
      padding: 12px 16px;
      color: #334155;
      border-bottom: 1px solid #f1f5f9;
    }

    .table-row:hover {
      background: #f8fafc;
    }

    .freq-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 6px;
      font-size: 0.7rem;
      font-weight: 600;
      text-transform: uppercase;
    }
    .freq--monthly { background: #dbeafe; color: #1e40af; }
    .freq--half_yearly { background: #fef3c7; color: #92400e; }
    .freq--yearly { background: #e0e7ff; color: #3730a3; }
    .freq--window { background: #d1fae5; color: #065f46; }

    .priority-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 6px;
      font-size: 0.7rem;
      font-weight: 600;
      text-transform: uppercase;
    }
    .priority--critical { background: #fef2f2; color: #991b1b; }
    .priority--high { background: #fff7ed; color: #9a3412; }
    .priority--medium { background: #fefce8; color: #854d0e; }
    .priority--low { background: #f0fdf4; color: #166534; }
  `],
})
export class BranchComplianceItemsComponent implements OnInit, OnDestroy {
  loading = false;
  error = '';
  data: BranchComplianceResponse | null = null;
  selectedMonth = '';
  selectedBranchId = '';
  branchIds: string[] = [];
  fixedBranchId = '';

  private destroy$ = new Subject<void>();
  private initialLoadStarted = false;
  private scheduleRequest?: Subscription;

  constructor(
    private api: BranchComplianceService,
    private auth: AuthService,
    private branchesApi: ClientBranchesService,
    private route: ActivatedRoute,
    private router: Router,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    // Default to current month
    const now = new Date();
    this.selectedMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    this.resolveBranchAndLoad();
  }

  private resolveBranchAndLoad(): void {
    this.initialLoadStarted = false;
    const paramBranch = this.route.snapshot.paramMap.get('branchId');
    if (paramBranch) {
      this.fixedBranchId = paramBranch;
      this.selectedBranchId = paramBranch;
      this.startInitialLoad();
      return;
    }

    if (this.applyBranchIdsAndLoad(this.auth.getBranchIds())) {
      return;
    }

    this.loading = true;
    this.error = '';
    this.data = null;

    // Both sources settle, then ONE decision.
    //
    // These used to be two independent subscriptions, with `loading` cleared by
    // a condition inside the branch-list finalize. Whether the spinner ever
    // stopped therefore depended on which of the two won the race and on what
    // the other had already mutated — and one interleaving left the page on
    // skeletons with no request in flight, no error, and nothing that could
    // clear it. That state is unreachable now: forkJoin waits for both, errors
    // are folded into empty values so neither can strand the other, and every
    // path out of the subscribe either starts a load or sets an error.
    forkJoin({
      me: this.auth.fetchMe().pipe(timeout(15000), defaultIfEmpty(null), catchError(() => of(null))),
      branches: this.branchesApi
        .list()
        .pipe(timeout(15000), defaultIfEmpty([]), catchError(() => of([] as unknown[]))),
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe(({ branches }) => {
        // The refreshed profile is the authority; the branch list is the
        // fallback for users whose token carries no branch ids.
        if (this.applyBranchIdsAndLoad(this.auth.getBranchIds())) return;
        if (this.applyBranchIdsAndLoad(branches as unknown[])) return;
        this.error = 'No branch is available for this user. Retry or contact your administrator.';
        this.loading = false;
        this.cdr.markForCheck();
      });
  }

  private applyBranchIds(ids: unknown[] | null | undefined): boolean {
    this.branchIds = (ids || [])
      .map((id) => this.extractBranchId(id))
      .filter((id): id is string => !!id);
    if (!this.branchIds.length) return false;
    if (this.branchIds.length === 1) {
      this.fixedBranchId = this.branchIds[0];
    }
    this.selectedBranchId = this.selectedBranchId || this.branchIds[0];
    return true;
  }

  /**
   * True only when a request actually started — not merely when ids parsed.
   *
   * The caller uses this to decide whether to fall through to an error, so
   * "ids looked fine but nothing was fetched" must report false, or the page
   * goes back to sitting on a spinner nobody clears.
   */
  private applyBranchIdsAndLoad(ids: unknown[] | null | undefined): boolean {
    if (!this.applyBranchIds(ids)) return false;
    return this.startInitialLoad();
  }

  private startInitialLoad(): boolean {
    if (this.initialLoadStarted) return true;
    // Only claim the initial load has happened once one can actually happen.
    //
    // This used to set the flag and then call load(), which returns silently
    // when a branch or month is missing. A no-op therefore burned the one-shot
    // guard: the branch id arriving moments later from fetchMe() or the branch
    // list hit `if (initialLoadStarted) return` and nothing was ever requested,
    // while `loading` stayed true from resolveBranchAndLoad. That is the page
    // sitting on skeletons until you click the tab again — a second click
    // builds a fresh component with a fresh flag, which is why it then works.
    if (!this.canLoad()) return false;
    this.initialLoadStarted = true;
    this.load();
    return true;
  }

  private canLoad(): boolean {
    return !!this.selectedBranchId && !!this.selectedMonth;
  }

  private extractBranchId(value: unknown): string | null {
    if (!value) return null;
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return String(value);
    if (typeof value !== 'object') return null;
    const row = value as Record<string, unknown>;
    const id = row['id'] ?? row['branchId'] ?? row['branch_id'];
    return id ? String(id) : null;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  retry(): void {
    if (this.canLoad()) this.load();
    else this.resolveBranchAndLoad();
  }

  load(): void {
    // Cancel the previous month before starting another request.
    this.scheduleRequest?.unsubscribe();
    if (!this.canLoad()) {
      // Never leave the skeleton up on a path that fetches nothing. Silently
      // returning while `loading` was true is what made a missing branch id
      // look like an endless load rather than an empty or failed state.
      this.loading = false;
      this.error = 'Select a branch and month to load the schedule.';
      this.cdr.markForCheck();
      return;
    }

    this.loading = true;
    this.error = '';
    this.data = null;

    this.cdr.markForCheck();
    this.scheduleRequest = this.api
      .getComplianceItems(this.selectedBranchId, this.selectedMonth)
      .pipe(
        takeUntil(this.destroy$),
        timeout(15000),
        defaultIfEmpty(null),
        finalize(() => {
          this.loading = false;
          // The route is inside an OnPush layout; HTTP completion must notify it.
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (res) => {
          this.data = res;
          if (!res) this.error = 'The schedule request ended without a response. Please retry.';
        },
        error: (err) => (this.error = err?.error?.message || 'Failed to load compliance items.'),
      });
  }

  get returnsItems(): ComplianceScheduleEntry[] {
    return (this.data?.items || []).filter((i) => i.module === 'RETURNS');
  }

  get mcdItems(): ComplianceScheduleEntry[] {
    return (this.data?.items || []).filter((i) => i.module === 'MCD');
  }

  onMonthChange(val: string): void {
    this.selectedMonth = val;
    this.load();
  }

  prevMonth(): void {
    const d = new Date(this.selectedMonth + '-01');
    d.setMonth(d.getMonth() - 1);
    this.selectedMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    this.load();
  }

  nextMonth(): void {
    const d = new Date(this.selectedMonth + '-01');
    d.setMonth(d.getMonth() + 1);
    this.selectedMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    this.load();
  }
}
