import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AuditsService } from '../../core/audits.service';
import { ToastService } from '../../shared/toast/toast.service';
import {
  PageHeaderComponent,
  FormSelectComponent,
  FormInputComponent,
  ActionButtonComponent,
  DataTableComponent,
  TableCellDirective,
  StatusBadgeComponent,
  EmptyStateComponent,
  type TableColumn,
  type SelectOption,
  type ButtonVariant,
} from '../../shared/ui';

@Component({
  selector: 'app-auditor-audits',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    PageHeaderComponent,
    FormSelectComponent,
    FormInputComponent,
    ActionButtonComponent,
    DataTableComponent,
    TableCellDirective,
    StatusBadgeComponent,
    EmptyStateComponent,
  ],
  templateUrl: './auditor-audits.component.html',
})
export class AuditorAuditsComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  loading = false;

  filters = {
    frequency: '',
    status: '',
    year: '',
    clientId: '',
    contractorUserId: '',
  };

  frequencyOptions: SelectOption[] = [
    { value: '', label: 'All' },
    { value: 'MONTHLY', label: 'Monthly' },
    { value: 'QUARTERLY', label: 'Quarterly' },
    { value: 'HALF_YEARLY', label: 'Half Yearly' },
    { value: 'YEARLY', label: 'Yearly' },
  ];

  statusOptions: SelectOption[] = [
    { value: '', label: 'All' },
    { value: 'SCHEDULED', label: 'Scheduled' },
    { value: 'IN_PROGRESS', label: 'In Progress' },
    { value: 'COMPLETED', label: 'Completed' },
    { value: 'CLOSED', label: 'Closed' },
  ];

  clientFilterOptions: SelectOption[] = [{ value: '', label: 'All Clients' }];

  clientAudits: any[] = [];
  contractorAudits: any[] = [];
  selectedAudit: any = null;
  statusUpdating = false;
  scoringId: string | null = null;

  clientAuditColumns: TableColumn[] = [
    { key: 'clientName', header: 'Client' },
    { key: 'frequency', header: 'Frequency' },
    { key: 'auditType', header: 'Type' },
    { key: 'periodCode', header: 'Period' },
    { key: 'status', header: 'Status' },
    { key: 'dueDate', header: 'Due Date' },
  ];

  contractorAuditColumns: TableColumn[] = [
    { key: 'clientName', header: 'Client' },
    { key: 'contractorName', header: 'Contractor' },
    { key: 'frequency', header: 'Frequency' },
    { key: 'auditType', header: 'Type' },
    { key: 'periodCode', header: 'Period' },
    { key: 'status', header: 'Status' },
  ];

  constructor(
    private auditsService: AuditsService,
    private toast: ToastService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.auditsService
      .auditorListAudits(this.filters)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          const audits = Array.isArray(res) ? res : res?.data || res?.items || [];
          this.clientAudits = audits.filter(
            (a: any) => !a.contractorName || a.contractorName === '-',
          );
          this.contractorAudits = audits.filter(
            (a: any) => a.contractorName && a.contractorName !== '-',
          );
          if (this.selectedAudit) {
            this.selectedAudit =
              audits.find((a: any) => a.id === this.selectedAudit.id) || null;
          } else if (audits.length) {
            this.selectedAudit = audits[0];
          }
          this.loading = false;
        },
        error: () => {
          this.toast.error('Failed to load audits');
          this.loading = false;
        },
      });
  }

  clear(): void {
    this.filters = {
      frequency: '',
      status: '',
      year: '',
      clientId: '',
      contractorUserId: '',
    };
    this.load();
  }

  getNextStatuses(
    current: string,
  ): { value: string; label: string; variant: ButtonVariant }[] {
    const map: Record<string, { value: string; label: string; variant: ButtonVariant }[]> = {
      SCHEDULED: [{ value: 'IN_PROGRESS', label: 'Start Audit', variant: 'primary' }],
      IN_PROGRESS: [
        { value: 'COMPLETED', label: 'Mark Complete', variant: 'primary' },
      ],
      COMPLETED: [{ value: 'CLOSED', label: 'Close Audit', variant: 'secondary' }],
    };
    return map[current] || [];
  }

  changeStatus(audit: any, newStatus: string): void {
    this.statusUpdating = true;
    this.auditsService
      .auditorUpdateStatus(audit.id, newStatus)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.toast.success('Audit status updated');
          this.statusUpdating = false;
          this.load();
        },
        error: () => {
          this.toast.error('Failed to update status');
          this.statusUpdating = false;
        },
      });
  }

  calculateScore(audit: any): void {
    this.scoringId = audit.id;
    this.auditsService
      .auditorCalculateScore(audit.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.toast.success(`Score: ${res?.score ?? 'calculated'}`);
          this.scoringId = null;
          this.load();
        },
        error: () => {
          this.toast.error('Score calculation failed');
          this.scoringId = null;
        },
      });
  }

  openObservations(audit: any): void {
    this.router.navigate(['/auditor/observations'], {
      queryParams: { auditId: audit.id },
    });
  }

  openComplianceForSelected(): void {
    if (this.selectedAudit) {
      this.router.navigate(['/auditor/audits', this.selectedAudit.id, 'workspace']);
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
