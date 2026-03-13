import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { Subject, forkJoin, of } from 'rxjs';
import { catchError, finalize, takeUntil } from 'rxjs/operators';

import { AdminUsersApi } from '../../../core/api/admin-users.api';
import { AdminAssignmentsService } from '../assignments/admin-assignments.service';
import {
  AdminDashboardSummaryDto,
  AssignmentSummaryDto,
  RiskAlertsDto,
  UnassignedClientDto,
} from '../dashboard/admin-dashboard.dto';
import { AdminDashboardService } from '../dashboard/admin-dashboard.service';
import { EmptyStateComponent, LoadingSpinnerComponent, PageHeaderComponent } from '../../../shared/ui';

interface DuplicateMappingRow {
  clientId: string;
  clientName: string;
  activeRows: number;
  crmIds: string[];
  auditorIds: string[];
}

interface StaleUserRow {
  id: string;
  name: string;
  email: string;
  roleCode: string;
  status: string;
}

type GovernanceSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

interface GovernanceGuardrail {
  key: string;
  label: string;
  count: number;
  severity: GovernanceSeverity;
  detail: string;
  route: string;
}

@Component({
  selector: 'app-admin-governance-control',
  standalone: true,
  imports: [CommonModule, RouterModule, PageHeaderComponent, LoadingSpinnerComponent, EmptyStateComponent],
  templateUrl: './admin-governance-control.component.html',
  styleUrls: ['./admin-governance-control.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminGovernanceControlComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();

  loading = true;
  error: string | null = null;

  assignmentSummary: AssignmentSummaryDto = {
    totalClients: 0,
    crmAssigned: 0,
    crmUnassigned: 0,
    auditorAssigned: 0,
    auditorUnassigned: 0,
  };
  riskAlerts: RiskAlertsDto = {
    auditOverdue: 0,
    noCrm: 0,
    noPayroll: 0,
    zeroBranches: 0,
    noMcdUploads: 0,
  };
  dashboardSummary: AdminDashboardSummaryDto | null = null;

  unassignedClients: UnassignedClientDto[] = [];
  duplicateMappings: DuplicateMappingRow[] = [];
  staleUsers: StaleUserRow[] = [];
  rotationDue: AdminDashboardSummaryDto['assignmentsAttention'] = [];

  constructor(
    private readonly dashboard: AdminDashboardService,
    private readonly assignments: AdminAssignmentsService,
    private readonly usersApi: AdminUsersApi,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loadGovernance();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get unassignedTotal(): number {
    return this.assignmentSummary.crmUnassigned + this.assignmentSummary.auditorUnassigned;
  }

  get staleUsersCount(): number {
    return this.dashboardSummary?.systemHealth?.inactiveUsers15d || this.staleUsers.length;
  }

  get highRiskSignalCount(): number {
    return this.riskAlerts.auditOverdue + this.riskAlerts.noCrm + this.riskAlerts.noPayroll;
  }

  get governanceGuardrails(): GovernanceGuardrail[] {
    const guardrails: GovernanceGuardrail[] = [
      {
        key: 'unassigned',
        label: 'Assignment Gaps',
        count: this.unassignedTotal,
        severity: this.unassignedTotal > 20 ? 'CRITICAL' : this.unassignedTotal > 5 ? 'HIGH' : this.unassignedTotal > 0 ? 'MEDIUM' : 'LOW',
        detail: this.unassignedTotal ? `${this.unassignedTotal} CRM/Auditor gaps require owner mapping` : 'All mapped',
        route: '/admin/assignments',
      },
      {
        key: 'duplicates',
        label: 'Duplicate Mappings',
        count: this.duplicateMappings.length,
        severity: this.duplicateMappings.length > 5 ? 'HIGH' : this.duplicateMappings.length > 0 ? 'MEDIUM' : 'LOW',
        detail: this.duplicateMappings.length ? 'Multiple active rows found for same client' : 'No duplicate active rows',
        route: '/admin/assignments',
      },
      {
        key: 'stale-users',
        label: 'Stale Accounts',
        count: this.staleUsersCount,
        severity: this.staleUsersCount > 20 ? 'HIGH' : this.staleUsersCount > 0 ? 'MEDIUM' : 'LOW',
        detail: this.staleUsersCount ? 'Inactive users pending governance review' : 'No stale users in current window',
        route: '/admin/users',
      },
      {
        key: 'rotation',
        label: 'Rotation Overdue',
        count: this.rotationDue.length,
        severity: this.rotationDue.length > 10 ? 'HIGH' : this.rotationDue.length > 0 ? 'MEDIUM' : 'LOW',
        detail: this.rotationDue.length ? 'Assignment rotation policy breaches detected' : 'No overdue rotations',
        route: '/admin/assignments',
      },
      {
        key: 'risk-signals',
        label: 'High Risk Signals',
        count: this.highRiskSignalCount,
        severity: this.highRiskSignalCount > 10 ? 'CRITICAL' : this.highRiskSignalCount > 0 ? 'HIGH' : 'LOW',
        detail: this.highRiskSignalCount ? 'Audit/no-CRM/no-payroll exceptions require escalation' : 'No major risk signals',
        route: '/admin/dashboard',
      },
    ];

    return guardrails.sort((a, b) => this.severityWeight(b.severity) - this.severityWeight(a.severity));
  }

  get criticalGuardrailsCount(): number {
    return this.governanceGuardrails.filter((row) => row.severity === 'CRITICAL').length;
  }

  get highGuardrailsCount(): number {
    return this.governanceGuardrails.filter((row) => row.severity === 'HIGH').length;
  }

  severityClass(severity: GovernanceSeverity): string {
    if (severity === 'CRITICAL') return 'sev sev--critical';
    if (severity === 'HIGH') return 'sev sev--high';
    if (severity === 'MEDIUM') return 'sev sev--medium';
    return 'sev sev--low';
  }

  loadGovernance(): void {
    this.loading = true;
    this.error = null;

    forkJoin({
      assignmentSummary: this.dashboard
        .getAssignmentSummary()
        .pipe(catchError(() => of(this.assignmentSummary))),
      unassignedClients: this.dashboard
        .getUnassignedClients()
        .pipe(catchError(() => of([] as UnassignedClientDto[]))),
      riskAlerts: this.dashboard.getRiskAlerts().pipe(catchError(() => of(this.riskAlerts))),
      summary: this.dashboard.getSummary().pipe(catchError(() => of(null))),
      assignments: this.assignments.getAssignments().pipe(catchError(() => of([] as any[]))),
      users: this.usersApi
        .listUsers({ status: 'INACTIVE', limit: 50, page: 1 })
        .pipe(catchError(() => of({ items: [] }))),
    })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: ({ assignmentSummary, unassignedClients, riskAlerts, summary, assignments, users }) => {
          this.assignmentSummary = assignmentSummary || this.assignmentSummary;
          this.unassignedClients = Array.isArray(unassignedClients) ? unassignedClients : [];
          this.riskAlerts = riskAlerts || this.riskAlerts;
          this.dashboardSummary = summary;
          this.rotationDue = (summary?.assignmentsAttention || []).filter(
            (row) => row.status === 'OVERDUE_ROTATION',
          );

          this.duplicateMappings = this.computeDuplicateMappings(
            Array.isArray(assignments) ? assignments : [],
            this.unassignedClients,
          );
          this.staleUsers = this.normalizeStaleUsers(users);
        },
        error: (err: any) => {
          this.error = err?.error?.message || 'Failed to load governance control center.';
          this.unassignedClients = [];
          this.duplicateMappings = [];
          this.staleUsers = [];
          this.rotationDue = [];
        },
      });
  }

  private computeDuplicateMappings(rows: any[], unassignedRows: UnassignedClientDto[]): DuplicateMappingRow[] {
    const byClient = new Map<string, any[]>();
    const clientNameMap = new Map<string, string>();
    for (const row of unassignedRows) {
      clientNameMap.set(String(row.clientId || ''), String(row.clientName || 'Unknown Client'));
    }

    for (const row of rows || []) {
      const status = String(row?.status || '').toUpperCase();
      if (status && status !== 'ACTIVE') continue;

      const clientId = String(row?.clientId || row?.client_id || '');
      if (!clientId) continue;

      const arr = byClient.get(clientId) || [];
      arr.push(row);
      byClient.set(clientId, arr);

      if (!clientNameMap.has(clientId)) {
        const fallbackName = String(row?.clientName || row?.client_name || 'Unknown Client');
        clientNameMap.set(clientId, fallbackName);
      }
    }

    const result: DuplicateMappingRow[] = [];
    for (const [clientId, group] of byClient.entries()) {
      if (group.length <= 1) continue;
      const crmIds = Array.from(
        new Set(
          group
            .map((r) => String(r?.crmId || r?.crm || r?.crm_id || ''))
            .filter((id) => !!id),
        ),
      );
      const auditorIds = Array.from(
        new Set(
          group
            .map((r) => String(r?.auditorId || r?.auditor || r?.auditor_id || ''))
            .filter((id) => !!id),
        ),
      );
      result.push({
        clientId,
        clientName: clientNameMap.get(clientId) || 'Unknown Client',
        activeRows: group.length,
        crmIds,
        auditorIds,
      });
    }

    return result.sort((a, b) => b.activeRows - a.activeRows);
  }

  private normalizeStaleUsers(payload: any): StaleUserRow[] {
    const rows = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.items)
        ? payload.items
        : Array.isArray(payload?.data)
          ? payload.data
          : [];

    return rows
      .map((u: any) => ({
        id: String(u?.id || ''),
        name: String(u?.name || 'Unknown User'),
        email: String(u?.email || '-'),
        roleCode: String(u?.roleCode || u?.role || '-'),
        status: String(u?.status || (u?.isActive === false ? 'INACTIVE' : 'UNKNOWN')),
      }))
      .filter((u: StaleUserRow) => !!u.id)
      .slice(0, 20);
  }

  private severityWeight(severity: GovernanceSeverity): number {
    if (severity === 'CRITICAL') return 4;
    if (severity === 'HIGH') return 3;
    if (severity === 'MEDIUM') return 2;
    return 1;
  }
}
