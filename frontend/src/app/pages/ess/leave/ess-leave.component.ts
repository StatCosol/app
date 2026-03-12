import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin, Subject } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';
import { EssApiService, LeaveBalance, LeavePolicy, LeaveApplication } from '../ess-api.service';
import { ToastService } from '../../../shared/toast/toast.service';
import {
  PageHeaderComponent,
  DataTableComponent,
  TableCellDirective,
  TableColumn,
  StatusBadgeComponent,
  EmptyStateComponent,
  LoadingSpinnerComponent,
  ActionButtonComponent,
  FormInputComponent,
  FormSelectComponent,
  SelectOption,
  ModalComponent,
} from '../../../shared/ui';

@Component({
  selector: 'app-ess-leave',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    PageHeaderComponent,
    DataTableComponent,
    TableCellDirective,
    StatusBadgeComponent,
    EmptyStateComponent,
    LoadingSpinnerComponent,
    ActionButtonComponent,
    FormInputComponent,
    FormSelectComponent,
    ModalComponent,
  ],
  templateUrl: './ess-leave.component.html',
})
export class EssLeaveComponent implements OnInit, OnDestroy {
  loading = false;
  balances: LeaveBalance[] = [];
  policies: LeavePolicy[] = [];
  applications: LeaveApplication[] = [];

  showApplyForm = false;
  submitting = false;
  applyError = '';
  applyForm: any = {};
  private readonly destroy$ = new Subject<void>();

  applicationColumns: TableColumn[] = [
    { key: 'leaveType', header: 'Type', sortable: true },
    { key: 'fromDate', header: 'From', sortable: true },
    { key: 'toDate', header: 'To', sortable: true },
    { key: 'totalDays', header: 'Days', align: 'right', sortable: true },
    { key: 'reason', header: 'Reason' },
    { key: 'status', header: 'Status', sortable: true },
    { key: 'actions', header: '', align: 'right' },
  ];

  leaveTypeOptions: SelectOption[] = [];

  constructor(private api: EssApiService, private cdr: ChangeDetectorRef, private toast: ToastService) {}

  ngOnInit(): void {
    this.loadAll();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadAll(): void {
    this.loading = true;
    forkJoin({
      balances: this.api.getLeaveBalances(),
      policies: this.api.getLeavePolicies(),
      applications: this.api.listLeaveApplications(),
    })
    .pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.loading = false; this.cdr.detectChanges(); }),
    )
    .subscribe({
      next: (data) => {
        this.loading = false;
        this.balances = data.balances;
        this.policies = data.policies;
        this.applications = data.applications;
        this.leaveTypeOptions = this.policies.map(p => ({
          value: p.leaveType,
          label: `${p.leaveName || p.leaveType} (${p.yearlyLimit} days/year)`,
        }));
      },
      error: () => {
        this.loading = false;
        this.balances = [];
        this.policies = [];
        this.applications = [];
      },
    });
  }

  openApplyForm(): void {
    this.applyError = '';
    this.applyForm = {
      leaveType: '',
      fromDate: '',
      toDate: '',
      reason: '',
    };
    this.showApplyForm = true;
  }

  submitLeave(): void {
    if (!this.applyForm.leaveType) { this.applyError = 'Leave type is required'; return; }
    if (!this.applyForm.fromDate) { this.applyError = 'From date is required'; return; }
    if (!this.applyForm.toDate) { this.applyError = 'To date is required'; return; }
    if (this.applyForm.toDate < this.applyForm.fromDate) { this.applyError = 'To date must be on or after from date'; return; }
    this.submitting = true;
    this.applyError = '';
    this.api.applyLeave(this.applyForm)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => { this.submitting = false; this.cdr.detectChanges(); }),
      )
      .subscribe({
        next: () => {
          this.submitting = false;
          this.showApplyForm = false;
          this.loadAll();
        },
        error: (e) => {
          this.submitting = false;
          this.applyError = e?.error?.message || 'Failed to submit leave application';
        },
      });
  }

  async cancelApplication(app: LeaveApplication): Promise<void> {
    if (!window.confirm('Are you sure you want to cancel this leave application?')) return;
    this.api.cancelLeave((app as any).id)
    .pipe(
      takeUntil(this.destroy$),
      finalize(() => this.cdr.detectChanges()),
    )
    .subscribe({
      next: () => this.loadAll(),
      error: () => {
        this.toast.error('Failed to cancel leave application.');
      },
    });
  }
}
