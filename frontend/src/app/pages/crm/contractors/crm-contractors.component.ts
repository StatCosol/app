import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { finalize, timeout } from 'rxjs/operators';
import { CrmContractorsService } from '../../../core/crm-contractors.service';
import { CrmService } from '../../../core/crm.service';
import { ActivatedRoute } from '@angular/router';
import { PageHeaderComponent } from '../../../shared/ui';

@Component({
  standalone: true,
  selector: 'app-crm-contractors',
  imports: [CommonModule, FormsModule, PageHeaderComponent],
  templateUrl: './crm-contractors.component.html',
  styleUrls: ['./crm-contractors.component.scss'],
})
export class CrmContractorsComponent implements OnInit {
  loading = false;
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
    this.route.paramMap.subscribe((params) => {
      this.clientId = params.get('clientId') ?? undefined;
      if (this.clientId) {
        this.form.clientId = this.clientId;
      }
      this.loadMyClients();
      this.loadContractors();
    });
  }

  loadMyClients() {
    this.crmApi.getAssignedClientsCached().subscribe({
      next: (res: any) => {
        this.myClients = res || [];
        this.cdr.detectChanges();
      },
    });
  }

  loadContractors() {
    this.loading = true;
    this.contractorApi.listMyContractors().pipe(
      timeout(10000),
      finalize(() => { this.loading = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (res: any) => {
        this.contractors = res || [];
        this.cdr.detectChanges();
      },
      error: () => { this.cdr.detectChanges(); },
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
    this.contractorApi.registerContractor(this.form).subscribe({
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
}
