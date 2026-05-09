
import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { finalize, timeout, takeUntil } from 'rxjs/operators';
import { CcoCrmsService } from '../../core/cco-crms.service';
import { ReportsService } from '../../core/reports.service';
import { ToastService } from '../../shared/toast/toast.service';
import {
  PageHeaderComponent, StatusBadgeComponent, LoadingSpinnerComponent,
  ActionButtonComponent, DataTableComponent, TableCellDirective, TableColumn,
  FormSelectComponent, SelectOption, EmptyStateComponent,
} from '../../shared/ui';

@Component({
  selector: 'app-cco-crms-under-me',
  standalone: true,
  imports: [
    CommonModule, FormsModule, PageHeaderComponent, StatusBadgeComponent,
    LoadingSpinnerComponent, ActionButtonComponent, DataTableComponent,
    TableCellDirective, FormSelectComponent, EmptyStateComponent,
  ],
  templateUrl: './cco-crms-under-me.component.html',
})
export class CcoCrmsUnderMeComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  allCrms: any[] = [];
  filteredCrms: any[] = [];
  loading = true;
  error = '';
  searchTerm = '';
  statusFilter = '';

  columns: TableColumn[] = [
    { key: 'name', header: 'CRM Name', sortable: true },
    { key: 'clientCount', header: 'Clients', sortable: true, width: '90px', align: 'center' },
    { key: 'overdueCount', header: 'Overdue', sortable: true, width: '90px', align: 'center' },
    { key: 'status', header: 'Status', width: '120px', align: 'center' },
    { key: 'lastLogin', header: 'Last Login', width: '150px' },
    { key: 'actions', header: '', width: '80px', align: 'right' },
  ];

  readonly statusOptions: SelectOption[] = [
    { value: '', label: 'All Statuses' },
    { value: 'ACTIVE', label: 'Active' },
    { value: 'INACTIVE', label: 'Inactive' },
  ];

  constructor(private ccoCrmsService: CcoCrmsService, private toast: ToastService, private router: Router, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.loading = true;
    this.ccoCrmsService.list().pipe(
      takeUntil(this.destroy$),
      timeout(10000),
      finalize(() => { this.loading = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (data) => {
        this.loading = false;
        this.allCrms = data || [];
        this.applyFilter();
        this.cdr.detectChanges();
      },
      error: () => {
        this.loading = false;
        this.error = 'Failed to load CRMs.';
        this.allCrms = [];
        this.filteredCrms = [];
        this.cdr.detectChanges();
      },
    });
  }

  applyFilter(): void {
    let result = [...this.allCrms];
    if (this.statusFilter) {
      result = result.filter(c => c.status === this.statusFilter);
    }
    if (this.searchTerm) {
      const term = this.searchTerm.toLowerCase();
      result = result.filter(c => (c.name || '').toLowerCase().includes(term));
    }
    this.filteredCrms = result;
  }

  get activeCrms(): number {
    return this.allCrms.filter(c => c.status === 'ACTIVE').length;
  }

  get totalClients(): number {
    return this.allCrms.reduce((sum, c) => sum + (c.clientCount ?? 0), 0);
  }

  get totalOverdue(): number {
    return this.allCrms.reduce((sum, c) => sum + (c.overdueCount ?? 0), 0);
  }

  viewCrm(crm: any) {
    this.router.navigate(['/cco/crm-performance'], { queryParams: { crmId: crm.id } });
  }

  retry(): void {
    this.loading = true;
    this.error = '';
    this.ngOnInit();
  }

  exportCsv(): void {
    ReportsService.exportCsv(this.allCrms, [
      { key: 'name', label: 'Name' },
      { key: 'email', label: 'Email' },
      { key: 'clientCount', label: 'Clients' },
      { key: 'overdueCount', label: 'Overdue' },
      { key: 'status', label: 'Status' },
      { key: 'lastLogin', label: 'Last Login' },
    ], 'cco-crms-under-me.csv');
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
