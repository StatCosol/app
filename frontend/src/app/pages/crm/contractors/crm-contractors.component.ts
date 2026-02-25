import { ChangeDetectorRef, Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { finalize, takeUntil, timeout } from 'rxjs/operators';
import { CrmContractorsService } from '../../../core/crm-contractors.service';
import { CrmService } from '../../../core/crm.service';
import { ActivatedRoute } from '@angular/router';
import { PageHeaderComponent, LoadingSpinnerComponent, ActionButtonComponent } from '../../../shared/ui';

@Component({
  standalone: true,
  selector: 'app-crm-contractors',
  imports: [CommonModule, FormsModule, PageHeaderComponent, LoadingSpinnerComponent, ActionButtonComponent],
  templateUrl: './crm-contractors.component.html',
  styleUrls: ['./crm-contractors.component.scss'],
})
export class CrmContractorsComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  loading = true;
  contractors: any[] = [];
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
      alert('Name, Email, Password, and Client are required');
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
        alert(err?.error?.message || 'Failed to register contractor');
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
