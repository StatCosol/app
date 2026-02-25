import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, of } from 'rxjs';
import { catchError, debounceTime, finalize, switchMap, takeUntil, timeout } from 'rxjs/operators';
import { PayrollApiService, PayrollClient } from './payroll-api.service';
import { PayrollRunsService, PayrollRunSummary, PayrollRunEmployeeRow } from './payroll-runs.service';
import { PayrollSetupApiService } from './payroll-setup-api.service';
import { 
  PageHeaderComponent, 
  DataTableComponent, 
  TableColumn, 
  TableCellDirective, 
  FormSelectComponent, 
  FormInputComponent,
  SelectOption,
  ActionButtonComponent,
  StatusBadgeComponent,
  EmptyStateComponent,
  LoadingSpinnerComponent
} from '../../shared/ui';

@Component({
  selector: 'app-payroll-runs',
  standalone: true,
  imports: [
    CommonModule, 
    FormsModule, 
    PageHeaderComponent, 
    DataTableComponent, 
    TableCellDirective,
    FormSelectComponent, 
    FormInputComponent,
    ActionButtonComponent,
    StatusBadgeComponent,
    EmptyStateComponent,
    LoadingSpinnerComponent
  ],
  template: `
    <div class="page">
      <ui-page-header 
        title="Payroll Runs" 
        description="Manage payroll processing and employee data" 
        icon="currency-dollar">
      </ui-page-header>

      <!-- Filters -->
      <div class="bg-white rounded-xl border border-gray-200 p-6 mb-6 shadow-sm">
        <h3 class="text-lg font-semibold text-gray-900 mb-4">Filters</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <ui-form-select
            label="Client"
            [options]="clientOptions"
            [(ngModel)]="filters.clientId"
            (ngModelChange)="reloadRuns()"
            placeholder="All Clients">
          </ui-form-select>

          <ui-form-input
            label="Year"
            type="number"
            [(ngModel)]="filters.periodYear"
            (ngModelChange)="reloadRuns()">
          </ui-form-input>

          <ui-form-input
            label="Month"
            type="number"
            [(ngModel)]="filters.periodMonth"
            (ngModelChange)="reloadRuns()"
            placeholder="1-12">
          </ui-form-input>

          <ui-form-select
            label="Status"
            [options]="statusOptions"
            [(ngModel)]="filters.status"
            (ngModelChange)="reloadRuns()"
            placeholder="All Statuses">
          </ui-form-select>
        </div>
      </div>

      <!-- Error Display -->
      <div *ngIf="error" class="mb-6">
        <ui-empty-state
          title="Error"
          [description]="error">
        </ui-empty-state>
      </div>

      <!-- Create Run Card -->
      <div class="bg-white rounded-xl border border-gray-200 p-6 mb-6 shadow-sm">
        <h3 class="text-lg font-semibold text-gray-900 mb-4">Create Payroll Run</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <ui-form-select
            label="Client"
            [options]="clientOptions"
            [(ngModel)]="newRun.clientId"
            placeholder="Select client"
            [required]="true">
          </ui-form-select>

          <ui-form-input
            label="Year"
            type="number"
            [(ngModel)]="newRun.periodYear"
            [required]="true">
          </ui-form-input>

          <ui-form-input
            label="Month"
            type="number"
            [(ngModel)]="newRun.periodMonth"
            placeholder="1-12"
            [required]="true">
          </ui-form-input>

          <ui-form-input
            label="Title"
            [(ngModel)]="newRun.title"
            placeholder="Payroll Run">
          </ui-form-input>

          <div class="flex flex-col gap-1.5">
            <label class="block text-sm font-medium text-gray-700">Employees Sheet</label>
            <input 
              type="file" 
              (change)="onRunFileSelected($event)"
              class="block w-full text-sm text-gray-900 border border-gray-300 rounded-lg cursor-pointer bg-white focus:outline-none p-2" />
          </div>
        </div>
        
        <div class="mt-4 flex items-center gap-3">
          <ui-button 
            variant="primary" 
            [disabled]="creatingRun" 
            [loading]="creatingRun"
            (clicked)="createRun()">
            {{ creatingRun ? 'Creating...' : 'Create Run' }}
          </ui-button>
          <span *ngIf="createError" class="text-sm text-error-600">{{ createError }}</span>
        </div>
      </div>

      <!-- Runs Table -->
      <div class="bg-white rounded-xl border border-gray-200 p-6 mb-6 shadow-sm">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-semibold text-gray-900">Payroll Runs</h3>
          <ui-button variant="secondary" [disabled]="loadingRuns" (clicked)="reloadRuns()">
            Refresh
          </ui-button>
        </div>

        <ui-loading-spinner *ngIf="loadingRuns" text="Loading runs..." size="lg"></ui-loading-spinner>

        <ui-empty-state
          *ngIf="!loadingRuns && runs.length === 0"
          title="No Runs Found"
          description="No payroll runs match the selected filters.">
        </ui-empty-state>

        <ui-data-table
          *ngIf="!loadingRuns && runs.length > 0"
          [columns]="runColumns"
          [data]="runs"
          [loading]="loadingRuns"
          emptyMessage="No runs found.">
          
          <ng-template uiTableCell="period" let-row>
            <span class="text-sm text-gray-700">{{ two(row.periodMonth) }}/{{ row.periodYear }}</span>
          </ng-template>

          <ng-template uiTableCell="client" let-row>
            <div class="font-medium text-gray-900">{{ row.clientName || clientName(row.clientId) }}</div>
          </ng-template>

          <ng-template uiTableCell="status" let-row>
            <ui-status-badge [status]="row.status"></ui-status-badge>
          </ng-template>

          <ng-template uiTableCell="employeeCount" let-row>
            <span class="text-sm text-gray-700">{{ row.employeeCount ?? '-' }}</span>
          </ng-template>

          <ng-template uiTableCell="actions" let-row>
            <div class="flex items-center gap-2">
              <ui-button size="sm" variant="secondary" (clicked)="openRun(row.id)">View</ui-button>
              <ui-button size="sm" variant="secondary" (clicked)="downloadZip(row.id)">ZIP</ui-button>
              <ui-button 
                size="sm" 
                variant="ghost" 
                [disabled]="archivingRunId===row.id"
                (clicked)="archiveRun(row.id)">
                {{ archivingRunId===row.id ? 'Archiving...' : 'Archive' }}
              </ui-button>
            </div>
          </ng-template>
        </ui-data-table>
      </div>

      <!-- Run Employees Table -->
      <div *ngIf="selectedRunId" class="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-semibold text-gray-900">Run Employees</h3>
          <ui-button variant="secondary" [disabled]="loadingEmployees" (clicked)="loadEmployees()">
            Refresh
          </ui-button>
        </div>

        <!-- Processing Actions -->
        <div class="processing-bar">
          <div class="flex flex-col gap-1.5">
            <label class="block text-sm font-medium text-gray-700">Upload Breakup (Excel)</label>
            <input
              type="file"
              (change)="onBreakupFileSelected($event)"
              accept=".xlsx,.xls,.csv"
              class="block w-full text-sm text-gray-900 border border-gray-300 rounded-lg cursor-pointer bg-white focus:outline-none p-2" />
          </div>
          <ui-button
            size="sm"
            variant="primary"
            [disabled]="!breakupFile || uploadingBreakup"
            (clicked)="uploadBreakup()">
            {{ uploadingBreakup ? 'Uploading...' : 'Upload Breakup' }}
          </ui-button>
          <ui-button
            size="sm"
            variant="primary"
            [disabled]="processingRun"
            (clicked)="processRun()">
            {{ processingRun ? 'Processing...' : 'Process Run' }}
          </ui-button>
          <ui-button size="sm" variant="secondary" (clicked)="generatePfEcr()">PF ECR</ui-button>
          <ui-button size="sm" variant="secondary" (clicked)="generateEsi()">ESI File</ui-button>
        </div>
        <div *ngIf="processingMsg" class="text-sm mt-2" [class.text-green-600]="!processingError" [class.text-red-600]="processingError">
          {{ processingMsg }}
        </div>

        <ui-loading-spinner *ngIf="loadingEmployees" text="Loading employees..." size="lg"></ui-loading-spinner>

        <ui-empty-state
          *ngIf="!loadingEmployees && employees.length === 0"
          title="No Employees"
          description="No employees found for this payroll run.">
        </ui-empty-state>

        <ui-data-table
          *ngIf="!loadingEmployees && employees.length > 0"
          [columns]="employeeColumns"
          [data]="employees"
          [loading]="loadingEmployees"
          emptyMessage="No employees loaded.">
          
          <ng-template uiTableCell="employee" let-row>
            <div class="font-medium text-gray-900">{{ row.employeeName || row.empCode || 'Employee' }}</div>
            <div *ngIf="row.empCode" class="text-xs text-gray-500 mt-0.5">Code: {{ row.empCode }}</div>
          </ng-template>

          <ng-template uiTableCell="grossEarnings" let-row>
            <span class="text-sm text-gray-700">{{ money(row.grossEarnings) }}</span>
          </ng-template>

          <ng-template uiTableCell="totalDeductions" let-row>
            <span class="text-sm text-gray-700">{{ money(row.totalDeductions) }}</span>
          </ng-template>

          <ng-template uiTableCell="netPay" let-row>
            <span class="text-sm font-semibold text-gray-900">{{ money(row.netPay) }}</span>
          </ng-template>

          <ng-template uiTableCell="actions" let-row>
            <div class="flex items-center gap-2">
              <ui-button size="sm" variant="secondary" (clicked)="downloadPayslipPdf(selectedRunId!, row.employeeId)">
                PDF
              </ui-button>
              <ui-button size="sm" variant="ghost" (clicked)="downloadArchivedPayslipPdf(selectedRunId!, row.employeeId)">
                Archived
              </ui-button>
            </div>
          </ng-template>
        </ui-data-table>
      </div>
    </div>
  `,
  styles: [
    `
      .page { max-width: 1280px; margin: 0 auto; padding: 1rem; }
      .processing-bar { display: flex; gap: 0.75rem; align-items: flex-end; flex-wrap: wrap; padding: 0.75rem; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 0.5rem; margin-bottom: 1rem; }
    `,
  ],
})
export class PayrollRunsComponent implements OnInit, OnDestroy {
  clients: PayrollClient[] = [];
  runs: PayrollRunSummary[] = [];
  employees: PayrollRunEmployeeRow[] = [];

  loadingRuns = false;
  loadingEmployees = false;
  archivingRunId: string | null = null;
  error = '';
  createError = '';
  creatingRun = false;
  runFile: File | null = null;

  clientOptions: SelectOption[] = [{ value: null, label: 'Select client' }];
  statusOptions: SelectOption[] = [
    { value: null, label: 'All Statuses' },
    { value: 'DRAFT', label: 'Draft' },
    { value: 'IN_PROGRESS', label: 'In Progress' },
    { value: 'SUBMITTED', label: 'Submitted' },
    { value: 'APPROVED', label: 'Approved' },
    { value: 'COMPLETED', label: 'Completed' },
  ];

  // Processing state
  breakupFile: File | null = null;
  uploadingBreakup = false;
  processingRun = false;
  processingMsg = '';
  processingError = false;

  selectedRunId: string | null = null;

  runColumns: TableColumn[] = [
    { key: 'period', header: 'Period', sortable: true, width: '100px' },
    { key: 'client', header: 'Client', sortable: true },
    { key: 'status', header: 'Status', sortable: true, width: '140px', align: 'center' },
    { key: 'employeeCount', header: 'Employees', sortable: true, width: '100px', align: 'right' },
    { key: 'actions', header: 'Actions', sortable: false, width: '260px' },
  ];

  employeeColumns: TableColumn[] = [
    { key: 'employee', header: 'Employee', sortable: true },
    { key: 'grossEarnings', header: 'Gross', sortable: true, width: '120px', align: 'right' },
    { key: 'totalDeductions', header: 'Deductions', sortable: true, width: '120px', align: 'right' },
    { key: 'netPay', header: 'Net Pay', sortable: true, width: '120px', align: 'right' },
    { key: 'actions', header: 'Payslip', sortable: false, width: '180px' },
  ];

  filters: { clientId: string | null; periodYear: number | null; periodMonth: number | null; status: string | null } = {
    clientId: null,
    periodYear: null,
    periodMonth: null,
    status: null,
  };

  newRun: { clientId: string | null; periodYear: number; periodMonth: number; title: string } = {
    clientId: null,
    periodYear: new Date().getFullYear(),
    periodMonth: new Date().getMonth() + 1,
    title: '',
  };

  private reload$ = new Subject<void>();
  private employeesReload$ = new Subject<string>();
  private destroy$ = new Subject<void>();
  private initialLoadDone = false;

  constructor(private payrollApi: PayrollApiService, private runsApi: PayrollRunsService, private setupApi: PayrollSetupApiService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    console.log('PayrollRuns ngOnInit - loading clients and runs');

    // Subscribe to reload$ for user-triggered filter changes (debounced)
    this.reload$
      .pipe(
        debounceTime(300),
        switchMap(() => this.fetchRuns$()),
        takeUntil(this.destroy$),
      )
      .subscribe({
        next: (rows) => {
          console.log('PayrollRuns loaded:', rows);
          this.runs = rows || [];
          this.loadingRuns = false;
          this.cdr.detectChanges();
        },
        error: (err) => {
          console.error('PayrollRuns reload$ error:', err);
          this.loadingRuns = false;
          this.runs = [];
          this.cdr.detectChanges();
        },
      });

    this.employeesReload$
      .pipe(
        debounceTime(50),
        switchMap((runId) => {
          this.error = '';
          this.loadingEmployees = true;
          return this.runsApi
            .listRunEmployees(runId)
            .pipe(
              timeout(10000),
              catchError((e) => {
                console.error('PayrollRuns employees error:', e);
                this.error = e?.error?.message || 'Unable to load run employees';
                return of([] as PayrollRunEmployeeRow[]);
              }),
              finalize(() => {
                this.loadingEmployees = false;
              }),
            );
        }),
        takeUntil(this.destroy$),
      )
      .subscribe({
        next: (rows) => {
          this.employees = rows || [];
        },
        error: (err) => {
          console.error('PayrollRuns employeesReload$ error:', err);
          this.loadingEmployees = false;
          this.employees = [];
          this.error = err?.error?.message || 'Unable to load employees';
        },
      });
    this.payrollApi.getAssignedClients().pipe(takeUntil(this.destroy$)).subscribe({
      next: (list) => {
        console.log('PayrollRuns clients loaded:', list);
        this.clients = list || [];
        this.clientOptions = [
          { value: null, label: 'Select client' },
          ...this.clients.map(c => ({ value: c.id, label: c.name })),
        ];
      },
      error: (e) => {
        console.error('PayrollRuns error loading clients:', e);
        this.error = `Unable to load clients. ${e?.error?.message || ''}`;
      },
    });

    // Direct initial load — not through the Subject so filter setup can't cancel it
    this.fetchRuns$().pipe(takeUntil(this.destroy$)).subscribe({
      next: (rows) => {
        console.log('PayrollRuns initial load:', rows);
        this.runs = rows || [];
        this.loadingRuns = false;
        this.cdr.detectChanges();
        // Defer initialLoadDone so template-init ngModelChange noise is blocked
        setTimeout(() => { this.initialLoadDone = true; });
      },
      error: (err) => {
        console.error('PayrollRuns initial load error:', err);
        this.loadingRuns = false;
        this.runs = [];
        this.cdr.detectChanges();
        setTimeout(() => { this.initialLoadDone = true; });
      },
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.reload$.complete();
    this.employeesReload$.complete();
  }

  reloadRuns(): void {
    // Skip reloads triggered by filter setup if initial load hasn't finished
    if (!this.initialLoadDone) return;
    console.log('PayrollRuns reloadRuns called with filters:', this.filters);
    this.reload$.next();
  }

  /** Shared observable factory for fetching runs */
  private fetchRuns$() {
    this.error = '';
    this.loadingRuns = true;
    return this.runsApi
      .listRuns({
        clientId: this.filters.clientId ?? undefined,
        periodYear: this.filters.periodYear ?? undefined,
        periodMonth: this.filters.periodMonth ?? undefined,
        status: this.filters.status ?? undefined,
      })
      .pipe(
        timeout(10000),
        catchError((e) => {
          console.error('PayrollRuns error:', e);
          this.error = e?.error?.message || `Unable to load runs. ${e?.message || ''}`;
          return of([] as PayrollRunSummary[]);
        }),
        finalize(() => {
          this.loadingRuns = false;
        }),
      );
  }

  openRun(runId: string): void {
    this.selectedRunId = runId;
    this.loadEmployees();
  }

  loadEmployees(): void {
    if (!this.selectedRunId) return;
    this.employeesReload$.next(this.selectedRunId); // switchMap handles cancellation
  }

  archiveRun(runId: string): void {
    this.archivingRunId = runId;
    this.runsApi.archiveRunPayslips(runId).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.archivingRunId = null;
      },
      error: (e) => {
        this.archivingRunId = null;
        this.error = e?.error?.message || 'Failed to archive payslips';
      },
    });
  }

  downloadZip(runId: string): void {
    this.runsApi.downloadPayslipsZip(runId).pipe(takeUntil(this.destroy$)).subscribe({
      next: (blob) => this.runsApi.saveBlob(blob, `payslips_${runId}.zip`),
      error: (e) => { this.error = e?.error?.message || 'Failed to download ZIP'; },
    });
  }

  downloadPayslipPdf(runId: string, employeeId: string): void {
    this.runsApi.downloadPayslipPdf(runId, employeeId).pipe(takeUntil(this.destroy$)).subscribe({
      next: (blob) => this.runsApi.saveBlob(blob, `payslip_${employeeId}.pdf`),
      error: (e) => { this.error = e?.error?.message || 'Failed to download PDF'; },
    });
  }

  onRunFileSelected(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.runFile = target.files && target.files.length ? target.files[0] : null;
  }

  createRun(): void {
    this.createError = '';
    if (!this.newRun.clientId || !this.newRun.periodYear || !this.newRun.periodMonth) {
      this.createError = 'Client, year, and month are required.';
      return;
    }
    this.creatingRun = true;
    this.runsApi
      .createRun({
        clientId: this.newRun.clientId,
        periodYear: this.newRun.periodYear,
        periodMonth: this.newRun.periodMonth,
        title: this.newRun.title || undefined,
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (run: any) => {
          if (this.runFile) {
            this.runsApi.uploadRunEmployeesFile(run.id, this.runFile).pipe(takeUntil(this.destroy$)).subscribe({
              next: () => {
                this.afterRunCreated();
              },
              error: (e) => {
                this.creatingRun = false;
                this.createError = e?.error?.message || 'Run created, but upload failed.';
                this.reloadRuns();
              },
            });
          } else {
            this.afterRunCreated();
          }
        },
        error: (e) => {
          this.creatingRun = false;
          this.createError = e?.error?.message || 'Failed to create payroll run.';
        },
      });
  }

  private afterRunCreated(): void {
    this.creatingRun = false;
    this.newRun = {
      clientId: null,
      periodYear: new Date().getFullYear(),
      periodMonth: new Date().getMonth() + 1,
      title: '',
    };
    this.runFile = null;
    this.reloadRuns();
  }

  downloadArchivedPayslipPdf(runId: string, employeeId: string): void {
    this.runsApi.downloadArchivedPayslipPdf(runId, employeeId).pipe(takeUntil(this.destroy$)).subscribe({
      next: (blob) => this.runsApi.saveBlob(blob, `payslip_${employeeId}_archived.pdf`),
      error: (e) => { this.error = e?.error?.message || 'Archived payslip not available'; },
    });
  }

  clientName(clientId: string): string {
    return this.clients.find((c) => c.id === clientId)?.name || clientId;
  }

  two(n: any): string {
    const v = Number(n ?? 0);
    return String(v).padStart(2, '0');
  }

  money(n: any): string {
    const v = Number(n ?? 0);
    if (!isFinite(v)) return '-';
    return v.toFixed(2);
  }

  // ── Processing Methods ──────────────────────────────────

  onBreakupFileSelected(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.breakupFile = target.files && target.files.length ? target.files[0] : null;
  }

  uploadBreakup(): void {
    if (!this.selectedRunId || !this.breakupFile) return;
    this.uploadingBreakup = true;
    this.processingMsg = '';
    this.processingError = false;
    this.setupApi.uploadBreakup(this.selectedRunId, this.breakupFile).pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.uploadingBreakup = false; }),
    ).subscribe({
      next: (res: any) => {
        this.processingMsg = `Breakup uploaded: ${res?.imported ?? 0} employees imported`;
        this.breakupFile = null;
        this.loadEmployees();
      },
      error: (e) => {
        this.processingMsg = e?.error?.message || 'Upload failed';
        this.processingError = true;
      },
    });
  }

  processRun(): void {
    if (!this.selectedRunId) return;
    this.processingRun = true;
    this.processingMsg = '';
    this.processingError = false;
    this.setupApi.processRun(this.selectedRunId).pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.processingRun = false; }),
    ).subscribe({
      next: (res: any) => {
        this.processingMsg = `Processed ${res?.processed ?? 0} employees. Status: ${res?.status ?? 'DONE'}`;
        this.loadEmployees();
        this.reloadRuns();
      },
      error: (e) => {
        this.processingMsg = e?.error?.message || 'Processing failed';
        this.processingError = true;
      },
    });
  }

  generatePfEcr(): void {
    if (!this.selectedRunId) return;
    this.setupApi.generatePfEcr(this.selectedRunId).pipe(takeUntil(this.destroy$)).subscribe({
      next: (blob) => this.runsApi.saveBlob(blob, `PF_ECR_${this.selectedRunId}.txt`),
      error: (e) => {
        this.processingMsg = e?.error?.message || 'PF ECR generation failed';
        this.processingError = true;
      },
    });
  }

  generateEsi(): void {
    if (!this.selectedRunId) return;
    this.setupApi.generateEsi(this.selectedRunId).pipe(takeUntil(this.destroy$)).subscribe({
      next: (blob) => this.runsApi.saveBlob(blob, `ESI_${this.selectedRunId}.txt`),
      error: (e) => {
        this.processingMsg = e?.error?.message || 'ESI generation failed';
        this.processingError = true;
      },
    });
  }
}
