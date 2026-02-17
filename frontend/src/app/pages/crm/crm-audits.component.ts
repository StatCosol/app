import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { timeout } from 'rxjs/operators';
import { AuditsService } from '../../core/audits.service';
import { CrmClientsApi } from '../../core/api/crm-clients.api';
import { PageHeaderComponent } from '../../shared/ui';

@Component({
  selector: 'app-crm-audits',
  standalone: true,
  imports: [CommonModule, FormsModule, PageHeaderComponent],
  templateUrl: './crm-audits.component.html',
  styleUrls: ['./crm-audits.component.scss'],
})
export class CrmAuditsComponent implements OnInit {
  model: any = {
    // NOTE: IDs are UUID strings in the backend
    clientId: '',
    contractorUserId: '',
    frequency: 'MONTHLY',
    auditType: 'CONTRACTOR',
    periodYear: new Date().getFullYear(),
    periodCode: '',
    assignedAuditorId: '',
    dueDate: '',
    notes: '',
  };

  message: string | null = null;
  error: string | null = null;
  submitting = false;

  clients: any[] = [];
  contractors: any[] = [];
  auditors: any[] = [];

  frequencies = [
    { label: 'Monthly', value: 'MONTHLY' },
    { label: 'Quarterly', value: 'QUARTERLY' },
    { label: 'Half-yearly', value: 'HALF_YEARLY' },
    { label: 'Yearly', value: 'YEARLY' },
  ];

  auditTypes = [
    { label: 'Contractor', value: 'CONTRACTOR' },
    { label: 'Factory', value: 'FACTORY' },
    { label: 'Shops & Establishment', value: 'SHOPS_ESTABLISHMENT' },
    { label: 'Labour & Employment', value: 'LABOUR_EMPLOYMENT' },
    { label: 'FSSAI', value: 'FSSAI' },
    { label: 'HR', value: 'HR' },
    { label: 'Payroll', value: 'PAYROLL' },
    { label: 'GAP', value: 'GAP' },
  ];

  constructor(
    private auditsService: AuditsService,
    private crmClientsApi: CrmClientsApi,
    private http: HttpClient,
    private cdr: ChangeDetectorRef,
  ) {}

  private readonly baseUrl = environment.apiBaseUrl || '';

  ngOnInit(): void {
    this.loadDropdowns();
  }

  loadDropdowns(): void {
    // Load assigned clients
    this.crmClientsApi.getAssignedClients().subscribe({
      next: (data) => {
        this.clients = data || [];
        this.cdr.detectChanges();
      },
      error: (err) => { console.error('Failed to load clients', err); this.cdr.detectChanges(); },
    });

    // Load auditors (CRM-accessible endpoint)
    this.http.get<any[]>(`${this.baseUrl}/api/crm/users/auditors`).pipe(timeout(10000)).subscribe({
      next: (data) => {
        this.auditors = data || [];
        this.cdr.detectChanges();
      },
      error: (err) => { console.error('Failed to load auditors', err); this.cdr.detectChanges(); },
    });
  }

  onClientChange(): void {
    this.contractors = [];
    this.model.contractorUserId = '';
    
    if (this.model.clientId) {
      // Load contractors (CRM-accessible endpoint)
      this.http.get<any[]>(`${this.baseUrl}/api/crm/users/contractors`).pipe(timeout(10000)).subscribe({
        next: (data) => {
          this.contractors = data || [];
          this.cdr.detectChanges();
        },
        error: (err) => { console.error('Failed to load contractors', err); this.cdr.detectChanges(); },
      });
    }
  }

  submit(): void {
    if (this.submitting) return;
    this.message = null;
    this.error = null;
    this.submitting = true;

    const payload: any = {
      clientId: this.model.clientId,
      frequency: this.model.frequency,
      auditType: this.model.auditType,
      periodYear: Number(this.model.periodYear),
      periodCode: String(this.model.periodCode || '').trim(),
      assignedAuditorId: this.model.assignedAuditorId,
    };

    if (this.model.contractorUserId) {
      payload.contractorUserId = this.model.contractorUserId;
    }
    if (this.model.dueDate) {
      payload.dueDate = this.model.dueDate;
    }
    if (this.model.notes) {
      payload.notes = this.model.notes;
    }

    this.auditsService.crmCreateAudit(payload).subscribe({
      next: (res) => {
        this.message = `Audit scheduled successfully — ${res?.auditCode ?? res?.id ?? ''}`;
        this.submitting = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.error = err?.error?.message || 'Failed to create audit';
        this.submitting = false;
        this.cdr.detectChanges();
      },
    });
  }
}
