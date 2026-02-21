import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { DashboardService } from '../../core/dashboard.service';
import { CrmService } from '../../core/crm.service';
import { CrmClientsApi } from '../../core/api/crm-clients.api';
import { ToastService } from '../../shared/toast/toast.service';
import {
  PageHeaderComponent,
  StatCardComponent,
  LoadingSpinnerComponent,
  ActionButtonComponent,
  DataTableComponent,
  TableCellDirective,
  TableColumn,
  StatusBadgeComponent,
  FormSelectComponent,
  FormInputComponent,
  SelectOption,
} from '../../shared/ui';
import { retry, timeout, finalize } from 'rxjs/operators';
import {
  CrmFilters,
  CrmSummary,
  ComplianceDueItem,
  LowCoverageBranch,
  PendingDocument,
  ComplianceQuery,
} from './crm-dashboard.dto';

@Component({
  selector: 'app-crm-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    PageHeaderComponent,
    StatCardComponent,
    LoadingSpinnerComponent,
    ActionButtonComponent,
    DataTableComponent,
    TableCellDirective,
    StatusBadgeComponent,
    FormSelectComponent,
    FormInputComponent,
  ],
  templateUrl: './crm-dashboard.component.html',
  styleUrls: ['./crm-dashboard.component.scss'],
})
export class CrmDashboardComponent implements OnInit {
  loading = false;
  errorMsg: string | null = null;

  // Filters
  filter: CrmFilters = {
    clientId: '',
    branchId: '',
    periodFrom: '',
    periodTo: '',
  };

  // Reference data for filters
  clients: Array<{ id: string; name: string }> = [];
  branches: Array<{ id: string; name: string }> = [];
  branchesLoading = false;

  // Summary KPIs
  summary: CrmSummary = {
    assignedClientsCount: 0,
    assignedBranchesCount: 0,
    complianceCoveragePct: 0,
    overdueCompliancesCount: 0,
    dueSoonCompliancesCount: 0,
    openComplianceQueriesCount: 0,
  };

  // Active tab for Compliance Due Tracker
  activeTab: 'OVERDUE' | 'DUE_SOON' | 'THIS_MONTH' = 'OVERDUE';

  // Data tables
  dueCompliances: ComplianceDueItem[] = [];
  lowCoverageBranches: LowCoverageBranch[] = [];
  pendingDocuments: PendingDocument[] = [];
  queries: ComplianceQuery[] = [];

  // Table column definitions
  dueColumns: TableColumn[] = [
    { key: 'complianceItem', header: 'Compliance Item', sortable: true },
    { key: 'client', header: 'Client / Branch', sortable: true },
    { key: 'dueDate', header: 'Due Date', sortable: true, width: '110px' },
    { key: 'daysOverdue', header: 'Days Overdue', sortable: true, width: '120px', align: 'center' },
    { key: 'risk', header: 'Risk', sortable: true, width: '100px', align: 'center' },
    { key: 'dueActions', header: 'Actions', sortable: false, width: '100px', align: 'center' },
  ];

  coverageColumns: TableColumn[] = [
    { key: 'branch', header: 'Branch', sortable: true },
    { key: 'coveragePct', header: 'Coverage', sortable: true, width: '180px' },
    { key: 'overdueCount', header: 'Overdue', sortable: true, width: '100px', align: 'center' },
    { key: 'highRiskCount', header: 'High Risk', sortable: true, width: '100px', align: 'center' },
    { key: 'coverageActions', header: '', sortable: false, width: '80px', align: 'center' },
  ];

  docColumns: TableColumn[] = [
    { key: 'documentType', header: 'Document', sortable: true },
    { key: 'requestedOn', header: 'Requested', sortable: true, width: '120px' },
    { key: 'pendingDays', header: 'Pending', sortable: true, width: '100px', align: 'center' },
    { key: 'docActions', header: 'Actions', sortable: false, width: '200px', align: 'center' },
  ];

  queryColumns: TableColumn[] = [
    { key: 'from', header: 'From', sortable: true, width: '150px' },
    { key: 'subject', header: 'Subject', sortable: true },
    { key: 'ageingDays', header: 'Age', sortable: true, width: '80px', align: 'center' },
    { key: 'queryStatus', header: 'Status', sortable: true, width: '120px', align: 'center' },
    { key: 'queryActions', header: 'Actions', sortable: false, width: '180px', align: 'center' },
  ];

  // Select options for shared form components
  get clientOptions(): SelectOption[] {
    return [
      { value: '', label: 'All Clients' },
      ...this.clients.map(c => ({ value: c.id, label: c.name })),
    ];
  }

  get branchOptions(): SelectOption[] {
    return [
      { value: '', label: 'All Branches' },
      ...this.branches.map(b => ({ value: b.id, label: b.name })),
    ];
  }

  constructor(
    private dashboardService: DashboardService,
    private crmService: CrmService,
    private crmClientsApi: CrmClientsApi,
    private toast: ToastService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadReferenceData();
    this.loadAllData();
  }

  loadReferenceData(): void {
    this.crmService.getAssignedClients().subscribe({
      next: (data) => {
        this.clients = (data || []).map((c: any) => ({ id: c.id, name: c.clientName || c.name }));
        if (this.filter.clientId) {
          this.loadBranchesForClient(this.filter.clientId);
        } else {
          this.branches = [];
        }
        this.cdr.detectChanges();
      },
      error: () => { this.clients = []; },
    });
  }

  loadBranchesForClient(clientId: string): void {
    if (!clientId) {
      this.branches = [];
      this.filter.branchId = '';
      this.cdr.detectChanges();
      return;
    }

    this.branchesLoading = true;
    this.filter.branchId = '';

    this.crmClientsApi.getBranchesForClient(clientId).pipe(
      finalize(() => {
        this.branchesLoading = false;
        this.cdr.detectChanges();
      }),
    ).subscribe({
      next: (data) => {
        this.branches = (data || []).map((b: any) => ({ id: b.id, name: b.branchName || b.name }));
      },
      error: () => {
        this.branches = [];
      },
    });
  }

  loadAllData(): void {
    this.loadSummary();
    this.loadDueCompliances();
    this.loadLowCoverage();
    this.loadPendingDocuments();
    this.loadQueries();
  }

  loadSummary(): void {
    this.loading = true;
    this.errorMsg = null;

    const params = this.buildFilterParams();
    this.dashboardService.getCrmSummary(params).pipe(
      timeout(10000),
      retry(1),
      finalize(() => { this.loading = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (data) => {
        this.summary = data;
      },
      error: (err) => {
        this.errorMsg = err?.error?.message || 'Failed to load dashboard summary';
      },
    });
  }

  loadDueCompliances(): void {
    const params = { ...this.buildFilterParams(), tab: this.activeTab };
    this.dashboardService.getCrmDueCompliances(params).pipe(timeout(10000), retry(1)).subscribe({
      next: (response) => {
        this.dueCompliances = response.items;
        this.cdr.detectChanges();
      },
      error: () => {
        this.toast.error('Failed to load due compliances');
      },
    });
  }

  loadLowCoverage(): void {
    const params = this.buildFilterParams();
    this.dashboardService.getCrmLowCoverage(params).pipe(timeout(10000), retry(1)).subscribe({
      next: (response) => {
        this.lowCoverageBranches = response.items;
        this.cdr.detectChanges();
      },
      error: () => {
        this.toast.error('Failed to load low coverage branches');
      },
    });
  }

  loadPendingDocuments(): void {
    const params = this.buildFilterParams();
    this.dashboardService.getCrmPendingDocuments(params).pipe(timeout(10000), retry(1)).subscribe({
      next: (response) => {
        this.pendingDocuments = response.items;
        this.cdr.detectChanges();
      },
      error: () => {
        this.toast.error('Failed to load pending documents');
      },
    });
  }

  loadQueries(): void {
    const params = this.buildFilterParams();
    this.dashboardService.getCrmQueries(params).pipe(timeout(10000), retry(1)).subscribe({
      next: (response) => {
        this.queries = response.items;
        this.cdr.detectChanges();
      },
      error: () => {
        this.toast.error('Failed to load queries');
      },
    });
  }

  private buildFilterParams(): Record<string, string> {
    const params: Record<string, string> = {};
    if (this.filter.clientId) params['clientId'] = this.filter.clientId;
    if (this.filter.branchId) params['branchId'] = this.filter.branchId;
    if (this.filter.periodFrom) params['periodFrom'] = this.filter.periodFrom;
    if (this.filter.periodTo) params['periodTo'] = this.filter.periodTo;
    return params;
  }

  applyFilters(): void {
    if (this.filter.clientId) {
      this.loadBranchesForClient(this.filter.clientId);
    }
    this.loadAllData();
  }

  resetFilters(): void {
    this.filter = {
      clientId: '',
      branchId: '',
      periodFrom: '',
      periodTo: '',
    };
    this.branches = [];
    this.loadAllData();
  }

  setDueTab(tab: 'OVERDUE' | 'DUE_SOON' | 'THIS_MONTH'): void {
    this.activeTab = tab;
    this.loadDueCompliances();
  }

  onClientChange(): void {
    this.loadBranchesForClient(this.filter.clientId ?? '');
  }

  updateCompliance(item: ComplianceDueItem): void {
    this.toast.info('Navigate to compliance update for: ' + item.complianceItem);
  }

  viewBranchDetails(branch: LowCoverageBranch): void {
    this.router.navigate(['/crm/clients', branch.clientId, 'branches', branch.branchId]);
  }

  uploadDocument(doc: PendingDocument): void {
    this.toast.info('Upload document: ' + doc.documentType);
  }

  followUpDocument(doc: PendingDocument): void {
    this.toast.info('Follow-up sent for: ' + doc.documentType);
  }

  replyToQuery(query: ComplianceQuery): void {
    this.router.navigate(['/crm/queries', query.refId]);
  }

  assignQuery(query: ComplianceQuery): void {
    this.toast.info('Assign query: ' + query.subject);
  }

  closeQuery(query: ComplianceQuery): void {
    this.toast.info('Close query: ' + query.subject);
  }

  drillOverdueCompliances() {
    this.router.navigate(['/crm/compliances'], { queryParams: { tab: 'OVERDUE' } });
  }

  drillDueSoon() {
    this.router.navigate(['/crm/compliances'], { queryParams: { tab: 'DUE_SOON', window: 30 } });
  }

  drillOpenQueries() {
    this.router.navigate(['/crm/queries'], { queryParams: { status: 'OPEN', type: 'COMPLIANCE' } });
  }

  drillCoverage() {
    this.router.navigate(['/crm/branches'], { queryParams: { view: 'LOW_COVERAGE' } });
  }
}
