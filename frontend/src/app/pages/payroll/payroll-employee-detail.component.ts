import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil, finalize } from 'rxjs/operators';
import { PayrollApiService, PayrollEmployeeDetail } from './payroll-api.service';
import {
  PageHeaderComponent,
  DataTableComponent,
  TableCellDirective,
  TableColumn,
  StatusBadgeComponent,
  EmptyStateComponent,
  LoadingSpinnerComponent,
} from '../../shared/ui';

type Tab = 'profile' | 'compliance' | 'history';

@Component({
  selector: 'app-payroll-employee-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    RouterModule,
    PageHeaderComponent,
    DataTableComponent,
    TableCellDirective,
    StatusBadgeComponent,
    EmptyStateComponent,
    LoadingSpinnerComponent,
  ],
  template: `
    <div class="max-w-5xl mx-auto px-4 sm:px-6 py-6">
      <!-- Header -->
      <div class="flex items-center gap-3 mb-6">
        <button (click)="goBack()" class="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
          </svg>
        </button>
        <ui-page-header
          [title]="emp ? emp.name : 'Employee Detail'"
          [subtitle]="emp ? (emp.employeeCode + ' · ' + emp.clientName) : 'Loading...'">
        </ui-page-header>
      </div>

      <ui-loading-spinner *ngIf="loading"></ui-loading-spinner>
      <ui-empty-state *ngIf="error && !loading" title="Error" [description]="error"></ui-empty-state>

      <ng-container *ngIf="emp && !loading">
        <!-- Status bar -->
        <div class="flex items-center gap-3 mb-6">
          <ui-status-badge [status]="emp.isActive ? 'ACTIVE' : 'INACTIVE'"></ui-status-badge>
          <span *ngIf="emp.designation" class="text-sm text-gray-500">{{ emp.designation }}</span>
          <span *ngIf="emp.department" class="text-sm text-gray-400">· {{ emp.department }}</span>
        </div>

        <!-- Tabs -->
        <div class="border-b border-gray-200 mb-6">
          <nav class="flex gap-6">
            <button *ngFor="let t of tabs"
              (click)="activeTab = t.key"
              class="pb-3 px-1 text-sm font-medium border-b-2 transition-colors"
              [class]="activeTab === t.key ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'">
              {{ t.label }}
            </button>
          </nav>
        </div>

        <!-- Profile Tab -->
        <div *ngIf="activeTab === 'profile'" class="space-y-6">
          <div class="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <h3 class="text-sm font-semibold text-gray-800 uppercase tracking-wider mb-4">Personal Information</h3>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              <div *ngFor="let field of personalFields">
                <span class="text-xs text-gray-500 uppercase tracking-wide">{{ field.label }}</span>
                <p class="text-sm font-medium text-gray-900 mt-0.5">{{ field.value || '-' }}</p>
              </div>
            </div>
          </div>

          <div class="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <h3 class="text-sm font-semibold text-gray-800 uppercase tracking-wider mb-4">Bank Details</h3>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div>
                <span class="text-xs text-gray-500 uppercase tracking-wide">Bank Name</span>
                <p class="text-sm font-medium text-gray-900 mt-0.5">{{ emp.bankName || '-' }}</p>
              </div>
              <div>
                <span class="text-xs text-gray-500 uppercase tracking-wide">Account Number</span>
                <p class="text-sm font-medium text-gray-900 mt-0.5">{{ emp.bankAccount || '-' }}</p>
              </div>
              <div>
                <span class="text-xs text-gray-500 uppercase tracking-wide">IFSC</span>
                <p class="text-sm font-medium text-gray-900 mt-0.5">{{ emp.ifsc || '-' }}</p>
              </div>
            </div>
          </div>

          <div class="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <h3 class="text-sm font-semibold text-gray-800 uppercase tracking-wider mb-4">Employment</h3>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div>
                <span class="text-xs text-gray-500 uppercase tracking-wide">Date of Joining</span>
                <p class="text-sm font-medium text-gray-900 mt-0.5">{{ emp.dateOfJoining | date:'dd/MM/yyyy' }}</p>
              </div>
              <div>
                <span class="text-xs text-gray-500 uppercase tracking-wide">Date of Exit</span>
                <p class="text-sm font-medium text-gray-900 mt-0.5">{{ emp.dateOfExit ? (emp.dateOfExit | date:'dd/MM/yyyy') : '-' }}</p>
              </div>
              <div>
                <span class="text-xs text-gray-500 uppercase tracking-wide">State Code</span>
                <p class="text-sm font-medium text-gray-900 mt-0.5">{{ emp.stateCode || '-' }}</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Compliance Tab -->
        <div *ngIf="activeTab === 'compliance'" class="space-y-6">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <!-- PF Card -->
            <div class="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
              <div class="flex items-center justify-between mb-4">
                <h3 class="text-sm font-semibold text-gray-800 uppercase tracking-wider">PF (Provident Fund)</h3>
                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                  [class]="emp.pfRegistered ? 'bg-green-100 text-green-700' : (emp.pfApplicable ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500')">
                  {{ emp.pfApplicable ? (emp.pfRegistered ? 'Registered' : 'Pending') : 'N/A' }}
                </span>
              </div>
              <div class="space-y-3">
                <div class="flex justify-between">
                  <span class="text-sm text-gray-500">Applicable</span>
                  <span class="text-sm font-medium">{{ emp.pfApplicable ? 'Yes' : 'No' }}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-sm text-gray-500">UAN</span>
                  <span class="text-sm font-medium">{{ emp.uan || '-' }}</span>
                </div>
                <div *ngIf="emp.pfApplicableFrom" class="flex justify-between">
                  <span class="text-sm text-gray-500">Applicable From</span>
                  <span class="text-sm font-medium">{{ emp.pfApplicableFrom | date:'dd/MM/yyyy' }}</span>
                </div>
                <div *ngIf="emp.pfServiceStartDate" class="flex justify-between">
                  <span class="text-sm text-gray-500">PF Service Start Date</span>
                  <span class="text-sm font-medium">{{ emp.pfServiceStartDate | date:'dd/MM/yyyy' }}</span>
                </div>
                <div *ngIf="emp.basicAtPfStart !== null && emp.basicAtPfStart !== undefined" class="flex justify-between">
                  <span class="text-sm text-gray-500">Basic at PF Start</span>
                  <span class="text-sm font-medium">₹{{ emp.basicAtPfStart | number:'1.2-2' }}</span>
                </div>
              </div>
            </div>

            <!-- ESI Card -->
            <div class="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
              <div class="flex items-center justify-between mb-4">
                <h3 class="text-sm font-semibold text-gray-800 uppercase tracking-wider">ESI (State Insurance)</h3>
                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                  [class]="emp.esiRegistered ? 'bg-green-100 text-green-700' : (emp.esiApplicable ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500')">
                  {{ emp.esiApplicable ? (emp.esiRegistered ? 'Registered' : 'Pending') : 'N/A' }}
                </span>
              </div>
              <div class="space-y-3">
                <div class="flex justify-between">
                  <span class="text-sm text-gray-500">Applicable</span>
                  <span class="text-sm font-medium">{{ emp.esiApplicable ? 'Yes' : 'No' }}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-sm text-gray-500">IP Number</span>
                  <span class="text-sm font-medium">{{ emp.esic || '-' }}</span>
                </div>
                <div *ngIf="emp.esiApplicableFrom" class="flex justify-between">
                  <span class="text-sm text-gray-500">Applicable From</span>
                  <span class="text-sm font-medium">{{ emp.esiApplicableFrom | date:'dd/MM/yyyy' }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Missing Data Alerts -->
          <div *ngIf="missingDataAlerts.length" class="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <h4 class="text-sm font-semibold text-amber-800 mb-2">Missing Data</h4>
            <ul class="space-y-1">
              <li *ngFor="let alert of missingDataAlerts" class="flex items-center gap-2 text-sm text-amber-700">
                <svg class="w-4 h-4 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                </svg>
                {{ alert }}
              </li>
            </ul>
          </div>
        </div>

        <!-- Payroll History Tab -->
        <div *ngIf="activeTab === 'history'">
          <ui-data-table
            [columns]="historyColumns"
            [data]="emp.runHistory || []"
            [loading]="false"
            emptyMessage="No payroll run history found for this employee.">

            <ng-template uiTableCell="period" let-row>
              <span class="text-sm font-medium text-gray-700">{{ formatPeriod(row.periodMonth, row.periodYear) }}</span>
            </ng-template>

            <ng-template uiTableCell="runStatus" let-row>
              <ui-status-badge [status]="row.runStatus || 'UNKNOWN'"></ui-status-badge>
            </ng-template>

            <ng-template uiTableCell="grossEarnings" let-row>
              <span class="text-sm text-gray-600">{{ row.grossEarnings !== null && row.grossEarnings !== undefined ? ('₹' + (row.grossEarnings | number:'1.0-0')) : '-' }}</span>
            </ng-template>

            <ng-template uiTableCell="totalDeductions" let-row>
              <span class="text-sm text-gray-600">{{ row.totalDeductions !== null && row.totalDeductions !== undefined ? ('₹' + (row.totalDeductions | number:'1.0-0')) : '-' }}</span>
            </ng-template>

            <ng-template uiTableCell="netPay" let-row>
              <span class="text-sm font-semibold text-gray-900">{{ row.netPay !== null && row.netPay !== undefined ? ('₹' + (row.netPay | number:'1.0-0')) : '-' }}</span>
            </ng-template>
          </ui-data-table>
        </div>
      </ng-container>
    </div>
  `,
})
export class PayrollEmployeeDetailComponent implements OnInit, OnDestroy {
  emp: PayrollEmployeeDetail | null = null;
  loading = false;
  error = '';
  activeTab: Tab = 'profile';
  private readonly destroy$ = new Subject<void>();

  tabs: { key: Tab; label: string }[] = [
    { key: 'profile', label: 'Profile' },
    { key: 'compliance', label: 'PF / ESI Compliance' },
    { key: 'history', label: 'Payroll History' },
  ];

  historyColumns: TableColumn[] = [
    { key: 'period', header: 'Period', sortable: true, width: '120px' },
    { key: 'runStatus', header: 'Status', sortable: true, width: '120px', align: 'center' },
    { key: 'grossEarnings', header: 'Gross', sortable: true, width: '120px', align: 'right' },
    { key: 'totalDeductions', header: 'Deductions', sortable: true, width: '120px', align: 'right' },
    { key: 'netPay', header: 'Net Pay', sortable: true, width: '120px', align: 'right' },
  ];

  get personalFields() {
    if (!this.emp) return [];
    return [
      { label: 'Name as per Aadhaar', value: this.emp.name },
      { label: 'DOB as per Aadhaar', value: this.emp.dateOfBirth },
      { label: 'Father Name', value: this.emp.fatherName },
      { label: 'Phone', value: this.emp.phone },
      { label: 'Email', value: this.emp.email },
      { label: 'Aadhaar', value: this.emp.aadhaar ? '****' + this.emp.aadhaar.slice(-4) : null },
      { label: 'PAN', value: this.emp.pan },
    ];
  }

  get missingDataAlerts(): string[] {
    if (!this.emp) return [];
    const alerts: string[] = [];
    if (this.emp.pfApplicable && !this.emp.pfRegistered) alerts.push('PF registration is pending');
    if (this.emp.pfApplicable && !this.emp.uan) alerts.push('UAN is missing');
    if (this.emp.esiApplicable && !this.emp.esiRegistered) alerts.push('ESI registration is pending');
    if (this.emp.esiApplicable && !this.emp.esic) alerts.push('ESIC IP Number is missing');
    if (!this.emp.pan) alerts.push('PAN number is missing');
    if (!this.emp.bankAccount) alerts.push('Bank account details are missing');
    return alerts;
  }

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private api: PayrollApiService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    const employeeId = this.route.snapshot.paramMap.get('employeeId');
    if (!employeeId) {
      this.error = 'Employee ID not provided';
      return;
    }
    this.loading = true;
    this.api.getEmployeeDetail(employeeId).pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.loading = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (emp) => { this.emp = emp; },
      error: (e) => { this.error = e?.error?.message || 'Failed to load employee'; },
    });
  }

  formatPeriod(month: number, year: number): string {
    return `${String(month).padStart(2, '0')}/${year}`;
  }

  goBack(): void {
    const clientId = this.route.snapshot.paramMap.get('clientId');
    if (clientId) {
      this.router.navigate(['/payroll/clients', clientId, 'employees']);
    } else {
      this.router.navigate(['/payroll/clients']);
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
