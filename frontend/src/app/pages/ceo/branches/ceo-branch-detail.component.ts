import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil, finalize } from 'rxjs/operators';
import { CeoBranchesService } from '../../../core/ceo-branches.service';
import { CeoBranchDetail } from '../../../shared/models/ceo-branches.model';
import {
  PageHeaderComponent, Breadcrumb, StatCardComponent,
  LoadingSpinnerComponent, EmptyStateComponent, ActionButtonComponent,
} from '../../../shared/ui';

@Component({
  selector: 'app-ceo-branch-detail',
  standalone: true,
  imports: [
    CommonModule, FormsModule, RouterModule,
    PageHeaderComponent, StatCardComponent,
    LoadingSpinnerComponent, EmptyStateComponent, ActionButtonComponent,
  ],
  templateUrl: './ceo-branch-detail.component.html',
})
export class CeoBranchDetailComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  branchId = '';
  month = new Date().toISOString().slice(0, 7);
  loading = false;
  detail: CeoBranchDetail | null = null;

  breadcrumbs: Breadcrumb[] = [
    { label: 'Dashboard', route: '/ceo/dashboard' },
    { label: 'Branches', route: '/ceo/branches' },
    { label: 'Detail' },
  ];

  constructor(
    private route: ActivatedRoute,
    private svc: CeoBranchesService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.branchId = this.route.snapshot.paramMap.get('branchId') || '';
    this.load();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  load(): void {
    this.loading = true;
    this.svc.detail(this.branchId, this.month).pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.loading = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (d) => {
        this.detail = d;
        this.breadcrumbs = [
          { label: 'Dashboard', route: '/ceo/dashboard' },
          { label: 'Branches', route: '/ceo/branches' },
          { label: d?.branchName || 'Detail' },
        ];
        this.cdr.detectChanges();
      },
      error: () => {
        this.detail = null;
        this.cdr.detectChanges();
      },
    });
  }

  severityColor(sev: string): string {
    switch (sev) {
      case 'CRITICAL': return 'bg-red-100 text-red-700';
      case 'HIGH': return 'bg-orange-100 text-orange-700';
      case 'MEDIUM': return 'bg-amber-100 text-amber-700';
      default: return 'bg-green-100 text-green-700';
    }
  }

  riskBadge(score: number): string {
    if (score >= 70) return 'bg-red-100 text-red-700';
    if (score >= 40) return 'bg-amber-100 text-amber-700';
    return 'bg-emerald-100 text-emerald-700';
  }

  riskLabel(score: number): string {
    if (score >= 70) return 'HIGH';
    if (score >= 40) return 'MEDIUM';
    return 'LOW';
  }
}
