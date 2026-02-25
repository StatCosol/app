import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { timeout, finalize, takeUntil } from 'rxjs/operators';
import { Subject } from 'rxjs';
import { DashboardService } from '../../core/dashboard.service';
import {
  PageHeaderComponent,
  DataTableComponent,
  TableCellDirective,
  TableColumn,
  StatusBadgeComponent,
  EmptyStateComponent,
} from '../../shared/ui';

interface UpcomingTask {
  id: string | number;
  complianceName: string;
  branchName: string;
  dueDate: string;
  daysUntilDue: number;
  dueLabel: string;
}

@Component({
  selector: 'app-contractor-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    PageHeaderComponent,
    DataTableComponent,
    TableCellDirective,
    StatusBadgeComponent,
    EmptyStateComponent,
  ],
  templateUrl: './contractor-dashboard.component.html',
  styleUrls: ['./shared/contractor-theme.scss', './contractor-dashboard.component.scss'],
})
export class ContractorDashboardComponent implements OnInit, OnDestroy {
  data: any = null;
  loading = false;
  errorMsg: string | null = null;
  private destroy$ = new Subject<void>();

  upcomingTasks: UpcomingTask[] = [];

  // Compliance progress ring
  readonly circumference = 2 * Math.PI * 52; // r=52
  compliancePct = 0;

  get strokeOffset(): number {
    return this.circumference - (this.compliancePct / 100) * this.circumference;
  }

  overdueColumns: TableColumn[] = [
    { key: 'complianceName', header: 'Compliance', sortable: true },
    { key: 'branchName', header: 'Branch' },
    { key: 'dueDate', header: 'Due Date', width: '150px' },
    { key: 'status', header: 'Status', width: '120px' },
  ];

  constructor(
    private dash: DashboardService,
    private router: Router,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loading = true;
    this.errorMsg = null;
    this.dash
      .contractor()
      .pipe(
        takeUntil(this.destroy$),
        timeout(10000),
        finalize(() => {
          this.loading = false;
          this.cdr.detectChanges();
        }),
      )
      .subscribe({
        next: (d) => {
          this.loading = false;
          this.data = d || null;
          this.buildUpcomingTasks();
          this.computeCompliancePct();
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.loading = false;
          this.errorMsg = err?.error?.message || 'Failed to load dashboard';
          this.cdr.detectChanges();
        },
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  retry(): void {
    this.ngOnInit();
  }

  get overdueTableData(): any[] {
    if (!this.data?.overdue) return [];
    return this.data.overdue.map((t: any) => ({
      id: t.id,
      complianceName: t.compliance?.complianceName || t.complianceName || '-',
      branchName: t.branch?.branchName || t.branchName || '-',
      dueDate: t.dueDate,
      status: t.status || 'OVERDUE',
    }));
  }

  goToTasks(filter: string): void {
    if (filter) {
      this.router.navigate(['/contractor/tasks'], { queryParams: { status: filter } });
    } else {
      this.router.navigate(['/contractor/tasks']);
    }
  }

  openTask(t: any): void {
    this.router.navigate(['/contractor/tasks', t.id]);
  }

  private buildUpcomingTasks(): void {
    if (!this.data) {
      this.upcomingTasks = [];
      return;
    }
    // Combine all tasks, sort by due date, take first 5 non-approved
    const allTasks = [
      ...(this.data.overdue || []),
      ...(this.data.upcoming || []),
      ...(this.data.tasks || []),
    ];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const mapped = allTasks
      .filter((t: any) => t.status !== 'APPROVED' && t.status !== 'SUBMITTED')
      .map((t: any) => {
        const due = new Date(t.dueDate);
        const diff = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        return {
          id: t.id,
          complianceName: t.compliance?.complianceName || t.complianceName || 'Task',
          branchName: t.branch?.branchName || t.branchName || '-',
          dueDate: t.dueDate,
          daysUntilDue: diff,
          dueLabel:
            diff < 0
              ? `${Math.abs(diff)}d overdue`
              : diff === 0
                ? 'Due today'
                : `${diff}d left`,
        };
      })
      .sort((a: UpcomingTask, b: UpcomingTask) => a.daysUntilDue - b.daysUntilDue);

    // Deduplicate by id
    const seen = new Set<string>();
    this.upcomingTasks = mapped.filter((t: UpcomingTask) => {
      const key = String(t.id);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 5);
  }

  private computeCompliancePct(): void {
    if (!this.data) {
      this.compliancePct = 0;
      return;
    }
    // Try to get from data, otherwise compute from counts
    if (this.data.compliancePct !== undefined) {
      this.compliancePct = Math.round(this.data.compliancePct);
    } else if (this.data.totalTasks > 0) {
      const approved = this.data.approvedCount || 0;
      this.compliancePct = Math.round((approved / this.data.totalTasks) * 100);
    } else {
      this.compliancePct = 0;
    }
  }
}
