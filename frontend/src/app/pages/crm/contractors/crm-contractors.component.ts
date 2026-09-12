import * as XLSX from 'xlsx';
import { downloadBlob } from '../../../shared/utils/download-blob';
import { ChangeDetectorRef, Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { finalize, takeUntil, timeout } from 'rxjs/operators';
import { CrmContractorsService } from '../../../core/crm-contractors.service';
import { CrmService } from '../../../core/crm.service';
import { ActivatedRoute } from '@angular/router';
import { PageHeaderComponent, LoadingSpinnerComponent, ActionButtonComponent, DataTableComponent, TableCellDirective, TableColumn, ClientContextStripComponent } from '../../../shared/ui';
import { ToastService } from '../../../shared/toast/toast.service';

@Component({
  standalone: true,
  selector: 'app-crm-contractors',
  imports: [CommonModule, FormsModule, PageHeaderComponent, LoadingSpinnerComponent, ActionButtonComponent, DataTableComponent, TableCellDirective, ClientContextStripComponent],
  templateUrl: './crm-contractors.component.html',
  styleUrls: ['./crm-contractors.component.scss'],
})
export class CrmContractorsComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  loading = true;
  contractors: any[] = [];

  readonly contractorColumns: TableColumn[] = [
    { key: 'userCode', header: 'User Code', width: '12%' },
    { key: 'name', header: 'Name', width: '16%' },
    { key: 'email', header: 'Email', width: '20%' },
    { key: 'mobile', header: 'Mobile', width: '16%' },
    { key: 'clientName', header: 'Client', width: '24%' },
    { key: 'status', header: 'Status', width: '10%' },
    { key: 'actions', header: 'Actions', width: '14%', align: 'center' },
  ];
  myClients: any[] = [];
  showForm = false;
  clientId?: string;

  form = {
    name: '',
    email: '',
    mobile: '',
    password: '',
    clientId: '',
    branchIds: [] as string[],
    scheduledEmployment: '',
  };

  registrationResult: any = null;
  quoteUploadFor: any = null;
  quoteFile: File | null = null;
  quoteEffectiveFrom = new Date().toISOString().slice(0, 10);
  quoteMode: 'excel' | 'manual' = 'excel';
  quoteDesignation = '';
  quoteSkill = '';
  quoteDivisor = 30;
  quoteRounding = 'RUPEE';
  quoteComponents = [this.newQuoteComponent()];

  newQuoteComponent() {
    return { code: '', label: '', category: 'EARNING', method: 'FIXED', value: 0, basis: '', ceiling: '', prorate: true };
  }

  manualQuoteFile(): File {
    if (!this.quoteDesignation.trim() || !this.quoteSkill || !this.quoteComponents.length)
      throw new Error('Enter a designation, skill category and at least one component');
    if (!Number.isInteger(this.quoteDivisor) || this.quoteDivisor < 1 || this.quoteDivisor > 31)
      throw new Error('Attendance divisor must be between 1 and 31 days');
    const codes = new Set<string>();
    const rows = this.quoteComponents.map(c => {
      const code = c.code.trim().toUpperCase();
      if (!code || codes.has(code) || !Number.isFinite(c.value) || c.value < 0)
        throw new Error('Each component needs a unique code and a non-negative amount or percentage');
      const basis = c.basis.split(',').map(v => v.trim().toUpperCase()).filter(Boolean);
      if (c.method === 'PERCENT' && (!basis.length || basis.some(v => !codes.has(v))))
        throw new Error('Percentage components must reference codes entered in earlier rows');
      codes.add(code);
      return { skill_category: this.quoteSkill, designation: this.quoteDesignation.trim(),
        effective_from: this.quoteEffectiveFrom, divisor: this.quoteDivisor, rounding: this.quoteRounding,
        component_code: code, label: c.label.trim() || code, category: c.category, method: c.method,
        value: c.value, basis: c.method === 'PERCENT' ? basis.join(',') : '',
        ceiling: c.ceiling, prorate: c.prorate ? 'yes' : 'no' };
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Components');
    return new File([XLSX.write(wb, { type: 'array', bookType: 'xlsx' })], 'branch-quotation.xlsx');
  }

  quoteUploading = false;
  quoteUploadResult: any = null;

  constructor(
    private contractorApi: CrmContractorsService,
    private crmApi: CrmService,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef,
    private toast: ToastService,
  ) {}

  ngOnInit() {
    this.route.paramMap.pipe(takeUntil(this.destroy$)).subscribe((params) => {
      this.clientId = params.get('clientId') ?? undefined;
      if (this.clientId) {
        this.form.clientId = this.clientId;
      }
      this.loadMyClients();
      this.loadContractors();
    });
  }

  loadMyClients() {
    this.crmApi.getAssignedClientsCached().pipe(takeUntil(this.destroy$)).subscribe({
      next: (res: any) => {
        this.myClients = res || [];
        this.cdr.detectChanges();
      },
    });
  }

  loadContractors() {
    this.loading = true;
    this.contractorApi.listMyContractors(this.clientId).pipe(
      takeUntil(this.destroy$),
      timeout(10000),
      finalize(() => { this.loading = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (res: any) => {
        this.loading = false;
        this.contractors = res || [];
        this.cdr.detectChanges();
      },
      error: () => { this.loading = false; this.cdr.detectChanges(); },
    });
  }

  openRegistrationForm() {
    this.showForm = true;
    this.registrationResult = null;
    this.form = {
      name: '',
      email: '',
      mobile: '',
      password: this.generatePassword(),
      clientId: this.clientId || '',
      branchIds: [],
      scheduledEmployment: '',
    };
  }

  cancelForm() {
    this.showForm = false;
    this.form = {
      name: '',
      email: '',
      mobile: '',
      password: '',
      clientId: this.clientId || '',
      branchIds: [],
      scheduledEmployment: '',
    };
  }

  get emailError(): string {
    const v = (this.form.email || '').trim();
    if (!v) return '';
    if (!v.includes('@')) return 'Email must include @ symbol';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return 'Please enter a valid email address';
    return '';
  }

  get mobileError(): string {
    const v = (this.form.mobile || '').trim();
    if (!v) return '';
    const cleaned = v.replace(/[\s-]/g, '');
    if (!/^\+\d{1,3}[6-9]\d{9}$/.test(cleaned)) return 'Mobile must include country code + 10 digits (e.g. +919876543210)';
    return '';
  }

  generatePassword(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let password = '';
    for (let i = 0; i < 8; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }

  registerContractor() {
    if (!this.form.name || !this.form.email || !this.form.password || !this.form.clientId) {
      this.toast.warning('Name, Email, Password, and Client are required');
      return;
    }
    if (this.emailError) {
      this.toast.warning(this.emailError);
      return;
    }
    if (this.mobileError) {
      this.toast.warning(this.mobileError);
      return;
    }

    this.loading = true;
    this.contractorApi.registerContractor(this.form).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res: any) => {
        this.registrationResult = res;
        this.loading = false;
        this.cdr.detectChanges();
        this.loadContractors();
      },
      error: (err) => {
        this.toast.error(err?.error?.message || 'Failed to register contractor');
        this.loading = false;
        this.cdr.detectChanges();
      },
    });
  }

  closeCredentials() {
    this.registrationResult = null;
    this.cancelForm();
  }

  quoteBranchId = '';
  quoteBranches: any[] = [];



  downloadQuoteTemplate() {
    this.contractorApi
      .downloadQuotationTemplate()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (blob) => {
          void downloadBlob(blob, 'contractor-rate-card-template.xlsx').catch(() =>
            this.toast.error('Download failed'),
          );
        },
        error: () => this.toast.error('Could not download quotation template'),
      });
  }


  openQuoteUpload(contractor: any) {
    this.quoteBranchId = '';
    this.quoteMode = 'excel';
    this.quoteDesignation = '';
    this.quoteSkill = '';
    this.quoteDivisor = 30;
    this.quoteComponents = [this.newQuoteComponent()];
    this.quoteBranches = [];
    this.contractorApi
      .quotationBranches(contractor.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (rows) => {
          if (this.quoteUploadFor?.id !== contractor.id) return;
          this.quoteBranches = Array.isArray(rows) ? rows : rows.branches || rows.data || [];
          this.cdr.markForCheck();
        },
        error: () => this.toast.error('Could not load quotation branches'),
      });
    this.quoteUploadFor = contractor;
    this.quoteFile = null;
    this.quoteUploadResult = null;
    this.quoteEffectiveFrom = new Date().toISOString().slice(0, 10);
  }

  closeQuoteUpload() {
    if (this.quoteUploading) return;
    this.quoteUploadFor = null;
    this.quoteFile = null;
    this.quoteUploadResult = null;
    this.quoteUploading = false;
  }

  onQuoteFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    this.quoteFile = input.files?.[0] ?? null;
  }

  uploadQuote() {
    if (this.quoteUploading) return;
    if (!this.quoteEffectiveFrom || !/^\d{4}-\d{2}-\d{2}$/.test(this.quoteEffectiveFrom)) {
      this.toast.warning('Choose the quotation effective date'); return;
    }
    let file = this.quoteFile;
    if (this.quoteMode === 'manual') {
      try { file = this.manualQuoteFile(); }
      catch (err) { this.toast.warning((err as Error).message); return; }
    }
    if (!this.quoteUploadFor?.id || !this.quoteUploadFor?.clientId || !file) {
      this.toast.warning('Select quotation Excel file');
      return;
    }
    this.quoteUploading = true;
    this.contractorApi.uploadQuotationWages({
      clientId: this.quoteUploadFor.clientId,
      contractorUserId: this.quoteUploadFor.id,
      effectiveFrom: this.quoteEffectiveFrom,
      branchId: this.quoteBranchId || undefined,
      file,
    }).pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.quoteUploading = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (res) => {
        this.quoteUploadResult = res;
        this.toast.success(`Quotation uploaded: ${res.inserted || 0} inserted, ${res.updated || 0} updated`);
      },
      error: (err) => this.toast.error(err?.error?.message || 'Quotation upload failed'),
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
