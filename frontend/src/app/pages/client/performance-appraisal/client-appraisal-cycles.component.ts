import { IconComponent } from '../../../shared/ui/icon/icon.component';
import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subject, Observable } from 'rxjs';
import { takeUntil, finalize } from 'rxjs/operators';
import { PerformanceAppraisalService } from '../../../core/services/performance-appraisal.service';
import { AppraisalCycle } from '../../../core/models/appraisal.models';
import { PageHeaderComponent } from '../../../shared/ui';

@Component({
  selector: 'app-client-appraisal-cycles',
  standalone: true,
  imports: [IconComponent, CommonModule, FormsModule, RouterLink, PageHeaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['../shared/client-theme.scss', './client-appraisal-theme.scss'],
  template: `
    <div class="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <ui-page-header
        title="Appraisal Cycles"
        subtitle="Create and manage appraisal cycles">
        <a routerLink="/client/appraisal-dashboard" class="appraisal-action">Dashboard</a>
        <button [disabled]="creating" (click)="showCreateForm = !showCreateForm" class="standard-action appraisal-action appraisal-action--primary" [title]="showCreateForm ? 'Close Form' : 'Create Cycle'" [attr.aria-label]="showCreateForm ? 'Close Form' : 'Create Cycle'">@if (!showCreateForm) { <ui-icon name="plus" [size]="20" /> }<span>
          {{ showCreateForm ? 'Close Form' : 'Create Cycle' }}
        </span></button>
      </ui-page-header>

      @if (actionError) { <div role="alert" class="table-card mb-4 text-red-700">{{ actionError }}</div> }
      @if (actionMessage) { <div role="status" class="table-card mb-4">{{ actionMessage }}</div> }
      @if (pendingAction) { <div role="status" class="mb-4">Updating cycle. Please wait before another action.</div> }
      <!-- Create Form -->
      @if (showCreateForm) {
<div class="table-card mb-6">
        <h3 class="text-sm font-semibold text-gray-900 mb-4">New Appraisal Cycle</h3>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label class="text-xs font-medium text-gray-600 block mb-1" for="nc-code">Cycle Code</label>
            <input id="nc-code" name="newCycleCode" type="text" [(ngModel)]="newCycle.cycleCode" class="search-input" placeholder="e.g. APR-2025" />
          </div>
          <div>
            <label class="text-xs font-medium text-gray-600 block mb-1" for="nc-name">Cycle Name</label>
            <input id="nc-name" name="newCycleName" type="text" [(ngModel)]="newCycle.cycleName" class="search-input" placeholder="Annual Appraisal 2025" />
          </div>
          <div>
            <label class="text-xs font-medium text-gray-600 block mb-1" for="nc-fy">Financial Year</label>
            <input id="nc-fy" name="newCycleFy" type="text" [(ngModel)]="newCycle.financialYear" class="search-input" placeholder="2024-2025" />
          </div>
          <div>
            <label class="text-xs font-medium text-gray-600 block mb-1" for="nc-type">Type</label>
            <select id="nc-type" name="newCycleType" [(ngModel)]="newCycle.appraisalType" class="filter-select">
              <option value="ANNUAL">Annual</option>
              <option value="HALF_YEARLY">Half Yearly</option>
              <option value="QUARTERLY">Quarterly</option>
              <option value="PROBATION_CONFIRMATION">Probation Confirmation</option>
              <option value="SPECIAL_REVIEW">Special Review</option>
            </select>
          </div>
          <div>
            <label class="text-xs font-medium text-gray-600 block mb-1" for="nc-from">Review Period From</label>
            <input id="nc-from" name="newCycleFrom" type="date" [(ngModel)]="newCycle.reviewPeriodFrom" class="search-input" />
          </div>
          <div>
            <label class="text-xs font-medium text-gray-600 block mb-1" for="nc-to">Review Period To</label>
            <input id="nc-to" name="newCycleTo" type="date" [(ngModel)]="newCycle.reviewPeriodTo" class="search-input" />
          </div>
        </div>
        <div class="flex items-center gap-3 mt-4">
          <button (click)="createCycle()" [disabled]="creating || !!pendingAction" class="standard-action appraisal-action appraisal-action--primary" title="Create" aria-label="Create"><ui-icon name="plus" [size]="20" /><span>
            {{ creating ? 'Creating...' : 'Create' }}
          </span></button>
        </div>
      </div>
}

      @if (loading) {
<div class="flex items-center justify-center py-20"><div class="spinner"></div></div>
}

      @if (loadError) { <div role="alert" class="table-card text-red-700">{{ loadError }} <button type="button" class="standard-action" (click)="loadCycles()">Retry</button></div> }
      @if (!loading && !loadError) {
<div class="table-card">
        <div class="overflow-x-auto">
          <table class="data-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Financial Year</th>
                <th>Type</th>
                <th>Review Period</th>
                <th>Status</th>
                <th>Eligible</th>
                <th>Completed</th>
                <th>Pending</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (c of cycles; track trackById($index, c)) {
<tr class="data-row">
                <td class="text-xs font-mono text-gray-500">{{ c.cycleCode }}</td>
                <td class="font-medium text-slate-800">{{ c.cycleName }}</td>
                <td>{{ c.financialYear }}</td>
                <td><span class="badge bg-brand-100 text-brand-700">{{ c.appraisalType.replace(/_/g, ' ') }}</span></td>
                <td class="text-xs text-gray-500">{{ c.reviewPeriodFrom | date:'dd/MM/yyyy' }} — {{ c.reviewPeriodTo | date:'dd/MM/yyyy' }}</td>
                <td>
                  <span class="badge"
                    [class.bg-gray-100]="c.status === 'DRAFT'" [class.text-gray-600]="c.status === 'DRAFT'"
                    [class.bg-emerald-100]="c.status === 'ACTIVE'" [class.text-emerald-700]="c.status === 'ACTIVE'"
                    [class.bg-red-100]="c.status === 'CLOSED'" [class.text-red-700]="c.status === 'CLOSED'">
                    {{ c.status }}
                  </span>
                </td>
                <td class="text-center">{{ c.eligibleCount ?? 0 }}</td>
                <td class="text-center text-emerald-600 font-medium">{{ c.completedCount ?? 0 }}</td>
                <td class="text-center text-amber-600 font-medium">{{ c.pendingCount ?? 0 }}</td>
                <td>
                  <div class="flex items-center gap-2">
                    @if (c.status === 'DRAFT') {
<button [disabled]="!!pendingAction || creating" (click)="activateCycle(c.id)" class="compact-action text-emerald-600 hover:text-emerald-800 text-xs font-medium" title="Activate" aria-label="Activate" data-action-label="Activate" data-action-icon="check-circle"><ui-icon name="check-circle" [size]="20" /></button>
}
                    @if (c.status === 'ACTIVE') {
<button [disabled]="!!pendingAction || creating" (click)="generateEmployees(c.id)" class="standard-action text-brand-600 hover:text-brand-800 text-xs font-medium" title="Generate" aria-label="Generate" data-action-label="Generate" data-action-icon="document-plus"><ui-icon name="document-plus" [size]="20" /><span>Generate</span></button>
}
                    @if (c.status === 'ACTIVE') {
<button [disabled]="!!pendingAction || creating" (click)="closeCycle(c.id)" class="standard-action text-red-600 hover:text-red-800 text-xs font-medium">Close</button>
}
                  </div>
                </td>
              </tr>
}
              @if (!cycles.length) {
<tr>
                <td colspan="10" class="text-center text-sm text-gray-400 py-10">No cycles created yet</td>
              </tr>
}
            </tbody>
          </table>
        </div>
      </div>
}

      <!-- Generation result -->
      @if (genResult) {
<div class="table-card mt-4 bg-brand-50 border-brand-200">
        <p class="text-sm text-brand-800">{{ genCycleName }}: Generated {{ genResult.generated }} appraisals ({{ genResult.alreadyExisted }} already existed, {{ genResult.total }} eligible)</p>
      </div>
}
    </div>
  `,
})
export class ClientAppraisalCyclesComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  loading = true;
  loadError = '';
  actionError = '';
  actionMessage = '';
  pendingAction = '';
  genCycleName = '';
  private loadVersion = 0;
  private destroyed = false;
  creating = false;
  showCreateForm = false;
  cycles: AppraisalCycle[] = [];
  genResult: { generated: number; total: number; alreadyExisted: number } | null = null;
  newCycle: any = { cycleCode: '', cycleName: '', financialYear: '', appraisalType: 'ANNUAL', reviewPeriodFrom: '', reviewPeriodTo: '' };

  constructor(private svc: PerformanceAppraisalService, private cdr: ChangeDetectorRef) {}

  ngOnInit() { this.loadCycles(); }

  loadCycles() {
    const version = ++this.loadVersion;
    const current = () => !this.destroyed && version === this.loadVersion;
    this.loadError = ''; this.cycles = [];
    this.loading = true; this.cdr.markForCheck();
    this.svc.getCycles().pipe(
      takeUntil(this.destroy$),
      finalize(() => { if (current()) { this.loading = false; this.cdr.markForCheck(); } }),
    ).subscribe({
      next: c => { if (current()) { this.cycles = c; this.cdr.markForCheck(); } },
      error: () => { if (current()) { this.loadError = 'Appraisal cycles could not be loaded. Retry before relying on counts or actions.'; this.cdr.markForCheck(); } },
    });
  }

  createCycle() {
    if (this.destroyed || this.creating || this.pendingAction) return;
    const snapshot = { ...this.newCycle };
    const validDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0,10) === s;
    this.actionMessage = ''; this.actionError = '';
    if (!snapshot.cycleCode?.trim() || !snapshot.cycleName?.trim() || !snapshot.financialYear?.trim() || !validDate(snapshot.reviewPeriodFrom) || !validDate(snapshot.reviewPeriodTo) || snapshot.reviewPeriodFrom > snapshot.reviewPeriodTo) {
      this.actionError = 'Enter a cycle code, name, financial year and valid review dates in order.'; this.cdr.markForCheck(); return;
    }
    this.creating = true;
    this.svc.createCycle({ ...snapshot }).pipe(
      takeUntil(this.destroy$),
      finalize(() => { if (!this.destroyed) { this.creating = false; this.cdr.markForCheck(); } }),
    ).subscribe({
      next: () => {
        if (this.destroyed) return;
        const unchanged = Object.keys(snapshot).every(k => this.newCycle[k] === snapshot[k]);
        if (unchanged) {
          this.showCreateForm = false;
          this.newCycle = { cycleCode: '', cycleName: '', financialYear: '', appraisalType: 'ANNUAL', reviewPeriodFrom: '', reviewPeriodTo: '' };
        }
        this.actionMessage = unchanged ? 'Cycle created.' : 'Cycle created. Your newer form edits have been kept.';
        this.loadCycles();
      },
      error: () => { if (!this.destroyed) { this.actionError = 'Cycle creation failed. Your entries have been kept; retry when ready.'; this.cdr.markForCheck(); } },
    });
  }

  activateCycle(id: string) {
    this.runCycleAction(id, 'activate');
  }

  closeCycle(id: string) {
    this.runCycleAction(id, 'close');
  }

  generateEmployees(id: string) {
    this.runCycleAction(id, 'generate');
  }

  private runCycleAction(id: string, action: 'activate' | 'close' | 'generate') {
    if (this.destroyed || this.pendingAction || this.creating || this.loading || this.loadError) return;
    const cycle = this.cycles.find(c => c.id === id);
    if (!cycle || cycle.status !== (action === 'activate' ? 'DRAFT' : 'ACTIVE')) return;
    this.pendingAction = id; this.actionError = ''; this.actionMessage = ''; this.genResult = null;
    const request: Observable<any> = action === 'activate' ? this.svc.activateCycle(id) : action === 'close' ? this.svc.closeCycle(id) : this.svc.generateEmployees(id);
    request.pipe(takeUntil(this.destroy$), finalize(() => { if (!this.destroyed) { this.pendingAction = ''; this.cdr.markForCheck(); } })).subscribe({
      next: (result: any) => {
        if (this.destroyed) return;
        if (action === 'generate') { this.genResult = result; this.genCycleName = cycle.cycleName; }
        this.actionMessage = action === 'activate' ? 'Cycle activated.' : action === 'close' ? 'Cycle closed.' : 'Appraisal generation completed.';
        this.loadCycles();
      },
      error: () => { if (!this.destroyed) { this.actionError = 'Cycle action failed. Refresh the cycles before retrying.'; this.loadCycles(); this.cdr.markForCheck(); } },
    });
  }

  trackById(_: number, item: any) { return item.id; }
  ngOnDestroy() { this.destroyed = true; this.destroy$.next(); this.destroy$.complete(); }
}
