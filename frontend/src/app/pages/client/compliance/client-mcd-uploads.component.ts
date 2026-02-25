import { Component, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { finalize, takeUntil, timeout } from 'rxjs/operators';
import { ClientComplianceService } from '../../../core/client-compliance.service';
import { AuthService } from '../../../core/auth.service';
import { PageHeaderComponent, EmptyStateComponent, LoadingSpinnerComponent, StatusBadgeComponent } from '../../../shared/ui';

@Component({
  standalone: true,
  selector: 'app-client-mcd-uploads',
  imports: [CommonModule, FormsModule, PageHeaderComponent, EmptyStateComponent, LoadingSpinnerComponent, StatusBadgeComponent],
  templateUrl: './client-mcd-uploads.component.html',
  styleUrls: ['../shared/client-theme.scss', './client-mcd-uploads.component.scss'],
})
export class ClientMcdUploadsComponent implements OnDestroy {
  private destroy$ = new Subject<void>();
  loading = true;
  branches: any[] = [];
  tasks: any[] = [];
  filters: any = { branchId: '', month: '', year: '' };
  uploading: Record<string | number, boolean> = {};
  isMasterUser = false;
  singleBranch = false; // true if branch user with exactly 1 branch

  monthOptions = Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: new Date(2000, i, 1).toLocaleString('en', { month: 'long' }) }));
  yearOptions: number[];

  constructor(private api: ClientComplianceService, private cdr: ChangeDetectorRef, private auth: AuthService) {
    this.isMasterUser = this.auth.isMasterUser();
    const now = new Date();
    this.filters.month = now.getMonth() + 1;
    this.filters.year = now.getFullYear();
    const y = now.getFullYear();
    this.yearOptions = [y - 1, y, y + 1];
  }

  ngOnInit() {
    this.loadBranches();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadBranches() {
    this.api.getBranches().pipe(takeUntil(this.destroy$)).subscribe({
      next: (res: any) => {
        this.branches = res?.data || res || [];
        // Auto-select for branch users with a single branch
        const userBranchIds = this.auth.getBranchIds();
        if (userBranchIds.length === 1) {
          this.filters.branchId = userBranchIds[0];
          this.singleBranch = true;
        } else if (!this.filters.branchId && this.branches.length) {
          this.filters.branchId = this.branches[0].id;
        }
        this.cdr.detectChanges();
        this.loadTasks();
      },
      error: () => {
        this.branches = [];
        this.cdr.detectChanges();
        this.loadTasks();
      }
    });
  }

  loadTasks() {
    this.loading = true;
    const payload = { ...this.filters, frequency: 'MONTHLY' };
    this.api.getTasks(payload).pipe(
      takeUntil(this.destroy$),
      timeout(10000),
      finalize(() => { this.loading = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (res: any) => {
        this.loading = false;
        this.tasks = (res?.data || res || []).map((t: any) => ({
          ...t,
          complianceTitle: t.complianceTitle || t.title || t.compliance?.title,
          branchName: t.branchName || t.branch?.branchName || '-',
          dueDate: t.dueDate || this.computeDueDateString(t),
          window: this.windowDates(t),
          canUpload: this.isWindowOpen(t),
        }));
        this.cdr.detectChanges();
      },
      error: () => { this.loading = false; this.tasks = []; this.cdr.detectChanges(); }
    });
  }

  onFileSelected(task: any, event: Event) {
    const input = event.target as HTMLInputElement;
    const file: File | null = input?.files?.[0] || null;
    if (!file) return;
    this.uploading[task.id] = true;
    this.api.uploadEvidence(task.id, file).pipe(
      takeUntil(this.destroy$),
      finalize(() => {
        this.uploading[task.id] = false;
        this.cdr.detectChanges();
        if (input) input.value = '';
      }),
    ).subscribe({
      next: () => { this.uploading[task.id] = false; this.loadTasks(); },
      error: () => { this.uploading[task.id] = false; },
    });
  }

  periodLabel(t: any) {
    const monthIndex = (t.periodMonth || t.month || this.filters.month) - 1;
    const monthName = this.monthOptions[monthIndex]?.label || '';
    return `${monthName} ${t.periodYear || this.filters.year}`;
  }

  windowStatusText(t: any): string {
    const win = this.windowDates(t);
    if (!win) return '';
    const now = new Date();
    const start = new Date(`${win.start}T00:00:00Z`);
    const end = new Date(`${win.end}T23:59:59Z`);
    if (now < start) return `Opens ${win.start}`;
    if (now > end) return `Closed ${win.end}`;
    return `Open until ${win.end}`;
  }

  private computeDueDateString(t: any): string | null {
    const year = Number(t.periodYear || this.filters.year);
    const month = Number(t.periodMonth || this.filters.month);
    if (!year || !month) return null;
    // Rule: due on 20th of the following month
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    const d = new Date(Date.UTC(nextYear, nextMonth - 1, 20));
    return d.toISOString().substring(0, 10);
  }

  private windowDates(t: any): { start: string; end: string } | null {
    const year = Number(t.periodYear || this.filters.year);
    const month = Number(t.periodMonth || this.filters.month);
    if (!year || !month) return null;
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    const start = new Date(Date.UTC(nextYear, nextMonth - 1, 20));
    const end = new Date(Date.UTC(nextYear, nextMonth - 1, 25));
    const fmt = (d: Date) => d.toISOString().substring(0, 10);
    return { start: fmt(start), end: fmt(end) };
  }

  private isWindowOpen(t: any): boolean {
    const win = this.windowDates(t);
    if (!win) return true;
    const now = new Date();
    const start = new Date(`${win.start}T00:00:00Z`);
    const end = new Date(`${win.end}T23:59:59Z`);
    return now >= start && now <= end;
  }
}
