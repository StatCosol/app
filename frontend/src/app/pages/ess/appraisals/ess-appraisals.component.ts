import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil, finalize } from 'rxjs/operators';
import { EssApiService } from '../ess-api.service';

@Component({
  selector: 'app-ess-appraisals',
  standalone: true,
  imports: [CommonModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-container">
      <div class="page-header">
        <div>
          <h1 class="page-title">My Appraisals</h1>
          <p class="page-subtitle">View your performance appraisals and submit self-ratings</p>
        </div>
      </div>

      <div *ngIf="loading" class="flex items-center justify-center py-20"><div class="spinner"></div></div>

      <div *ngIf="!loading && !appraisals.length" class="table-card text-center py-16">
        <svg class="mx-auto mb-4 text-gray-300" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
        </svg>
        <p class="text-gray-400 text-sm">No appraisals found for your profile yet.</p>
      </div>

      <div *ngIf="!loading && appraisals.length" class="grid gap-4">
        <div *ngFor="let a of appraisals; trackBy: trackById"
          class="table-card hover:shadow-md transition-shadow cursor-pointer"
          [routerLink]="['/ess/appraisals', a.id]">
          <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <h3 class="text-base font-semibold text-gray-900">{{ a.cycle_name }}</h3>
              <p class="text-xs text-gray-500 mt-0.5">{{ a.financial_year }}</p>
            </div>
            <div class="flex items-center gap-3 flex-wrap">
              <span class="badge"
                [class.bg-amber-100]="a.status === 'INITIATED' || a.status === 'SENT_BACK'"
                [class.text-amber-800]="a.status === 'INITIATED' || a.status === 'SENT_BACK'"
                [class.bg-blue-100]="a.status === 'SELF_SUBMITTED' || a.status === 'MANAGER_REVIEWED' || a.status === 'BRANCH_REVIEWED'"
                [class.text-blue-700]="a.status === 'SELF_SUBMITTED' || a.status === 'MANAGER_REVIEWED' || a.status === 'BRANCH_REVIEWED'"
                [class.bg-emerald-100]="a.status === 'CLIENT_APPROVED' || a.status === 'LOCKED'"
                [class.text-emerald-700]="a.status === 'CLIENT_APPROVED' || a.status === 'LOCKED'"
                [class.bg-red-100]="a.status === 'REJECTED'"
                [class.text-red-700]="a.status === 'REJECTED'">
                {{ formatStatus(a.status) }}
              </span>
              <span *ngIf="a.total_score" class="text-sm font-semibold"
                [class.text-emerald-600]="a.total_score >= 3.5"
                [class.text-amber-600]="a.total_score >= 2 && a.total_score < 3.5"
                [class.text-red-600]="a.total_score < 2">
                Score: {{ a.total_score }}
              </span>
              <span *ngIf="a.final_rating_label" class="badge bg-indigo-100 text-indigo-700">{{ a.final_rating_label }}</span>
            </div>
          </div>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 text-sm">
            <div><span class="text-gray-500">Department:</span> <span class="font-medium ml-1">{{ a.department || '—' }}</span></div>
            <div><span class="text-gray-500">Designation:</span> <span class="font-medium ml-1">{{ a.designation || '—' }}</span></div>
            <div><span class="text-gray-500">Branch:</span> <span class="font-medium ml-1">{{ a.branch_name || '—' }}</span></div>
            <div>
              <span *ngIf="canSelfReview(a)" class="text-indigo-600 font-medium text-xs">✎ Self-rating pending</span>
              <span *ngIf="a.self_status === 'SUBMITTED'" class="text-emerald-600 font-medium text-xs">✓ Self-rating submitted</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class EssAppraisalsComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  loading = true;
  appraisals: any[] = [];

  constructor(private api: EssApiService, private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    this.api.getMyAppraisals().pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.loading = false; this.cdr.markForCheck(); }),
    ).subscribe(data => { this.appraisals = data; });
  }

  canSelfReview(a: any): boolean {
    return ['INITIATED', 'SENT_BACK'].includes(a.status) && a.self_status !== 'SUBMITTED';
  }

  formatStatus(status: string): string {
    return (status || '').replace(/_/g, ' ');
  }

  trackById(_: number, item: any) { return item.id; }
  ngOnDestroy() { this.destroy$.next(); this.destroy$.complete(); }
}
