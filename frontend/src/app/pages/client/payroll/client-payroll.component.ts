import { Component, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { finalize, takeUntil, timeout } from 'rxjs/operators';
import { ClientPayrollService } from '../../../core/client-payroll.service';
import { AuthService } from '../../../core/auth.service';
import { PageHeaderComponent, DataTableComponent, TableColumn, FormSelectComponent, FormInputComponent, ActionButtonComponent, StatusBadgeComponent } from '../../../shared/ui';

@Component({
  standalone: true,
  selector: 'app-client-payroll',
  imports: [CommonModule, FormsModule, PageHeaderComponent, DataTableComponent, FormSelectComponent, FormInputComponent, ActionButtonComponent, StatusBadgeComponent],
  templateUrl: './client-payroll.component.html',
  styleUrls: ['../shared/client-theme.scss', './client-payroll.component.scss'],
})
export class ClientPayrollComponent implements OnDestroy {
  private destroy$ = new Subject<void>();
  activeTab: 'inputs' | 'registers' = 'inputs';
  loading = false;
  creatingInput = false;
  updatingStatus = false;
  inputError = '';

  // Payroll Inputs
  inputs: any[] = [];
  filters = {
    periodYear: new Date().getFullYear(),
    periodMonth: new Date().getMonth() + 1,
    status: '',
  };

  newInput: any = {
    title: '',
    periodYear: new Date().getFullYear(),
    periodMonth: new Date().getMonth() + 1,
    notes: '',
    branchId: null,
  };
  newInputFile: File | null = null;

  // Registers
  registers: any[] = [];
  registerFilters = {
    periodYear: new Date().getFullYear(),
    periodMonth: new Date().getMonth() + 1,
    registerType: '',
  };

  // Selected input for details
  selectedInput: any = null;
  inputFiles: any[] = [];
  statusHistory: any[] = [];

  // Table columns
  inputColumns: TableColumn[] = [
    { key: 'period', header: 'Period', sortable: true },
    { key: 'inputType', header: 'Type', sortable: true },
    { key: 'status', header: 'Status', sortable: true, align: 'center' },
    { key: 'createdAt', header: 'Created', sortable: true },
    { key: 'actions', header: 'Actions', sortable: false, align: 'right' },
  ];

  registerColumns: TableColumn[] = [
    { key: 'registerType', header: 'Register Type', sortable: true },
    { key: 'period', header: 'Period', sortable: true },
    { key: 'fileName', header: 'File Name', sortable: false },
    { key: 'createdAt', header: 'Created', sortable: true },
    { key: 'actions', header: 'Actions', sortable: false, align: 'right' },
  ];

  // Static option arrays — MUST NOT be getters (new refs on every CD cycle → NG0103)
  readonly monthOptions: Array<{ value: string | number; label: string }>;
  readonly yearOptions: Array<{ value: string | number; label: string }>;
  readonly statusOptions = [
    { value: '', label: 'All Statuses' },
    { value: 'PENDING_UPLOAD', label: 'Pending Upload' },
    { value: 'UNDER_REVIEW', label: 'Under Review' },
    { value: 'APPROVED', label: 'Approved' },
    { value: 'REJECTED', label: 'Rejected' },
  ];
  readonly registerTypeOptions = [
    { value: '', label: 'All Types' },
    { value: 'WAGE', label: 'Wage Register' },
    { value: 'PF', label: 'PF Register' },
    { value: 'ESI', label: 'ESI Register' },
    { value: 'PT', label: 'PT Register' },
  ];

  // Filter options — must NOT be inline arrays in template (new refs every CD cycle → NG0103)
  readonly filterYearOptions = [
    { value: 2024, label: '2024' },
    { value: 2025, label: '2025' },
    { value: 2026, label: '2026' },
    { value: 2027, label: '2027' },
  ];
  readonly filterStatusOptions = [
    { value: '', label: 'All Status' },
    { value: 'DRAFT', label: 'Draft' },
    { value: 'SUBMITTED', label: 'Submitted' },
    { value: 'APPROVED', label: 'Approved' },
    { value: 'REJECTED', label: 'Rejected' },
    { value: 'COMPLETED', label: 'Completed' },
  ];

  constructor(
    private api: ClientPayrollService,
    private auth: AuthService,
    private cdr: ChangeDetectorRef
  ) {
    // Build month/year options once in constructor
    const months: Array<{ value: string | number; label: string }> = [{ value: '', label: 'All Months' }];
    for (let m = 1; m <= 12; m++) {
      months.push({ value: m, label: String(m).padStart(2, '0') });
    }
    this.monthOptions = months;

    const currentYear = new Date().getFullYear();
    const years: Array<{ value: string | number; label: string }> = [{ value: '', label: 'All Years' }];
    for (let y = currentYear; y >= currentYear - 5; y--) {
      years.push({ value: y, label: String(y) });
    }
    this.yearOptions = years;
  }

  ngOnInit() {
    this.loadInputs();
    this.loadRegisters();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onInputFileSelected(event: Event) {
    const target = event.target as HTMLInputElement;
    this.newInputFile = target.files && target.files.length ? target.files[0] : null;
  }

  createInput() {
    this.inputError = '';
    if (!this.newInput.title || !this.newInput.periodYear || !this.newInput.periodMonth) {
      this.inputError = 'Title, year, and month are required.';
      return;
    }
    this.creatingInput = true;
    this.api.createInput(this.newInput).pipe(takeUntil(this.destroy$)).subscribe({
      next: (created: any) => {
        if (this.newInputFile) {
          this.api.uploadInputFile(created.id, this.newInputFile).pipe(takeUntil(this.destroy$)).subscribe({
            next: () => {
              this.afterInputCreated();
            },
            error: () => {
              this.creatingInput = false;
              this.inputError = 'Input created, but file upload failed.';
              this.cdr.markForCheck();
              this.loadInputs();
            },
          });
        } else {
          this.afterInputCreated();
        }
      },
      error: (e) => {
        this.creatingInput = false;
        this.inputError = e?.error?.message || 'Failed to create payroll input.';
        this.cdr.markForCheck();
      },
    });
  }

  private afterInputCreated() {
    this.creatingInput = false;
    this.newInput = {
      title: '',
      periodYear: new Date().getFullYear(),
      periodMonth: new Date().getMonth() + 1,
      notes: '',
      branchId: null,
    };
    this.newInputFile = null;
    this.cdr.markForCheck();
    this.loadInputs();
  }

  // Payroll Inputs
  loadInputs() {
    this.loading = true;
    this.api.listInputs(this.filters).pipe(
      takeUntil(this.destroy$),
      timeout(10000),
      finalize(() => { this.loading = false; this.cdr.markForCheck(); }),
    ).subscribe({
      next: (res: any) => {
        this.loading = false;
        this.inputs = (res || []).map((input: any) => ({
          ...input,
          period: `${String(input.periodMonth).padStart(2, '0')}/${input.periodYear}`,
          inputType: input.inputType || 'General',
          createdAt: this.formatDate(input.createdAt),
        }));
        // finalize() already calls detectChanges
      },
      error: () => { this.loading = false; },
    });
  }

  selectInput(input: any) {
    this.selectedInput = input;
    this.loadInputFiles(input.id);
    this.loadStatusHistory(input.id);
  }

  loadInputFiles(inputId: string) {
    this.api.listInputFiles(inputId).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res: any) => {
        this.inputFiles = res || [];
        this.cdr.markForCheck();
      },
      error: () => {
        this.inputFiles = [];
        this.cdr.markForCheck();
      },
    });
  }

  loadStatusHistory(inputId: string) {
    this.api.getStatusHistory(inputId).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res: any) => {
        this.statusHistory = res || [];
        this.cdr.markForCheck();
      },
      error: () => {
        this.statusHistory = [];
        this.cdr.markForCheck();
      },
    });
  }

  backToInputsList() {
    this.selectedInput = null;
    this.inputFiles = [];
    this.statusHistory = [];
  }

  updateStatus(status: string) {
    if (this.updatingStatus) return;
    if (!this.selectedInput) return;
    this.updatingStatus = true;
    this.api
      .updateInputStatus(this.selectedInput.id, {
        status,
        remarks: `Status updated to ${status}`,
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.updatingStatus = false;
          this.selectedInput.status = status;
          this.cdr.markForCheck();
          this.loadStatusHistory(this.selectedInput.id);
          this.loadInputs();
        },
        error: () => { this.updatingStatus = false; this.cdr.markForCheck(); }
      });
  }

  // Registers
  loadRegisters() {
    this.api.listRegisters(this.registerFilters).pipe(
      takeUntil(this.destroy$),
      finalize(() => this.cdr.markForCheck()),
    ).subscribe({
      next: (res: any) => {
        this.registers = (res || []).map((reg: any) => ({
          ...reg,
          period: `${String(reg.periodMonth).padStart(2, '0')}/${reg.periodYear}`,
          createdAt: this.formatDate(reg.createdAt),
        }));
      },
      error: () => {
        this.registers = [];
      },
    });
  }

  downloadRegister(register: any) {
    window.open(this.api.downloadRegister(register.id), '_blank');
  }

  downloadInputFile(file: any) {
    const url = file?.downloadUrl || this.api.downloadInputFileUrl(file.id);
    window.open(url, '_blank');
  }

  switchTab(tab: 'inputs' | 'registers') {
    this.activeTab = tab;
    if (tab === 'inputs') this.loadInputs();
    else this.loadRegisters();
  }

  formatDate(date: string | Date): string {
    if (!date) return '—';
    return new Date(date).toLocaleDateString();
  }

  getStatusClass(status: string): string {
    const map: any = {
      DRAFT: 'draft',
      SUBMITTED: 'submitted',
      APPROVED: 'approved',
      REJECTED: 'rejected',
      CANCELLED: 'cancelled',
      COMPLETED: 'completed',
    };
    return map[status] || 'draft';
  }
}
