import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil, finalize } from 'rxjs/operators';
import { PerformanceAppraisalService } from '../../../core/services/performance-appraisal.service';
import { AppraisalCycle } from '../../../core/models/appraisal.models';

@Component({
  selector: 'app-client-appraisal-cycles',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-container">
      <div class="page-header">
        <div>
          <h1 class="page-title">Appraisal Cycles</h1>
          <p class="page-subtitle">Create and manage appraisal cycles</p>
        </div>
        <div class="flex items-center gap-3">
          <a routerLink="/client/appraisal-dashboard" class="btn-secondary">Dashboard</a>
          <button (click)="showCreateForm = !showCreateForm" class="btn-primary">
            {{ showCreateForm ? 'Cancel' : 'Create Cycle' }}
          </button>
        </div>
      </div>

      <!-- Create Form -->
      <div *ngIf="showCreateForm" class="table-card mb-6">
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
          <button (click)="createCycle()" [disabled]="creating" class="btn-primary">
            {{ creating ? 'Creating...' : 'Create' }}
          </button>
        </div>
      </div>

      <div *ngIf="loading" class="flex items-center justify-center py-20"><div class="spinner"></div></div>

      <div *ngIf="!loading" class="table-card">
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
              <tr *ngFor="let c of cycles; trackBy: trackById" class="data-row">
                <td class="text-xs font-mono text-gray-500">{{ c.cycleCode }}</td>
                <td class="font-medium text-slate-800">{{ c.cycleName }}</td>
                <td>{{ c.financialYear }}</td>
                <td><span class="badge bg-indigo-100 text-indigo-700">{{ c.appraisalType.replace(/_/g, ' ') }}</span></td>
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
                    <button *ngIf="c.status === 'DRAFT'" (click)="activateCycle(c.id)" class="text-emerald-600 hover:text-emerald-800 text-xs font-medium">Activate</button>
                    <button *ngIf="c.status === 'ACTIVE'" (click)="generateEmployees(c.id)" class="text-indigo-600 hover:text-indigo-800 text-xs font-medium">Generate</button>
                    <button *ngIf="c.status === 'ACTIVE'" (click)="closeCycle(c.id)" class="text-red-600 hover:text-red-800 text-xs font-medium">Close</button>
                  </div>
                </td>
              </tr>
              <tr *ngIf="!cycles.length">
                <td colspan="10" class="text-center text-sm text-gray-400 py-10">No cycles created yet</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Generation result -->
      <div *ngIf="genResult" class="table-card mt-4 bg-blue-50 border-blue-200">
        <p class="text-sm text-blue-800">Generated {{ genResult.generated }} appraisals ({{ genResult.alreadyExisted }} already existed, {{ genResult.total }} eligible)</p>
      </div>
    </div>
  `,
})
export class ClientAppraisalCyclesComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  loading = true;
  creating = false;
  showCreateForm = false;
  cycles: AppraisalCycle[] = [];
  genResult: { generated: number; total: number; alreadyExisted: number } | null = null;
  newCycle: any = { cycleCode: '', cycleName: '', financialYear: '', appraisalType: 'ANNUAL', reviewPeriodFrom: '', reviewPeriodTo: '' };

  constructor(private svc: PerformanceAppraisalService, private cdr: ChangeDetectorRef) {}

  ngOnInit() { this.loadCycles(); }

  loadCycles() {
    this.loading = true; this.cdr.markForCheck();
    this.svc.getCycles().pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.loading = false; this.cdr.markForCheck(); }),
    ).subscribe(c => { this.cycles = c; });
  }

  createCycle() {
    this.creating = true;
    this.svc.createCycle(this.newCycle).pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.creating = false; this.cdr.markForCheck(); }),
    ).subscribe(() => {
      this.showCreateForm = false;
      this.newCycle = { cycleCode: '', cycleName: '', financialYear: '', appraisalType: 'ANNUAL', reviewPeriodFrom: '', reviewPeriodTo: '' };
      this.loadCycles();
    });
  }

  activateCycle(id: string) {
    this.svc.activateCycle(id).pipe(takeUntil(this.destroy$)).subscribe(() => this.loadCycles());
  }

  closeCycle(id: string) {
    this.svc.closeCycle(id).pipe(takeUntil(this.destroy$)).subscribe(() => this.loadCycles());
  }

  generateEmployees(id: string) {
    this.genResult = null;
    this.svc.generateEmployees(id).pipe(takeUntil(this.destroy$)).subscribe(r => {
      this.genResult = r;
      this.loadCycles();
    });
  }

  trackById(_: number, item: any) { return item.id; }
  ngOnDestroy() { this.destroy$.next(); this.destroy$.complete(); }
}
