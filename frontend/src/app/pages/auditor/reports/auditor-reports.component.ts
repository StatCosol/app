import { downloadBlob } from '../../../shared/utils/download-blob';
import { AuditFilePreviewComponent, AuditFilePreview } from '../../../shared/files/components/audit-file-preview.component';
import { auditContext, auditOptionLabel } from '../audit-context';
import { IconComponent } from '../../../shared/ui/icon/icon.component';
import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, of, EMPTY } from 'rxjs';
import { takeUntil, finalize, catchError, expand, reduce } from 'rxjs/operators';
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
  imports: [AuditFilePreviewComponent, IconComponent,
    CommonModule, RouterModule, FormsModule, PageHeaderComponent, DataTableComponent,
    TableCellDirective, StatusBadgeComponent, ActionButtonComponent,
    EmptyStateComponent, LoadingSpinnerComponent, FormSelectComponent,
  ],
  templateUrl: './auditor-reports.component.html',
})
export class AuditorReportsComponent implements OnInit, OnDestroy {
  preview: AuditFilePreview | null = null;
  readonly auditContext = auditContext;
  loadError = '';
  exportError = '';
  loading = true;
  reports: AuditorReportPending[] = [];
  filteredReports: AuditorReportPending[] = [];
  statusFilter = '';
  searchTerm = '';
  private destroy$ = new Subject<void>();

  columns: TableColumn[] = [
    { key: 'auditName', header: 'Audit type / period', sortable: true },
    { key: 'clientName', header: 'Client', sortable: true },
    { key: 'branchName', header: 'Branch' },
    { key: 'dueDate', header: 'Due Date', sortable: true },
    { key: 'status', header: 'Status', align: 'center', width: '140px' },
    { key: 'actions', header: 'Actions', align: 'center', width: '200px' },
  ];

  statusOptions: SelectOption[] = [
    { value: '', label: 'All Statuses' },
    { value: 'PLANNED', label: 'Planned' },
    { value: 'ASSIGNED', label: 'Assigned (legacy)' },
    { value: 'IN_PROGRESS', label: 'In Progress' },
    { value: 'COMPLETED', label: 'Completed / Pending Submission' },
    { value: 'SUBMITTED', label: 'Submitted' },
    { value: 'CORRECTION_PENDING', label: 'Correction Pending' },
    { value: 'REVERIFICATION_PENDING', label: 'Reverification Pending' },
    { value: 'CLOSED', label: 'Closed' },
    { value: 'CANCELLED', label: 'Cancelled' },
  ];

  exporting = new Set<string>();

  constructor(
    private dashboardService: DashboardService,
    private observationsService: AuditorObservationsService,
    private http: HttpClient,
    private cdr: ChangeDetectorRef,
    private route: ActivatedRoute,
  ) {}

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  ngOnInit(): void {
    this.route.queryParamMap.pipe(takeUntil(this.destroy$)).subscribe(params => {
      const requested = params.get('status') || '';
      const status = requested === 'PENDING_SUBMISSION' ? 'COMPLETED' : requested;
      this.statusFilter = this.statusOptions.some(option => option.value === status) ? status : '';
      this.applyFilter();
    });
    this.load();
  }

  load(): void {
    this.loading = true;
    this.loadError = '';
    this.dashboardService.getAuditorReports({ limit: '500', offset: '0' })
      .pipe(
        expand((res, index) => res.items.length === 500 ? this.dashboardService.getAuditorReports({ limit: '500', offset: String((index + 1) * 500) }) : EMPTY),
        reduce((acc: { items: any[] }, res) => ({ items: acc.items.concat(res.items || []) }), { items: [] }),
        takeUntil(this.destroy$),
        catchError(() => { this.loadError = 'Reports could not be loaded. Retry to see your assigned audits.'; return of({ items: [] }); }),
        finalize(() => { this.loading = false; this.cdr.detectChanges(); }),
      )
      .subscribe((res) => {
        this.reports = (res?.items || []).map((row: any) => this.normalizeReport(row));
        this.applyFilter();
        this.cdr.detectChanges();
      });
  }

  private normalizeReport(row: any): AuditorReportPending {
    return {
      auditCode: row?.auditCode ?? row?.audit_code ?? '',
      auditType: row?.auditType ?? row?.audit_type ?? '',
      periodCode: row?.periodCode ?? row?.period_code ?? '',
      contractorName: row?.contractorName ?? row?.contractor_name ?? '',
      auditId: row?.auditId ?? row?.audit_id ?? '',
      reportId: row?.reportId ?? row?.report_id ?? '',
      clientId: row?.clientId ?? row?.client_id ?? '',
      clientName: row?.clientName ?? row?.client_name ?? '',
      branchId: row?.branchId ?? row?.branch_id ?? '',
      branchName: row?.branchName ?? row?.branch_name ?? '',
      auditName: row?.auditName ?? row?.audit_name ?? row?.auditCode ?? row?.audit_code ?? 'Audit',
      dueDate: row?.dueDate ?? row?.due_date ?? '',
      status: row?.status ?? '',
    };
  }

  applyFilter(): void {
    let result = [...this.reports];
    if (this.statusFilter) {
      result = result.filter(r => r.status === this.statusFilter);
    }
    if (this.searchTerm) {
      const term = this.searchTerm.toLowerCase();
      result = result.filter(r =>
        auditOptionLabel(r).toLowerCase().includes(term) ||
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

  exportPdf(auditId: string, preview = true): void {
    this.exportError = '';
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
          const name = `Audit_Report_${auditId.slice(0, 8)}.pdf`;
          if (preview) this.preview = { blob, name };
          else void downloadBlob(blob, name).catch(() => {
            this.exportError = 'The report download failed. Please retry.';
            this.cdr.markForCheck();
          });
          this.cdr.markForCheck();
        },
        error: () => {
          this.exportError = 'The report PDF could not be downloaded. Please retry.';
          this.cdr.markForCheck();
        },
      });
  }

  isExporting(auditId: string): boolean {
    return this.exporting.has(auditId);
  }

  countByStatus(status: string): number {
    return this.reports.filter(r => r.status === status).length;
  }

  isPastDue(dateStr: string): boolean {
    if (!dateStr) return false;
    return new Date(dateStr) < new Date();
  }

  exportAll(): void {
    const pending = this.filteredReports;
    if (!pending.length) {
      return;
    }
    pending.forEach(r => {
      if (r.auditId) this.exportPdf(r.auditId, false);
    });
  }
}
