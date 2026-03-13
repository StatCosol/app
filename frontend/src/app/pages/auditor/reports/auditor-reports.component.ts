import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, forkJoin, of } from 'rxjs';
import { takeUntil, finalize, catchError } from 'rxjs/operators';
import {
  PageHeaderComponent, DataTableComponent, TableCellDirective, TableColumn,
  StatusBadgeComponent, ActionButtonComponent, EmptyStateComponent,
  LoadingSpinnerComponent, FormSelectComponent, SelectOption,
} from '../../../shared/ui';
import { DashboardService } from '../../../core/dashboard.service';
import { AuditorObservationsService } from '../../../core/auditor-observations.service';
import { environment } from '../../../../environments/environment';
import { HttpClient } from '@angular/common/http';
import { AuditorReportPending } from '../auditor-dashboard.dto';

@Component({
  selector: 'app-auditor-reports',
  standalone: true,
  imports: [
    CommonModule, RouterModule, FormsModule, PageHeaderComponent, DataTableComponent,
    TableCellDirective, StatusBadgeComponent, ActionButtonComponent,
    EmptyStateComponent, LoadingSpinnerComponent, FormSelectComponent,
  ],
  templateUrl: './auditor-reports.component.html',
})
export class AuditorReportsComponent implements OnInit, OnDestroy {
  loading = true;
  reports: AuditorReportPending[] = [];
  filteredReports: AuditorReportPending[] = [];
  statusFilter = '';
  searchTerm = '';
  private destroy$ = new Subject<void>();

  columns: TableColumn[] = [
    { key: 'auditName', header: 'Audit', sortable: true },
    { key: 'clientName', header: 'Client', sortable: true },
    { key: 'branchName', header: 'Branch' },
    { key: 'dueDate', header: 'Due Date', sortable: true },
    { key: 'status', header: 'Status', align: 'center', width: '140px' },
    { key: 'actions', header: 'Actions', align: 'center', width: '200px' },
  ];

  statusOptions: SelectOption[] = [
    { value: '', label: 'All Statuses' },
    { value: 'PENDING_SUBMISSION', label: 'Pending Submission' },
    { value: 'SUBMITTED', label: 'Submitted' },
    { value: 'APPROVED', label: 'Approved' },
    { value: 'REJECTED', label: 'Rejected' },
  ];

  exporting = new Set<string>();

  constructor(
    private dashboardService: DashboardService,
    private observationsService: AuditorObservationsService,
    private http: HttpClient,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.dashboardService.getAuditorReports()
      .pipe(
        takeUntil(this.destroy$),
        catchError(() => of({ items: [] })),
        finalize(() => { this.loading = false; this.cdr.detectChanges(); }),
      )
      .subscribe((res) => {
        this.reports = res?.items || [];
        this.applyFilter();
        this.cdr.detectChanges();
      });
  }

  applyFilter(): void {
    let result = [...this.reports];
    if (this.statusFilter) {
      result = result.filter(r => r.status === this.statusFilter);
    }
    if (this.searchTerm) {
      const term = this.searchTerm.toLowerCase();
      result = result.filter(r =>
        (r.auditName || '').toLowerCase().includes(term) ||
        (r.clientName || '').toLowerCase().includes(term) ||
        (r.branchName || '').toLowerCase().includes(term)
      );
    }
    this.filteredReports = result;
  }

  onStatusFilterChange(val: string): void {
    this.statusFilter = val;
    this.applyFilter();
  }

  exportPdf(auditId: string): void {
    this.exporting.add(auditId);
    this.cdr.detectChanges();

    const baseUrl = environment.apiBaseUrl || '';
    this.http.get(`${baseUrl}/api/v1/auditor/observations/audit/${auditId}/export`, {
      responseType: 'blob',
    })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => { this.exporting.delete(auditId); this.cdr.detectChanges(); }),
      )
      .subscribe({
        next: (blob) => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `Audit_Report_${auditId.slice(0, 8)}.pdf`;
          a.click();
          URL.revokeObjectURL(url);
        },
        error: () => {
          // PDF export failed - could show toast
        },
      });
  }

  isExporting(auditId: string): boolean {
    return this.exporting.has(auditId);
  }

  getStatusVariant(status: string): string {
    switch (status) {
      case 'PENDING_SUBMISSION': return 'warning';
      case 'SUBMITTED': return 'info';
      case 'APPROVED': return 'success';
      case 'REJECTED': return 'error';
      default: return 'default';
    }
  }

  countByStatus(status: string): number {
    return this.reports.filter(r => r.status === status).length;
  }

  isPastDue(dateStr: string): boolean {
    if (!dateStr) return false;
    return new Date(dateStr) < new Date();
  }

  exportAll(): void {
    const pending = this.filteredReports.filter(r => r.status !== 'APPROVED');
    if (!pending.length) {
      return;
    }
    pending.forEach(r => {
      if (r.auditId) this.exportPdf(r.auditId);
    });
  }
}
