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
    { key: 'userCode', header: 'User Code' },
    { key: 'name', header: 'Name' },
    { key: 'email', header: 'Email' },
    { key: 'mobile', header: 'Mobile' },
    { key: 'clientName', header: 'Client' },
    { key: 'status', header: 'Status' },
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
  };

  registrationResult: any = null;

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
    this.contractorApi.listMyContractors().pipe(
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

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
