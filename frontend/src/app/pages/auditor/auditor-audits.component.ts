import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { finalize, timeout, takeUntil } from 'rxjs/operators';
import { Subject } from 'rxjs';
import { AuditsService } from '../../core/audits.service';
import {
  PageHeaderComponent,
  DataTableComponent,
  TableCellDirective,
  TableColumn,
  StatusBadgeComponent,
  ActionButtonComponent,
  FormInputComponent,
  FormSelectComponent,
  EmptyStateComponent,
} from '../../shared/ui';

@Component({
  selector: 'app-auditor-audits',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    PageHeaderComponent,
    DataTableComponent,
    TableCellDirective,
    StatusBadgeComponent,
    ActionButtonComponent,
    FormInputComponent,
    FormSelectComponent,
    EmptyStateComponent,
  ],
  templateUrl: './auditor-audits.component.html',
  styleUrls: ['./auditor-audits.component.scss'],
})
export class AuditorAuditsComponent implements OnInit, OnDestroy {
  filters: any = {
    frequency: '',
    status: '',
    year: '',
    clientId: '',
    contractorUserId: '',
  };

  frequencies = [
    { label: 'All', value: '' },
    { label: 'Monthly', value: 'MONTHLY' },
    { label: 'Quarterly', value: 'QUARTERLY' },
    { label: 'Half-yearly', value: 'HALF_YEARLY' },
    { label: 'Yearly', value: 'YEARLY' },
  ];

  statuses = [
    { label: 'All', value: '' },
    { label: 'Planned', value: 'PLANNED' },
    { label: 'In Progress', value: 'IN_PROGRESS' },
    { label: 'Completed', value: 'COMPLETED' },
    { label: 'Cancelled', value: 'CANCELLED' },
  ];

  // Convert to SelectOption format
  get frequencyOptions() {
    return this.frequencies;
  }

  get statusOptions() {
    return this.statuses;
  }

  audits: any[] = [];
  selectedAudit: any = null;
  loading = true;

  private destroy$ = new Subject<void>();

  // Reference data
  clients: Array<{ id: string; name: string }> = [];
  clientNameMap: Record<string, string> = {};

  get clientFilterOptions() {
    return [{ value: '', label: 'All Clients' }, ...this.clients.map(c => ({ value: c.id, label: c.name }))];
  }

  // Table column definitions
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
    private router: Router,
    private http: HttpClient,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loadClients();
    this.load();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadClients(): void {
    this.http.get<any[]>('/api/v1/auditor/clients/assigned').pipe(takeUntil(this.destroy$)).subscribe({
      next: (data) => {
        this.clients = (data || []).map((c: any) => ({ id: c.id, name: c.clientName || c.name || 'Unknown' }));
        this.clientNameMap = {};
        this.clients.forEach(c => this.clientNameMap[c.id] = c.name);
        this.cdr.detectChanges();
      },
      error: () => { this.clients = []; this.cdr.detectChanges(); },
    });
  }

  load(): void {
    this.loading = true;
    const params = { ...this.filters };
    this.auditsService.auditorListAudits(params).pipe(
      takeUntil(this.destroy$),
      timeout(10000),
      finalize(() => { this.loading = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (res) => {
        this.loading = false;
        this.audits = (res?.data || []).map((a: any) => ({
          ...a,
          clientName: a.client?.clientName || this.clientNameMap[a.clientId] || 'Unknown',
          contractorName: a.contractorUser?.name || a.contractorUserName || '-',
        }));
        if (this.audits.length && !this.selectedAudit) {
          this.selectedAudit = this.audits[0];
        }
        this.cdr.detectChanges();
      },
      error: () => {
        this.loading = false;
        this.audits = [];
        this.cdr.detectChanges();
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

  select(audit: any): void {
    this.selectedAudit = audit;
  }

  openComplianceForSelected(): void {
    if (!this.selectedAudit) return;

    const queryParams: any = {
      clientId: this.selectedAudit.clientId,
      year: this.selectedAudit.periodYear,
    };

    this.router.navigate(['/auditor/compliance'], { queryParams });
  }

  get clientAudits(): any[] {
    return this.audits.filter((a) => !a.contractorUserId);
  }

  get contractorAudits(): any[] {
    return this.audits.filter((a) => !!a.contractorUserId);
  }
}
