import {
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subject, Subscription, forkJoin } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';
import { DashboardService } from '../../core/dashboard.service';
import { AuthService } from '../../core/auth.service';
import {
  PfEsiSummaryResponse,
  ContractorUploadSummaryResponse,
} from '../client/dashboard/client-dashboard.types';

@Component({
  standalone: true,
  selector: 'app-branch-dashboard',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './branch-dashboard.component.html',
  styleUrls: ['../client/shared/client-theme.scss', './branch-dashboard.component.scss'],
})
export class BranchDashboardComponent implements OnInit, OnDestroy {
  loading = false;
  errorMsg = '';

  pfEsiSummary: PfEsiSummaryResponse | null = null;
  contractorSummary: ContractorUploadSummaryResponse | null = null;

  showPfModal = false;
  showEsiModal = false;

  filters = {
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
  };

  months = [
    { value: 1, label: 'Jan' },
    { value: 2, label: 'Feb' },
    { value: 3, label: 'Mar' },
    { value: 4, label: 'Apr' },
    { value: 5, label: 'May' },
    { value: 6, label: 'Jun' },
    { value: 7, label: 'Jul' },
    { value: 8, label: 'Aug' },
    { value: 9, label: 'Sep' },
    { value: 10, label: 'Oct' },
    { value: 11, label: 'Nov' },
    { value: 12, label: 'Dec' },
  ];

  years = (() => {
    const current = new Date().getFullYear();
    return [current - 1, current, current + 1];
  })();

  private loadSub?: Subscription;
  private readonly destroy$ = new Subject<void>();

  get pfSummary() {
    return this.pfEsiSummary?.pf ?? { registered: 0, notRegisteredApplicable: 0, pendingEmployees: [] };
  }

  get esiSummary() {
    return this.pfEsiSummary?.esi ?? { registered: 0, notRegisteredApplicable: 0, pendingEmployees: [] };
  }

  constructor(
    private dashboard: DashboardService,
    private auth: AuthService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.load();
  }

  ngOnDestroy(): void {
    this.loadSub?.unsubscribe();
    this.destroy$.next();
    this.destroy$.complete();
  }

  load(): void {
    this.loadSub?.unsubscribe();
    this.loading = true;
    this.errorMsg = '';

    const monthStr = `${this.filters.year}-${this.two(this.filters.month)}`;
    // Branch user: backend auto-scopes to user's branch(es) via resolveScope
    // No branchId param needed - backend forces user.branchIds

    this.loadSub = forkJoin({
      pfEsi: this.dashboard.getClientPfEsiSummary({ month: monthStr }),
      contractor: this.dashboard.getClientContractorUploadSummary({ month: monthStr }),
    })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (res) => {
          this.pfEsiSummary = res.pfEsi;
          this.contractorSummary = res.contractor;
          this.cdr.markForCheck();
        },
        error: () => {
          this.errorMsg = 'Failed to load branch dashboard data.';
          this.pfEsiSummary = null;
          this.contractorSummary = null;
          this.cdr.markForCheck();
        },
      });
  }

  togglePfModal(): void {
    this.showPfModal = !this.showPfModal;
    this.cdr.markForCheck();
  }

  toggleEsiModal(): void {
    this.showEsiModal = !this.showEsiModal;
    this.cdr.markForCheck();
  }

  two(n: number): string {
    return String(n).padStart(2, '0');
  }
}
