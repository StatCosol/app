import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { forkJoin } from 'rxjs';
import { finalize, timeout } from 'rxjs/operators';

import { AdminDashboardService } from './dashboard/admin-dashboard.service';
import {
  AdminStatsDto,
  AdminDashboardSummaryDto,
  TaskStatusDto,
  LoadRowDto,
  AttentionItemDto
} from './dashboard/admin-dashboard.dto';
import { ToastService } from '../../shared/toast/toast.service';
import { StatCardComponent } from '../../shared/ui/stat-card/stat-card.component';

type Range = '7d' | '30d' | '90d';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, StatCardComponent],
  templateUrl: './admin-dashboard.component.html',
  styleUrls: ['./admin-dashboard.component.scss'],
})
export class AdminDashboardComponent implements OnInit {
  dateRange: Range = '30d';

  clientId: string | null = null;
  stateCode: string | null = null;
  from: string | null = null;
  to: string | null = null;

  clients: Array<{ id: string; name: string }> = [];
  states: string[] = ['AP', 'DL', 'GJ', 'KA', 'MH', 'RJ', 'TN', 'TS'];

  loading = false;
  errorMsg = '';
  sendingDigest = false;
  sendingAlerts = false;

  summary: AdminDashboardSummaryDto | null = null;
  stats: AdminStatsDto | null = null;
  taskStatus: TaskStatusDto | null = null;
  slaTrend: number[] = [];

  crmLoad: LoadRowDto[] = [];
  auditorLoad: LoadRowDto[] = [];
  attention: AttentionItemDto[] = [];

  constructor(
    private router: Router,
    private dash: AdminDashboardService,
    private cdr: ChangeDetectorRef,
    private toast: ToastService,
  ) {}

  ngOnInit(): void {
    this.loadClients();
    this.loadAll();
  }

  setRange(r: Range) {
    this.dateRange = r;
    this.loadAll();
  }

  loadAll(): void {
    this.loading = true;
    this.errorMsg = '';

    const summaryParams = this.buildSummaryParams();

    forkJoin({
      summary: this.dash.getSummary(summaryParams).pipe(timeout(8000)),
      stats: this.dash.getStats(this.dateRange).pipe(timeout(8000)),
      taskStatus: this.dash.getTaskStatus(this.dateRange).pipe(timeout(8000)),
      trend: this.dash.getSlaTrend(this.dateRange).pipe(timeout(8000)),
      crmLoad: this.dash.getCrmLoad().pipe(timeout(8000)),
      auditorLoad: this.dash.getAuditorLoad().pipe(timeout(8000)),
      attention: this.dash.getAttention(this.dateRange).pipe(timeout(8000)),
    })
    .pipe(finalize(() => {
      this.loading = false;
      this.cdr.markForCheck();
    }))
    .subscribe({
      next: (res: {
        summary: AdminDashboardSummaryDto;
        stats: AdminStatsDto;
        taskStatus: TaskStatusDto;
        trend: { values: number[] };
        crmLoad: LoadRowDto[];
        auditorLoad: LoadRowDto[];
        attention: AttentionItemDto[];
      }) => {
        // Provide sane defaults to avoid template crashes when backend omits fields
        this.summary = res.summary
          ? {
              ...res.summary,
              slaHealth: res.summary.slaHealth ?? { status: 'GREEN', scorePct: 0 },
              escalations: res.summary.escalations ?? [],
              assignmentsAttention: res.summary.assignmentsAttention ?? [],
              systemHealth: res.summary.systemHealth ?? {
                inactiveUsers15d: 0,
                unassignedClients: 0,
                failedNotifications7d: 0,
                failedJobs24h: 0,
              },
            }
          : null;
        this.stats = res.stats ?? null;
        this.taskStatus = res.taskStatus ?? null;
        this.slaTrend = res.trend?.values ?? [];
        this.crmLoad = res.crmLoad ?? [];
        this.auditorLoad = res.auditorLoad ?? [];
        this.attention = res.attention ?? [];
        this.cdr.markForCheck();
      },
      error: () => {
        this.errorMsg = 'Failed to load live dashboard data.';
        this.summary = null;
        this.stats = null;
        this.taskStatus = null;
        this.slaTrend = [];
        this.crmLoad = [];
        this.auditorLoad = [];
        this.attention = [];
        this.cdr.markForCheck();
      }
    });
  }

  // ---------- Derived helpers ----------
  get completionPct(): number {
    if (!this.taskStatus) return 0;
    const total = this.taskStatus.completed + this.taskStatus.pending + this.taskStatus.overdue;
    return total ? Math.round((this.taskStatus.completed / total) * 100) : 0;
  }

  donutDash(value: number): string {
    const c = 251.2; // circumference for r=40
    const dash = ((value || 0) / 100) * c;
    return `${dash} ${c - dash}`;
  }

  loadScore(row: LoadRowDto): number {
    if (!row) return 0;
    const score = row.openItems * 10 + row.overdue * 25 + row.slaBreaches * 30 + row.clientsAssigned * 8;
    return Math.min(100, score);
  }

  applyFilters(): void {
    this.loadAll();
  }

  resetFilters(): void {
    this.clientId = null;
    this.stateCode = null;
    this.from = null;
    this.to = null;
    this.loadAll();
  }

  sendDigestNow(): void {
    if (this.sendingDigest) return;
    this.sendingDigest = true;
    this.dash.sendDigestNow().subscribe({
      next: () => { this.sendingDigest = false; this.toast.success('Digest sent successfully'); },
      error: () => { this.sendingDigest = false; this.toast.error('Failed to send digest'); },
    });
  }

  sendCriticalAlertsNow(): void {
    if (this.sendingAlerts) return;
    this.sendingAlerts = true;
    this.dash.sendCriticalAlertsNow().subscribe({
      next: () => { this.sendingAlerts = false; this.toast.success('Critical alerts sent'); },
      error: () => { this.sendingAlerts = false; this.toast.error('Failed to send critical alerts'); },
    });
  }

  private buildSummaryParams(): Record<string, string> {
    const params: Record<string, string> = {};
    if (this.clientId) params['clientId'] = this.clientId;
    if (this.stateCode) params['stateCode'] = this.stateCode;
    if (this.from) params['from'] = this.from;
    if (this.to) params['to'] = this.to;
    return params;
  }

  private loadClients(): void {
    this.dash.getClientsMinimal().subscribe({
      next: (rows) => {
        this.clients = rows ?? [];
        this.cdr.markForCheck();
      },
      error: () => {
        this.clients = [];
        this.cdr.markForCheck();
      }
    });
  }

  toneForLoad(score: number): 'good' | 'warn' | 'bad' {
    if (score >= 75) return 'bad';
    if (score >= 45) return 'warn';
    return 'good';
  }

  openCoverage(row: { client_id: string; branch_id: string }): void {
    if (!row?.client_id) return;
    this.router.navigate(['/admin/clients', row.client_id, 'compliances'], {
      queryParams: { branchId: row.branch_id },
    });
  }

  openAudit(row: { audit_id: string; client_id: string; branch_id: string }): void {
    // Route admin to reports page; pass context via query params for future filtering.
    this.router.navigate(['/admin/reports'], {
      queryParams: {
        clientId: row.client_id,
        branchId: row.branch_id,
        auditId: row.audit_id,
        focus: 'audit',
      },
    });
  }

  openAssignment(row: { clientId: string; id: string }): void {
    this.router.navigate(['/admin/assignments'], {
      queryParams: { clientId: row.clientId, assignmentId: row.id },
    });
  }

  severityClass(s: AttentionItemDto['severity']): string {
    return s === 'High' ? 'sev-high' : s === 'Medium' ? 'sev-med' : 'sev-low';
  }

  // ---------- Navigation ----------
  go(route?: string) {
    if (!route) return;
    this.router.navigateByUrl(route);
  }

  openTask(item: AttentionItemDto) {
    this.router.navigate(['/admin/assignments'], { queryParams: { taskId: item.taskId } });
  }
}
