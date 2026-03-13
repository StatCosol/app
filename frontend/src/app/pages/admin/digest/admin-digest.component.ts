import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, forkJoin } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';

import {
  AdminDigestApiService,
  AdminDigestHistoryItem,
} from '../../../core/admin-digest-api.service';
import { ToastService } from '../../../shared/toast/toast.service';
import {
  ActionButtonComponent,
  EmptyStateComponent,
  LoadingSpinnerComponent,
  PageHeaderComponent,
  StatusBadgeComponent,
} from '../../../shared/ui';

@Component({
  selector: 'app-admin-digest',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    PageHeaderComponent,
    LoadingSpinnerComponent,
    EmptyStateComponent,
    ActionButtonComponent,
    StatusBadgeComponent,
  ],
  templateUrl: './admin-digest.component.html',
  styleUrls: ['./admin-digest.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminDigestComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();

  loading = true;
  historyLoading = false;
  sendingWeekly = false;
  sendingCritical = false;
  error: string | null = null;

  historyLimit = 30;
  config: any = null;
  preview: any = null;
  history: AdminDigestHistoryItem[] = [];

  constructor(
    private readonly api: AdminDigestApiService,
    private readonly toast: ToastService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loadAll();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get recipientsCount(): number {
    return Number(this.preview?.recipientsCount || this.config?.recipients?.length || 0);
  }

  get weeklyPreview(): any {
    return this.preview?.weekly || {};
  }

  get criticalPreview(): any {
    return this.preview?.critical || {};
  }

  loadAll(): void {
    this.loading = true;
    this.error = null;
    forkJoin({
      config: this.api.getConfig(),
      preview: this.api.getPreview(),
      history: this.api.getHistory(this.historyLimit),
    })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: ({ config, preview, history }) => {
          this.config = config || null;
          this.preview = preview || null;
          this.history = history?.items || [];
        },
        error: (err) => {
          this.error = err?.error?.message || 'Failed to load digest center.';
          this.config = null;
          this.preview = null;
          this.history = [];
        },
      });
  }

  refreshHistory(): void {
    this.historyLoading = true;
    this.api
      .getHistory(this.historyLimit)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.historyLoading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (res) => {
          this.history = res?.items || [];
        },
        error: () => {
          this.toast.error('Failed to refresh digest history.');
        },
      });
  }

  runWeeklyDigest(): void {
    if (this.sendingWeekly) return;
    this.sendingWeekly = true;
    this.api
      .sendNow()
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.sendingWeekly = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (res) => {
          if (res?.status === 'skipped') {
            this.toast.info('Weekly digest skipped (no recipients or data).');
          } else {
            this.toast.success('Weekly digest triggered successfully.');
          }
          this.refreshAfterRun();
        },
        error: (err) => {
          this.toast.error(err?.error?.message || 'Failed to trigger weekly digest.');
        },
      });
  }

  runCriticalDigest(): void {
    if (this.sendingCritical) return;
    this.sendingCritical = true;
    this.api
      .sendCritical()
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.sendingCritical = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (res) => {
          if (res?.status === 'skipped') {
            this.toast.info('Critical digest skipped (no recipients or critical items).');
          } else {
            this.toast.success('Critical digest triggered successfully.');
          }
          this.refreshAfterRun();
        },
        error: (err) => {
          this.toast.error(err?.error?.message || 'Failed to trigger critical digest.');
        },
      });
  }

  statusTone(status: string): string {
    const key = String(status || '').toUpperCase();
    if (key === 'SUCCESS') return 'tone tone--ok';
    if (key === 'FAILED') return 'tone tone--bad';
    return 'tone tone--warn';
  }

  trackHistory(_: number, row: AdminDigestHistoryItem): number {
    return row.id;
  }

  private refreshAfterRun(): void {
    forkJoin({
      preview: this.api.getPreview(),
      history: this.api.getHistory(this.historyLimit),
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ preview, history }) => {
          this.preview = preview || this.preview;
          this.history = history?.items || this.history;
          this.cdr.markForCheck();
        },
      });
  }
}
