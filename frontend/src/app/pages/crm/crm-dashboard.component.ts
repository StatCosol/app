import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { DashboardService } from '../../core/dashboard.service';
import { CrmService } from '../../core/crm.service';
import { CrmClientsApi } from '../../core/api/crm-clients.api';
import { ToastService } from '../../shared/toast/toast.service';
import { PageHeaderComponent, StatCardComponent, LoadingSpinnerComponent, ActionButtonComponent } from '../../shared/ui';
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
  imports: [CommonModule, FormsModule, PageHeaderComponent, StatCardComponent, LoadingSpinnerComponent, ActionButtonComponent],
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

  /** Load clients and branches for filter dropdowns */
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

  /** Load branches scoped to the selected client */
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

  /** Load all dashboard data */
  loadAllData(): void {
    this.loadSummary();
    this.loadDueCompliances();
    this.loadLowCoverage();
    this.loadPendingDocuments();
    this.loadQueries();
  }

  /** Load summary KPIs */
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

  /** Load compliances due based on active tab */
  loadDueCompliances(): void {
    const params = { ...this.buildFilterParams(), tab: this.activeTab };
    this.dashboardService.getCrmDueCompliances(params).pipe(timeout(10000), retry(1)).subscribe({
      next: (response) => {
        this.dueCompliances = response.items;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.toast.error('Failed to load due compliances');
      },
    });
  }

  /** Load branches with low coverage */
  loadLowCoverage(): void {
    const params = this.buildFilterParams();
    this.dashboardService.getCrmLowCoverage(params).pipe(timeout(10000), retry(1)).subscribe({
      next: (response) => {
        this.lowCoverageBranches = response.items;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.toast.error('Failed to load low coverage branches');
      },
    });
  }

  /** Load pending documents */
  loadPendingDocuments(): void {
    const params = this.buildFilterParams();
    this.dashboardService.getCrmPendingDocuments(params).pipe(timeout(10000), retry(1)).subscribe({
      next: (response) => {
        this.pendingDocuments = response.items;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.toast.error('Failed to load pending documents');
      },
    });
  }

  /** Load compliance queries */
  loadQueries(): void {
    const params = this.buildFilterParams();
    this.dashboardService.getCrmQueries(params).pipe(timeout(10000), retry(1)).subscribe({
      next: (response) => {
        this.queries = response.items;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.toast.error('Failed to load queries');
      },
    });
  }

  /** Build query params from filters */
  private buildFilterParams(): Record<string, string> {
    const params: Record<string, string> = {};
    if (this.filter.clientId) params['clientId'] = this.filter.clientId;
    if (this.filter.branchId) params['branchId'] = this.filter.branchId;
    if (this.filter.periodFrom) params['periodFrom'] = this.filter.periodFrom;
    if (this.filter.periodTo) params['periodTo'] = this.filter.periodTo;
    return params;
  }

  /** Apply filters */
  applyFilters(): void {
    if (this.filter.clientId) {
      this.loadBranchesForClient(this.filter.clientId);
    }
    this.loadAllData();
  }

  /** Reset filters */
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

  /** Set active tab for Compliance Due Tracker */
  setDueTab(tab: 'OVERDUE' | 'DUE_SOON' | 'THIS_MONTH'): void {
    this.activeTab = tab;
    this.loadDueCompliances();
  }

  onClientChange(): void {
    this.loadBranchesForClient(this.filter.clientId ?? '');
  }

  /** Update compliance status */
  updateCompliance(item: ComplianceDueItem): void {
    // TODO: Navigate to compliance update page or open modal
    this.toast.info('Navigate to compliance update for: ' + item.complianceItem);
  }

  /** View branch details */
  viewBranchDetails(branch: LowCoverageBranch): void {
    // TODO: Navigate to branch compliance detail page
    this.router.navigate(['/crm/clients', branch.clientId, 'branches', branch.branchId]);
  }

  /** Upload document */
  uploadDocument(doc: PendingDocument): void {
    // TODO: Open document upload modal or navigate to upload page
    this.toast.info('Upload document: ' + doc.documentType);
  }

  /** Follow up on pending document */
  followUpDocument(doc: PendingDocument): void {
    // TODO: Send follow-up notification to contractor
    this.toast.info('Follow-up sent for: ' + doc.documentType);
  }

  /** Reply to query */
  replyToQuery(query: ComplianceQuery): void {
    // TODO: Navigate to query detail/reply page
    this.router.navigate(['/crm/queries', query.refId]);
  }

  /** Assign query to someone else */
  assignQuery(query: ComplianceQuery): void {
    // TODO: Open assignment modal
    this.toast.info('Assign query: ' + query.subject);
  }

  /** Close query */
  closeQuery(query: ComplianceQuery): void {
    // TODO: Mark query as closed with confirmation
    this.toast.info('Close query: ' + query.subject);
  }

  // KPI Card Drill-down Handlers
  drillOverdueCompliances() {
    this.router.navigate(['/crm/compliances'], {
      queryParams: { tab: 'OVERDUE' }
    });
  }

  drillDueSoon() {
    this.router.navigate(['/crm/compliances'], {
      queryParams: { tab: 'DUE_SOON', window: 30 }
    });
  }

  drillOpenQueries() {
    this.router.navigate(['/crm/queries'], {
      queryParams: { status: 'OPEN', type: 'COMPLIANCE' }
    });
  }

  drillCoverage() {
    // Navigate to low coverage branches view
    this.router.navigate(['/crm/branches'], {
      queryParams: { view: 'LOW_COVERAGE' }
    });
  }
}
