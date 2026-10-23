import { AuditFieldworkComponent } from '../../../shared/audit-fieldwork/audit-fieldwork.component';
import { auditTypeLabel } from '../../auditor/audit-context';
import { AuditFilePreviewComponent, AuditFilePreview } from '../../../shared/files/components/audit-file-preview.component';
import { IconComponent } from '../../../shared/ui/icon/icon.component';
import { Component, ChangeDetectorRef, OnDestroy } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { Subject, Subscription } from 'rxjs';
import { finalize, takeUntil, timeout } from 'rxjs/operators';
import { ClientAuditsService } from '../../../core/client-audits.service';
import { ReportsService } from '../../../core/reports.service';
import { PageHeaderComponent, DataTableComponent, TableCellDirective, TableColumn, FormSelectComponent, StatusBadgeComponent } from '../../../shared/ui';

@Component({
  standalone: true,
  selector: 'app-client-audits',
  imports: [AuditFieldworkComponent, AuditFilePreviewComponent, TableCellDirective, IconComponent, FormsModule, PageHeaderComponent, DataTableComponent, FormSelectComponent, StatusBadgeComponent],
  templateUrl: './client-audits.component.html',
  styleUrls: ['../shared/client-theme.scss', './client-audits.component.scss'],
})
export class ClientAuditsComponent implements OnDestroy {
  private destroy$ = new Subject<void>();
  preview: AuditFilePreview | null = null;
  openingReport = '';
  loading = true;
  errorMessage = '';
  private loadRequest?: Subscription;
  audits: any[] = [];

  filters = {
    year: new Date().getFullYear() as number | '',
    status: '',
    frequency: '',
  };

  columns: TableColumn[] = [
    { key: 'auditCode', header: 'Audit', sortable: true },
    { key: 'branchName', header: 'Branch / unit', sortable: true },
    { key: 'report', header: 'Published report', sortable: false },
    { key: 'auditType', header: 'Audit Type', sortable: true },
    { key: 'period', header: 'Period', sortable: false },
    { key: 'auditor', header: 'Auditor', sortable: false },
    { key: 'status', header: 'Status', sortable: true, align: 'center' },
    { key: 'dueDate', header: 'Due Date', sortable: true },
    { key: 'notes', header: 'Audit evidence', sortable: false, width: '160px' },
  ];

  // Static options — must NOT be inline arrays in template (new refs every CD cycle → NG0103)
  yearOptions: { value: number | ''; label: string }[] = [
    { value: '', label: 'All years' },
    ...Array.from({ length: 4 }, (_, index) => {
      const year = new Date().getFullYear() - 2 + index;
      return { value: year, label: String(year) };
    }),
  ];
  readonly auditStatusOptions = [
    { value: '', label: 'All Statuses' },
    { value: 'PLANNED', label: 'Planned' },
    { value: 'IN_PROGRESS', label: 'In Progress' },
    { value: 'SUBMITTED', label: 'Submitted' },
    { value: 'CORRECTION_PENDING', label: 'Correction Pending' },
    { value: 'REVERIFICATION_PENDING', label: 'Reverification Pending' },
    { value: 'COMPLETED', label: 'Completed' },
    { value: 'CANCELLED', label: 'Cancelled' },
    { value: 'CLOSED', label: 'Closed' },
  ];
  readonly frequencyOptions = [
    { value: '', label: 'All Frequencies' },
    { value: 'MONTHLY', label: 'Monthly' },
    { value: 'QUARTERLY', label: 'Quarterly' },
    { value: 'HALF_YEARLY', label: 'Half Yearly' },
    { value: 'YEARLY', label: 'Yearly' },
  ];

  constructor(private api: ClientAuditsService, private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    this.loadAudits();
  }

  ngOnDestroy() {
    this.loadRequest?.unsubscribe();
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadAudits() {
    this.loadRequest?.unsubscribe();
    this.selectedAudit = null;
    this.errorMessage = '';
    this.loading = true;
    this.loadRequest = this.api.list(this.filters).pipe(
      takeUntil(this.destroy$),
      timeout(10000),
      finalize(() => { this.loading = false; this.cdr.markForCheck(); }),
    ).subscribe({
      next: (res: any) => {
        this.loading = false;
        const rows = Array.isArray(res) ? res : (res?.items ?? res?.data ?? []);
        // All years allows discovery of historical or future audits. Keep discovered
        // years when a narrower filter is selected so users can return to them.
        const years = new Set(this.yearOptions.filter(o => o.value !== '').map(o => Number(o.value)));
        for (const audit of rows) {
          const year = Number(audit.periodYear || String(audit.periodCode || '').slice(0, 4));
          if (Number.isInteger(year) && year >= 1000 && year <= 9999) years.add(year);
        }
        this.yearOptions = [
          { value: '', label: 'All years' },
          ...[...years].sort((a, b) => a - b).map(year => ({ value: year, label: String(year) })),
        ];
        this.audits = rows;
        // Transform data for table display
        this.audits = this.audits.map(audit => ({
          ...audit,
          period: audit.periodCode || String(audit.periodYear),
          branchName: audit.branch?.branchName || 'Company-wide',
          auditor: audit.assignedAuditor?.name || '—',
          contractor: audit.contractorUser?.name || (audit.auditType === 'CONTRACTOR' ? 'Not recorded' : 'Not applicable'),
          dueDate: this.formatDate(audit.dueDate),
          notes: audit.notes || '—'
        }));
        this.cdr.markForCheck();
      },
      error: () => { this.audits = []; this.errorMessage = 'Unable to load audits. Please retry.'; this.loading = false; this.cdr.markForCheck(); },
    });
  }

  openReport(audit: any): void {
    if (!audit.publishedReportAvailable || this.openingReport) return;
    this.openingReport = audit.id;
    this.errorMessage = '';
    this.api.publishedReport(audit.id).pipe(takeUntil(this.destroy$), timeout(20000),
      finalize(() => { this.openingReport = ''; this.cdr.markForCheck(); })).subscribe({
      next: blob => { this.preview = { blob, name: `${audit.auditCode || 'Audit'} - ${audit.contractorUser?.name || auditTypeLabel(audit.auditType)}.pdf` }; this.cdr.markForCheck(); },
      error: () => { this.errorMessage = 'The published report could not be opened. Refresh and try again.'; this.cdr.markForCheck(); },
    });
  }

  getStatusClass(status: string): string {
    const map: any = {
      PLANNED: 'planned',
      IN_PROGRESS: 'in-progress',
      COMPLETED: 'completed',
      CANCELLED: 'cancelled',
    };
    return map[status] || 'planned';
  }

  formatDate(date: string | Date): string {
    if (!date) return '—';
    return new Date(date).toLocaleDateString();
  }

  selectedAudit: any = null;

  get auditCounts() {
    return {
      total: this.audits.length,
      planned: this.audits.filter(a => a.status === 'PLANNED').length,
      inProgress: this.audits.filter(a => a.status === 'IN_PROGRESS').length,
      completed: this.audits.filter(a => ['COMPLETED','CLOSED'].includes(a.status)).length,
    };
  }

  openAuditDetail(audit: any) {
    this.selectedAudit = audit;
  }

  exportCsv(): void {
    ReportsService.exportCsv(this.audits, [
      { key: 'auditType', label: 'Audit Type' },
      { key: 'frequency', label: 'Frequency' },
      { key: 'period', label: 'Period' },
      { key: 'auditor', label: 'Auditor' },
      { key: 'contractor', label: 'Contractor' },
      { key: 'status', label: 'Status' },
      { key: 'dueDate', label: 'Due Date' },
    ], 'client-audits.csv');
  }
}
