import { Component, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { finalize, takeUntil, timeout } from 'rxjs/operators';
import { ClientAuditsService } from '../../../core/client-audits.service';
import { ReportsService } from '../../../core/reports.service';
import { PageHeaderComponent, DataTableComponent, TableColumn, FormSelectComponent, StatusBadgeComponent } from '../../../shared/ui';

@Component({
  standalone: true,
  selector: 'app-client-audits',
  imports: [CommonModule, FormsModule, PageHeaderComponent, DataTableComponent, FormSelectComponent, StatusBadgeComponent],
  templateUrl: './client-audits.component.html',
  styleUrls: ['../shared/client-theme.scss', './client-audits.component.scss'],
})
export class ClientAuditsComponent implements OnDestroy {
  private destroy$ = new Subject<void>();
  loading = true;
  audits: any[] = [];

  filters = {
    year: new Date().getFullYear(),
    status: '',
    frequency: '',
  };

  columns: TableColumn[] = [
    { key: 'auditType', header: 'Audit Type', sortable: true },
    { key: 'frequency', header: 'Frequency', sortable: true },
    { key: 'period', header: 'Period', sortable: false },
    { key: 'auditor', header: 'Auditor', sortable: false },
    { key: 'contractor', header: 'Contractor', sortable: false },
    { key: 'status', header: 'Status', sortable: true, align: 'center' },
    { key: 'dueDate', header: 'Due Date', sortable: true },
    { key: 'notes', header: 'Notes', sortable: false },
  ];

  // Static options — must NOT be inline arrays in template (new refs every CD cycle → NG0103)
  readonly yearOptions = [
    { value: 2024, label: '2024' },
    { value: 2025, label: '2025' },
    { value: 2026, label: '2026' },
    { value: 2027, label: '2027' },
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
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadAudits() {
    this.loading = true;
    this.api.list(this.filters).pipe(
      takeUntil(this.destroy$),
      timeout(10000),
      finalize(() => { this.loading = false; this.cdr.markForCheck(); }),
    ).subscribe({
      next: (res: any) => {
        this.loading = false;
        this.audits = res || [];
        // Transform data for table display
        this.audits = this.audits.map(audit => ({
          ...audit,
          period: `${audit.periodCode} / ${audit.periodYear}`,
          auditor: audit.assignedAuditor?.name || '—',
          contractor: audit.contractorUser?.name || 'All',
          dueDate: this.formatDate(audit.dueDate),
          notes: audit.notes || '—'
        }));
        this.cdr.markForCheck();
      },
      error: () => { this.loading = false; this.cdr.markForCheck(); },
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
      completed: this.audits.filter(a => a.status === 'COMPLETED').length,
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
