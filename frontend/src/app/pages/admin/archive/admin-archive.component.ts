import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Subject } from 'rxjs';
import { takeUntil, finalize, timeout } from 'rxjs/operators';
import {
  PageHeaderComponent, LoadingSpinnerComponent, EmptyStateComponent,
  DataTableComponent, TableCellDirective, TableColumn,
  ActionButtonComponent,
} from '../../../shared/ui';
import { ConfirmDialogService } from '../../../shared/ui/confirm-dialog/confirm-dialog.service';
import { ToastService } from '../../../shared/toast/toast.service';

@Component({
  selector: 'app-admin-archive',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    PageHeaderComponent, LoadingSpinnerComponent, EmptyStateComponent,
    DataTableComponent, TableCellDirective,
    ActionButtonComponent,
  ],
  template: `
    <div class="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <ui-page-header
        title="Archive & Recovery"
        description="Browse deleted clients, branches and users. Retrieve documents, audit reports, returns and registers. Data retained for 3 years."
        icon="archive">
      </ui-page-header>

      <!-- Tab Bar -->
      <div class="flex border-b border-gray-200 mb-6">
        @for (tab of tabs; track tab) {
<button (click)="activeTab = tab.key; loadTab()"
          [class]="activeTab === tab.key
            ? 'px-4 py-2 text-sm font-medium text-brand-600 border-b-2 border-brand-600'
            : 'px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700'">
          {{ tab.label }}
        </button>
}
      </div>

      @if (loading) {
<ui-loading-spinner text="Loading archive..."></ui-loading-spinner>
}

      @if (error) {
<div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">{{ error }}</div>
}
      @if (success) {
<div class="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-4">{{ success }}</div>
}

      <!-- ═══ Deleted Clients Tab ═══ -->
      @if (!loading && activeTab === 'clients') {

        @if (deletedClients.length > 0) {
<div class="card">
          <ui-data-table [columns]="clientColumns" [data]="deletedClients">
            <ng-template uiTableCell="clientName" let-row>
              <button class="text-brand-600 hover:underline font-medium" (click)="openClientDetail(row)">
                {{ row.clientName }}
              </button>
              <div class="text-xs text-gray-400">{{ row.clientCode }}</div>
            </ng-template>
            <ng-template uiTableCell="deletedAt" let-row>
              <span class="text-sm text-gray-600">{{ row.deletedAt | date:'mediumDate' }}</span>
            </ng-template>
            <ng-template uiTableCell="deleteReason" let-row>
              <span class="text-sm text-gray-500">{{ row.deleteReason || '—' }}</span>
            </ng-template>
            <ng-template uiTableCell="deletedByName" let-row>
              <span class="text-sm">{{ row.deletedByName || '—' }}</span>
            </ng-template>
            <ng-template uiTableCell="branchCount" let-row>
              <span class="text-sm">{{ row.branchCount }}</span>
            </ng-template>
            <ng-template uiTableCell="actions" let-row>
              <div class="flex gap-2 justify-end">
                <ui-button variant="primary" size="sm" (clicked)="openClientDetail(row)">View Data</ui-button>
                <ui-button variant="secondary" size="sm" (clicked)="restoreClient(row)">Restore</ui-button>
              </div>
            </ng-template>
          </ui-data-table>
        </div>
}
        @if (deletedClients.length === 0) {
<ui-empty-state title="No deleted clients" description="Deleted clients will appear here for up to 3 years." icon="archive"></ui-empty-state>
}
      
}

      <!-- ═══ Deleted Branches Tab ═══ -->
      @if (!loading && activeTab === 'branches') {

        @if (deletedBranches.length > 0) {
<div class="card">
          <ui-data-table [columns]="branchColumns" [data]="deletedBranches">
            <ng-template uiTableCell="branchName" let-row>
              <span class="font-medium">{{ row.branchName }}</span>
            </ng-template>
            <ng-template uiTableCell="clientName" let-row>
              <span class="text-sm text-gray-600">{{ row.clientName }} ({{ row.clientCode }})</span>
            </ng-template>
            <ng-template uiTableCell="deletedAt" let-row>
              <span class="text-sm text-gray-600">{{ row.deletedAt | date:'mediumDate' }}</span>
            </ng-template>
          </ui-data-table>
        </div>
}
        @if (deletedBranches.length === 0) {
<ui-empty-state title="No deleted branches" description="Deleted branches will appear here for up to 3 years." icon="archive"></ui-empty-state>
}
      
}

      <!-- ═══ Retention Snapshots Tab (18-month JSONB archive) ═══ -->
      @if (!loading && activeTab === 'retention') {

        @if (retentionSnapshots.length > 0) {
<div class="card">
          <ui-data-table [columns]="retentionColumns" [data]="retentionSnapshots">
            <ng-template uiTableCell="clientName" let-row>
              <button class="text-brand-600 hover:underline font-medium" (click)="openRetentionDetail(row)">
                {{ row.clientName }}
              </button>
              <div class="text-xs text-gray-400">{{ row.clientCode }}</div>
            </ng-template>
            <ng-template uiTableCell="archivedAt" let-row>
              <span class="text-sm text-gray-600">{{ row.archivedAt | date:'mediumDate' }}</span>
            </ng-template>
            <ng-template uiTableCell="purgeAfter" let-row>
              <span class="text-sm" [class.text-red-600]="row.daysRemaining < 30">
                {{ row.purgeAfter | date:'mediumDate' }}
              </span>
              <div class="text-xs text-gray-400">{{ row.daysRemaining }} days left</div>
            </ng-template>
            <ng-template uiTableCell="counts" let-row>
              <div class="text-xs space-y-0.5">
                <div>Registers: <strong>{{ row.registersCount }}</strong></div>
                <div>Payroll runs: <strong>{{ row.payrollRunsCount }}</strong></div>
                <div>Audit reports: <strong>{{ row.auditReportsCount }}</strong></div>
                <div>Contractors: <strong>{{ row.contractorsCount }}</strong></div>
              </div>
            </ng-template>
            <ng-template uiTableCell="actions" let-row>
              <ui-button variant="primary" size="sm" (clicked)="openRetentionDetail(row)">View Snapshot</ui-button>
            </ng-template>
          </ui-data-table>
        </div>
}
        @if (retentionSnapshots.length === 0) {
<ui-empty-state title="No retention snapshots"
          description="JSONB snapshots of deleted clients (registers, payroll, audit reports, contractors) appear here. Retained for 18 months from deletion date."
          icon="archive"></ui-empty-state>
}
      
}

      <!-- ═══ Deleted Users Tab ═══ -->
      @if (!loading && activeTab === 'users') {

        @if (deletedUsers.length > 0) {
<div class="card">
          <ui-data-table [columns]="userColumns" [data]="deletedUsers">
            <ng-template uiTableCell="name" let-row>
              <span class="font-medium">{{ row.name }}</span>
            </ng-template>
            <ng-template uiTableCell="email" let-row>
              <span class="text-sm text-gray-600">{{ row.email }}</span>
            </ng-template>
            <ng-template uiTableCell="roleName" let-row>
              <span class="text-sm">{{ row.roleName || row.roleCode }}</span>
            </ng-template>
            <ng-template uiTableCell="clientName" let-row>
              <span class="text-sm text-gray-600">{{ row.clientName || '—' }}</span>
            </ng-template>
            <ng-template uiTableCell="deletedAt" let-row>
              <span class="text-sm text-gray-600">{{ row.deletedAt | date:'mediumDate' }}</span>
            </ng-template>
          </ui-data-table>
        </div>
}
        @if (deletedUsers.length === 0) {
<ui-empty-state title="No deleted users" description="Deleted users will appear here for up to 3 years." icon="archive"></ui-empty-state>
}
      
}

      <!-- ═══ Retention Snapshot Detail Drawer ═══ -->
      @if (selectedSnapshot) {
<div class="fixed inset-0 z-50 flex justify-end">
        <div class="absolute inset-0 bg-black/30" (click)="closeRetentionDetail()"></div>
        <div class="relative w-full max-w-4xl bg-white shadow-xl overflow-y-auto">
          <div class="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between z-10">
            <div>
              <h2 class="text-lg font-semibold text-gray-900">{{ selectedSnapshot.clientName }}</h2>
              <p class="text-sm text-gray-500">
                Archived {{ selectedSnapshot.archivedAt | date:'medium' }} · Purges {{ selectedSnapshot.purgeAfter | date:'mediumDate' }}
                · {{ selectedSnapshot.clientCode }}
              </p>
            </div>
            <button (click)="closeRetentionDetail()" class="text-gray-400 hover:text-gray-600 p-1">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>

          <div class="px-6 py-4">
            <div class="flex border-b border-gray-200 mb-4">
              @for (st of snapshotTabs; track st) {
<button (click)="snapshotTab = st.key"
                [class]="snapshotTab === st.key
                  ? 'px-3 py-2 text-sm font-medium text-brand-600 border-b-2 border-brand-600'
                  : 'px-3 py-2 text-sm font-medium text-gray-500 hover:text-gray-700'">
                {{ st.label }}
              </button>
}
            </div>

            @if (snapshotLoading) {
<ui-loading-spinner text="Loading snapshot..."></ui-loading-spinner>
}

            @if (!snapshotLoading && snapshotDetail) {
<div>
              
@switch (snapshotTab) {
                @case ('registers') {

                  <ng-container *ngTemplateOutlet="jsonTable; context: { $implicit: snapshotDetail.registersSnapshot, empty: 'No registers archived.' }"></ng-container>
                
}
                @case ('payroll') {

                  <h3 class="text-sm font-semibold text-gray-700 mb-2">Payroll Runs</h3>
                  <ng-container *ngTemplateOutlet="jsonTable; context: { $implicit: snapshotDetail.payrollSnapshot?.runs, empty: 'No payroll runs archived.' }"></ng-container>
                  <h3 class="text-sm font-semibold text-gray-700 mt-6 mb-2">Run Employees ({{ snapshotDetail.payrollSnapshot?.runEmployees?.length || 0 }})</h3>
                  <ng-container *ngTemplateOutlet="jsonTable; context: { $implicit: snapshotDetail.payrollSnapshot?.runEmployees, empty: 'No payroll employees archived.' }"></ng-container>
                
}
                @case ('audits') {

                  <h3 class="text-sm font-semibold text-gray-700 mb-2">Audit Reports</h3>
                  <ng-container *ngTemplateOutlet="jsonTable; context: { $implicit: snapshotDetail.auditReportsSnapshot?.reports, empty: 'No audit reports archived.' }"></ng-container>
                  <h3 class="text-sm font-semibold text-gray-700 mt-6 mb-2">Non-Compliance Points</h3>
                  <ng-container *ngTemplateOutlet="jsonTable; context: { $implicit: snapshotDetail.auditReportsSnapshot?.nonCompliances, empty: 'No non-compliance points archived.' }"></ng-container>
                
}
                @case ('contractors') {

                  <h3 class="text-sm font-semibold text-gray-700 mb-2">Contractor Accounts</h3>
                  <ng-container *ngTemplateOutlet="jsonTable; context: { $implicit: snapshotDetail.contractorsSnapshot?.accounts, empty: 'No contractor accounts archived.' }"></ng-container>
                  <h3 class="text-sm font-semibold text-gray-700 mt-6 mb-2">Contractor Employees (with deployment / termination dates)</h3>
                  <ng-container *ngTemplateOutlet="jsonTable; context: { $implicit: snapshotDetail.contractorsSnapshot?.employees, empty: 'No contractor employees archived.' }"></ng-container>
                  <h3 class="text-sm font-semibold text-gray-700 mt-6 mb-2">Per-Contractor NC Summary</h3>
                  <ng-container *ngTemplateOutlet="jsonTable; context: { $implicit: snapshotDetail.contractorsSnapshot?.ncSummary, empty: 'No NC summary archived.' }"></ng-container>
                
}
                @case ('meta') {

                  <pre class="text-xs bg-gray-50 border rounded p-3 overflow-x-auto">{{ snapshotDetail.meta | json }}</pre>
                
}
              }

            </div>
}

            <ng-template #jsonTable let-rows let-empty="empty">
              @if (!rows || rows.length === 0) {
<div class="text-sm text-gray-500 italic py-4">{{ empty }}</div>
}
              @if (rows && rows.length > 0) {
<div class="overflow-x-auto">
                <table class="min-w-full text-xs border">
                  <thead class="bg-gray-50">
                    <tr>
                      @for (k of keysOf(rows[0]); track k) {
<th class="text-left py-2 px-3 font-medium text-gray-600 uppercase border-b">{{ humanizeKey(k) }}</th>
}
                    </tr>
                  </thead>
                  <tbody>
                    @for (r of rows; track r) {
<tr class="border-b border-gray-100 hover:bg-gray-50">
                      @for (k of keysOf(rows[0]); track k) {
<td class="py-1.5 px-3 text-gray-700 align-top">{{ formatCell(r[k]) }}</td>
}
                    </tr>
}
                  </tbody>
                </table>
              </div>
}
            </ng-template>
          </div>
        </div>
      </div>
}

      <!-- ═══ Client Detail Drawer ═══ -->
      @if (selectedClient) {
<div class="fixed inset-0 z-50 flex justify-end">
        <div class="absolute inset-0 bg-black/30" (click)="closeDetail()"></div>
        <div class="relative w-full max-w-3xl bg-white shadow-xl overflow-y-auto">
          <div class="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between z-10">
            <div>
              <h2 class="text-lg font-semibold text-gray-900">{{ selectedClient.clientName }}</h2>
              <p class="text-sm text-gray-500">Deleted {{ selectedClient.deletedAt | date:'mediumDate' }} · {{ selectedClient.clientCode }}</p>
            </div>
            <button (click)="closeDetail()" class="text-gray-400 hover:text-gray-600 p-1">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>

          <div class="px-6 py-4">
            <!-- Summary Cards -->
            @if (clientSummary) {
<div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              @for (s of summaryCards; track s) {
<div class="bg-gray-50 rounded-lg p-3 text-center">
                <div class="text-2xl font-bold text-gray-900">{{ s.count }}</div>
                <div class="text-xs text-gray-500 uppercase">{{ s.label }}</div>
              </div>
}
            </div>
}

            <!-- Detail Tabs -->
            <div class="flex border-b border-gray-200 mb-4">
              @for (dt of detailTabs; track dt) {
<button (click)="detailTab = dt.key; loadDetailData()"
                [class]="detailTab === dt.key
                  ? 'px-3 py-2 text-sm font-medium text-brand-600 border-b-2 border-brand-600'
                  : 'px-3 py-2 text-sm font-medium text-gray-500 hover:text-gray-700'">
                {{ dt.label }}
              </button>
}
            </div>

            @if (detailLoading) {
<ui-loading-spinner text="Loading..."></ui-loading-spinner>
}

            <!-- Detail Data Table -->
            @if (!detailLoading && detailData.length > 0) {
<div class="overflow-x-auto">
              <table class="min-w-full text-sm">
                <thead>
                  <tr class="border-b border-gray-200">
                    @for (col of detailDataColumns; track col) {
<th class="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">{{ col }}</th>
}
                  </tr>
                </thead>
                <tbody>
                  @for (row of detailData; track row) {
<tr class="border-b border-gray-100 hover:bg-gray-50">
                    @for (col of detailDataKeys; track col) {
<td class="py-2 px-3 text-gray-700">{{ formatCell(row[col]) }}</td>
}
                  </tr>
}
                </tbody>
              </table>
            </div>
}
            @if (!detailLoading && detailData.length === 0) {
<ui-empty-state title="No data" [description]="'No ' + detailTab + ' found for this client.'" icon="folder-open"></ui-empty-state>
}
          </div>
        </div>
      </div>
}
    </div>
  `,
})
export class AdminArchiveComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private base = '/api/v1/admin/archive';

  loading = false;
  error = '';
  success = '';
  activeTab = 'clients';

  tabs = [
    { key: 'clients', label: 'Deleted Clients' },
    { key: 'branches', label: 'Deleted Branches' },
    { key: 'users', label: 'Deleted Users' },
    { key: 'retention', label: 'Retention Snapshots' },
  ];

  deletedClients: any[] = [];
  deletedBranches: any[] = [];
  deletedUsers: any[] = [];
  retentionSnapshots: any[] = [];

  retentionColumns: TableColumn[] = [
    { key: 'clientName', header: 'Client', sortable: true },
    { key: 'archivedAt', header: 'Archived On', sortable: true },
    { key: 'purgeAfter', header: 'Purges On', sortable: true },
    { key: 'counts', header: 'Snapshot Contents' },
    { key: 'archivedByName', header: 'Archived By' },
    { key: 'actions', header: '', width: '160px', align: 'right' },
  ];

  // Retention snapshot detail
  selectedSnapshot: any = null;
  snapshotDetail: any = null;
  snapshotLoading = false;
  snapshotTab: string = 'registers';
  snapshotTabs = [
    { key: 'registers', label: 'Registers' },
    { key: 'payroll', label: 'Payroll' },
    { key: 'audits', label: 'Audit Reports & NC' },
    { key: 'contractors', label: 'Contractors' },
    { key: 'meta', label: 'Meta' },
  ];

  clientColumns: TableColumn[] = [
    { key: 'clientName', header: 'Client', sortable: true },
    { key: 'deletedAt', header: 'Deleted On', sortable: true },
    { key: 'deleteReason', header: 'Reason' },
    { key: 'deletedByName', header: 'Deleted By' },
    { key: 'branchCount', header: 'Branches', align: 'center' },
    { key: 'actions', header: '', width: '200px', align: 'right' },
  ];

  branchColumns: TableColumn[] = [
    { key: 'branchName', header: 'Branch Name', sortable: true },
    { key: 'branchType', header: 'Type' },
    { key: 'clientName', header: 'Client' },
    { key: 'deletedAt', header: 'Deleted On', sortable: true },
    { key: 'deleteReason', header: 'Reason' },
  ];

  userColumns: TableColumn[] = [
    { key: 'name', header: 'Name', sortable: true },
    { key: 'email', header: 'Email' },
    { key: 'roleName', header: 'Role' },
    { key: 'clientName', header: 'Client' },
    { key: 'deletedAt', header: 'Deleted On', sortable: true },
  ];

  // Detail drawer
  selectedClient: any = null;
  clientSummary: any = null;
  summaryCards: { label: string; count: number }[] = [];
  detailTab = 'documents';
  detailLoading = false;
  detailData: any[] = [];
  detailDataColumns: string[] = [];
  detailDataKeys: string[] = [];

  detailTabs = [
    { key: 'documents', label: 'Documents' },
    { key: 'audits', label: 'Audit Reports' },
    { key: 'returns', label: 'Returns & Filings' },
    { key: 'registers', label: 'Registers' },
  ];

  constructor(
    private http: HttpClient,
    private cdr: ChangeDetectorRef,
    private dialog: ConfirmDialogService,
    private toast: ToastService,
  ) {}

  ngOnInit() {
    this.loadTab();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadTab() {
    this.error = '';
    this.success = '';
    this.loading = true;

    this.http.get<any[]>(`${this.base}/${this.activeTab}`).pipe(
      timeout(10000),
      takeUntil(this.destroy$),
      finalize(() => { this.loading = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (data) => {
        if (this.activeTab === 'clients') this.deletedClients = data || [];
        else if (this.activeTab === 'branches') this.deletedBranches = data || [];
        else if (this.activeTab === 'users') this.deletedUsers = data || [];
        else if (this.activeTab === 'retention') this.retentionSnapshots = data || [];
        this.cdr.detectChanges();
      },
      error: () => {
        this.error = 'Failed to load archive data';
        this.cdr.detectChanges();
      },
    });
  }

  openRetentionDetail(row: any) {
    this.selectedSnapshot = row;
    this.snapshotDetail = null;
    this.snapshotTab = 'registers';
    this.snapshotLoading = true;
    this.http.get<any>(`${this.base}/retention/${row.id}`).pipe(
      timeout(15000),
      takeUntil(this.destroy$),
      finalize(() => { this.snapshotLoading = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (res) => { this.snapshotDetail = res; this.cdr.detectChanges(); },
      error: () => { this.error = 'Failed to load snapshot'; this.cdr.detectChanges(); },
    });
  }

  closeRetentionDetail() {
    this.selectedSnapshot = null;
    this.snapshotDetail = null;
  }

  keysOf(obj: any): string[] {
    return obj && typeof obj === 'object' ? Object.keys(obj) : [];
  }

  humanizeKey(key: string): string {
    return this.humanize(key);
  }

  openClientDetail(client: any) {
    this.selectedClient = client;
    this.detailTab = 'documents';
    this.detailData = [];
    this.clientSummary = null;
    this.summaryCards = [];

    // Load summary
    this.http.get<any>(`${this.base}/clients/${client.id}/summary`).pipe(
      takeUntil(this.destroy$),
    ).subscribe({
      next: (res) => {
        this.clientSummary = res.counts;
        this.summaryCards = [
          { label: 'Branches', count: res.counts?.branches ?? 0 },
          { label: 'Compliance Tasks', count: res.counts?.complianceTasks ?? 0 },
          { label: 'Audits', count: res.counts?.audits ?? 0 },
          { label: 'Returns', count: res.counts?.returns ?? 0 },
          { label: 'Documents', count: res.counts?.documents ?? 0 },
          { label: 'Safety Docs', count: res.counts?.safetyDocs ?? 0 },
          { label: 'Branch Docs', count: res.counts?.branchDocs ?? 0 },
          { label: 'Registers', count: res.counts?.registers ?? 0 },
        ].filter(s => s.count > 0);
        this.cdr.detectChanges();
      },
    });

    this.loadDetailData();
  }

  closeDetail() {
    this.selectedClient = null;
  }

  loadDetailData() {
    if (!this.selectedClient) return;
    this.detailLoading = true;
    this.detailData = [];

    let url = '';
    if (this.detailTab === 'documents') url = `${this.base}/clients/${this.selectedClient.id}/documents`;
    else if (this.detailTab === 'audits') url = `${this.base}/clients/${this.selectedClient.id}/audits`;
    else if (this.detailTab === 'returns') url = `${this.base}/clients/${this.selectedClient.id}/returns`;
    else if (this.detailTab === 'registers') url = `${this.base}/clients/${this.selectedClient.id}/registers`;

    this.http.get<any[]>(url).pipe(
      timeout(10000),
      takeUntil(this.destroy$),
      finalize(() => { this.detailLoading = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (rows) => {
        this.detailData = rows || [];
        if (this.detailData.length > 0) {
          this.detailDataKeys = Object.keys(this.detailData[0]).filter(k => k !== 'id');
          this.detailDataColumns = this.detailDataKeys.map(k => this.humanize(k));
        } else {
          this.detailDataKeys = [];
          this.detailDataColumns = [];
        }
        this.cdr.detectChanges();
      },
      error: () => {
        this.detailLoading = false;
        this.cdr.detectChanges();
      },
    });
  }

  async restoreClient(client: any) {
    if (!(await this.dialog.confirm('Restore Client', `Restore "${client.clientName}" and make it active again?`))) return;

    this.http.post(`${this.base}/clients/${client.id}/restore`, {}).pipe(
      takeUntil(this.destroy$),
    ).subscribe({
      next: () => {
        this.toast.success('Client restored successfully');
        this.success = `Client "${client.clientName}" restored`;
        this.loadTab();
      },
      error: (e: any) => {
        this.error = e?.error?.message || 'Failed to restore client';
        this.cdr.detectChanges();
      },
    });
  }

  formatCell(val: any): string {
    if (val == null) return '—';
    if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(val)) {
      return new Date(val).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
    }
    return String(val);
  }

  private humanize(key: string): string {
    return key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()).trim();
  }
}
