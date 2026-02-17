import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { AdminUsersApi } from '../../core/api/admin-users.api';
import { environment } from '../../../environments/environment';
import { HttpClient } from '@angular/common/http';
import { forkJoin, Observable, of } from 'rxjs';
import { timeout, catchError, finalize } from 'rxjs/operators';
import {
  PageHeaderComponent, ActionButtonComponent, StatCardComponent,
  LoadingSpinnerComponent, DataTableComponent, TableCellDirective,
  StatusBadgeComponent, TableColumn,
} from '../../shared/ui';

@Component({
  selector: 'app-admin-reports',
  standalone: true,
  imports: [
    CommonModule, FormsModule, PageHeaderComponent, ActionButtonComponent,
    StatCardComponent, LoadingSpinnerComponent, DataTableComponent,
    TableCellDirective, StatusBadgeComponent,
  ],
  templateUrl: './admin-reports.component.html',
  styleUrls: ['./admin-reports.component.scss'],
})
export class AdminReportsComponent implements OnInit {
  filters = {
    from: '',
    to: '',
  };

  loading = false;
  summary: any | null = null;

  roleColumns: TableColumn[] = [
    { key: 'key', header: 'Role' },
    { key: 'total', header: 'Total Users' },
    { key: 'active', header: 'Active' },
    { key: 'inactive', header: 'Inactive' },
  ];

  registrationColumns: TableColumn[] = [
    { key: 'userCode', header: 'User Code' },
    { key: 'name', header: 'Name' },
    { key: 'email', header: 'Email' },
    { key: 'role', header: 'Role' },
    { key: 'createdAt', header: 'Created Date' },
    { key: 'status', header: 'Status' },
  ];

  deletionColumns: TableColumn[] = [
    { key: 'userCode', header: 'User Code' },
    { key: 'name', header: 'Name' },
    { key: 'email', header: 'Email' },
    { key: 'role', header: 'Role' },
    { key: 'deletedAt', header: 'Deleted Date' },
    { key: 'deletedBy', header: 'Deleted By' },
  ];

  assignmentColumns: TableColumn[] = [
    { key: 'clientName', header: 'Client' },
    { key: 'branchName', header: 'Branch' },
    { key: 'assignedTo', header: 'Assigned To' },
    { key: 'createdAt', header: 'Created Date' },
    { key: 'status', header: 'Status' },
  ];
  overdue: any[] = [];
  deletions: any[] = [];
  assignments: any[] = [];
  error: string | null = null;
  
  constructor(
    private api: AdminUsersApi,
    private http: HttpClient,
    private cdr: ChangeDetectorRef,
    private route: ActivatedRoute,
  ) {}

  ngOnInit(): void {
    this.applyRouteFilters();
    this.load();
  }

  private applyRouteFilters(): void {
    const qp = this.route.snapshot.queryParamMap;
    const from = qp.get('from');
    const to = qp.get('to');
    if (from) this.filters.from = from;
    if (to) this.filters.to = to;
  }

  apply(): void {
    this.load();
  }

  reset(): void {
    this.filters = {
      from: '',
      to: '',
    };
    this.load();
  }

  get summaryEntries(): { key: string; total: number; active: number; inactive: number }[] {
    const src = (this.summary && this.summary.byRole) || {};
    return Object.keys(src).map((k) => ({
      key: k,
      total: (src as any)[k].total || 0,
      active: (src as any)[k].active || 0,
      inactive: (src as any)[k].inactive || 0,
    }));
  }



  downloadUsersReport(): void {
    const url = `${environment.apiBaseUrl}/api/admin/users/export`;
    this.downloadBlob(url, 'users-export.xlsx');
  }

  downloadUserActivityReport(): void {
    const params = new URLSearchParams();
    params.set('download', 'true');
    if (this.filters.from) params.set('from', this.filters.from);
    if (this.filters.to) params.set('to', this.filters.to);

    const url = `${environment.apiBaseUrl}/api/admin/reports/user-activity?${params.toString()}`;
    this.downloadBlob(url, 'user-activity.xlsx');
  }

  downloadSystemAccessLog(): void {
    const params = new URLSearchParams();
    params.set('download', 'true');
    if (this.filters.from) params.set('from', this.filters.from);
    if (this.filters.to) params.set('to', this.filters.to);

    const url = `${environment.apiBaseUrl}/api/admin/reports/access-logs?${params.toString()}`;
    this.downloadBlob(url, 'access-logs.xlsx');
  }

  downloadUserRegistrationsReport(): void {
    const params = new URLSearchParams();
    params.set('download', 'true');
    if (this.filters.from) params.set('from', this.filters.from);
    if (this.filters.to) params.set('to', this.filters.to);

    const url = `${environment.apiBaseUrl}/api/admin/reports/user-registrations?${params.toString()}`;
    this.downloadBlob(url, 'user-registrations.xlsx');
  }

  downloadDeletionReport(): void {
    const params = new URLSearchParams();
    params.set('download', 'true');
    if (this.filters.from) params.set('from', this.filters.from);
    if (this.filters.to) params.set('to', this.filters.to);

    const url = `${environment.apiBaseUrl}/api/admin/reports/user-deletions?${params.toString()}`;
    this.downloadBlob(url, 'user-deletions.xlsx');
  }

  downloadAssignmentReport(): void {
    const params = new URLSearchParams();
    params.set('download', 'true');
    if (this.filters.from) params.set('from', this.filters.from);
    if (this.filters.to) params.set('to', this.filters.to);

    const url = `${environment.apiBaseUrl}/api/admin/reports/assignments?${params.toString()}`;
    this.downloadBlob(url, 'assignments.xlsx');
  }

  private downloadBlob(url: string, fileName: string): void {
    this.http.get(url, { responseType: 'blob' }).subscribe({
      next: (blob) => {
        const link = document.createElement('a');
        const blobUrl = URL.createObjectURL(blob);
        link.href = blobUrl;
        link.download = fileName;
        link.click();
        setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      },
      error: (err) => {
        console.error('Export failed:', err);
        this.error = 'Export failed. Please try again.';
      },
    });
  }

  private load(): void {
    this.loading = true;
    this.error = null;

    // Build params for date filtering
    const params: any = {};
    if (this.filters.from) params.from = this.filters.from;
    if (this.filters.to) params.to = this.filters.to;

    const guard = <T>(obs: Observable<T>, fallback: T): Observable<T> =>
      obs.pipe(timeout(10000), catchError(() => of(fallback)));

    // Load all data in parallel
    forkJoin({
      users: guard(this.api.listUsersSimple(), []),
      deletions: guard(this.http.get<any[]>(`${environment.apiBaseUrl}/api/admin/reports/user-deletions`, { params }), []),
      assignments: guard(this.http.get<any[]>(`${environment.apiBaseUrl}/api/admin/reports/assignments`, { params }), []),
    }).pipe(
      finalize(() => { this.loading = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (result) => {
        const users = result.users;
        
        // Process user data to create summary statistics
        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        const totalUsers = users.length;
        const activeUsers = users.filter(u => u.isActive).length;
        const inactiveUsers = totalUsers - activeUsers;

        // Count new users in last 30 days
        const newUsers = users.filter(u => {
          const created = new Date(u['createdAt']);
          return created >= thirtyDaysAgo;
        });

        // Group users by role
        const byRole: any = {};
        users.forEach(u => {
          const role = u.roleCode || u['role'] || 'Unknown';
          if (!byRole[role]) {
            byRole[role] = { total: 0, active: 0, inactive: 0 };
          }
          byRole[role].total++;
          if (u.isActive) {
            byRole[role].active++;
          } else {
            byRole[role].inactive++;
          }
        });

        this.summary = {
          totalUsers,
          activeUsers,
          inactiveUsers,
          newUsersThisMonth: newUsers.length,
          deletedThisMonth: result.deletions.length,
          assignmentsThisMonth: result.assignments.length,
          byRole,
        };

        // Set recent registrations (last 30 days)
        this.overdue = newUsers.map(u => ({
          id: u.id,
          userCode: u['userCode'],
          name: u.name,
          email: u.email,
          role: u.roleCode || u['role'],
          roleName: u.roleCode || u['role'],
          createdAt: new Date(u['createdAt']).toLocaleDateString(),
          isActive: u.isActive,
        })).slice(0, 10);

        // Set deletions from backend
        this.deletions = result.deletions.map((d: any) => ({
          id: d.id,
          userCode: d.userCode,
          name: d.name,
          email: d.email,
          role: d.roleCode,
          roleName: d.roleCode,
          deletedAt: new Date(d.deletedAt).toLocaleDateString(),
          deletedBy: d.deletedBy || 'Admin',
        }));

        // Set assignments from backend
        this.assignments = result.assignments.map((a: any) => ({
          id: a.id,
          clientName: a.clientName,
          branchName: a.branchName,
          contractorName: a.contractorName,
          assignedTo: a.contractorName,
          createdAt: new Date(a.createdAt).toLocaleDateString(),
          status: a.status,
        }));
      },
      error: (err) => {
        console.error('Failed to load report data:', err);
        this.error = 'Unable to load reports. Please try again.';
        this.summary = null;
        this.overdue = [];
        this.deletions = [];
        this.assignments = [];
      },
    });
  }
}
