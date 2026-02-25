import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';
import {
  ClientEmployeesService,
  Employee,
  EmployeeNomination,
} from './client-employees.service';
import {
  ActionButtonComponent,
  StatusBadgeComponent,
  LoadingSpinnerComponent,
  EmptyStateComponent,
  ModalComponent,
  FormInputComponent,
  FormSelectComponent,
} from '../../../shared/ui';

type DetailTab = 'profile' | 'nominations' | 'forms';

@Component({
  selector: 'app-client-employee-detail',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ActionButtonComponent,
    StatusBadgeComponent,
    LoadingSpinnerComponent,
    EmptyStateComponent,
    ModalComponent,
    FormInputComponent,
    FormSelectComponent,
  ],
  template: `
    <div class="page">
      <!-- Back Button -->
      <button (click)="goBack()"
        class="flex items-center gap-1 text-sm text-gray-500 hover:text-statco-blue mb-4 transition-colors">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
        </svg>
        Back to Employees
      </button>

      <ui-loading-spinner *ngIf="loading" text="Loading employee..." size="lg"></ui-loading-spinner>

      <!-- Error -->
      <div *ngIf="error && !loading"
           class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-6 flex items-center justify-between">
        <span>{{ error }}</span>
        <button (click)="goBack()" class="text-red-800 font-semibold hover:underline ml-4">Go Back</button>
      </div>

      <ng-container *ngIf="emp && !loading">
        <!-- Header Card -->
        <div class="header-card">
          <div class="header-top">
            <div class="header-info">
              <div class="header-name">
                {{ emp.firstName }} {{ emp.lastName || '' }}
                <ui-status-badge [status]="emp.isActive ? 'ACTIVE' : 'INACTIVE'" class="ml-2"></ui-status-badge>
              </div>
              <div class="header-meta">{{ emp.employeeCode }}</div>
              <div *ngIf="emp.designation || emp.department" class="header-meta">
                {{ emp.designation || '' }}<span *ngIf="emp.designation && emp.department"> &middot; </span>{{ emp.department || '' }}
              </div>
            </div>
            <div class="header-actions">
              <ui-button variant="primary" (clicked)="editEmployee()">Edit</ui-button>
              <ui-button *ngIf="emp.isActive" variant="danger" (clicked)="confirmDeactivate()">Deactivate</ui-button>
            </div>
          </div>
        </div>

        <!-- Tabs -->
        <div class="tab-bar">
          <button *ngFor="let t of tabs"
            class="tab-btn"
            [class.active]="activeTab === t.key"
            (click)="switchTab(t.key)">
            {{ t.label }}
          </button>
        </div>

        <!-- Profile Tab -->
        <div *ngIf="activeTab === 'profile'" class="tab-content">
          <div class="info-grid">
            <div class="info-section">
              <h4 class="info-section-title">Personal Information</h4>
              <div class="info-rows">
                <div class="info-row"><span class="info-label">Full Name</span><span class="info-value">{{ emp.firstName }} {{ emp.lastName || '' }}</span></div>
                <div class="info-row"><span class="info-label">Gender</span><span class="info-value">{{ emp.gender || '-' }}</span></div>
                <div class="info-row"><span class="info-label">Date of Birth</span><span class="info-value">{{ emp.dateOfBirth || '-' }}</span></div>
                <div class="info-row"><span class="info-label">Father's Name</span><span class="info-value">{{ emp.fatherName || '-' }}</span></div>
              </div>
            </div>

            <div class="info-section">
              <h4 class="info-section-title">Contact</h4>
              <div class="info-rows">
                <div class="info-row"><span class="info-label">Phone</span><span class="info-value">{{ emp.phone || '-' }}</span></div>
                <div class="info-row"><span class="info-label">Email</span><span class="info-value">{{ emp.email || '-' }}</span></div>
              </div>
            </div>

            <div class="info-section">
              <h4 class="info-section-title">Identity Documents</h4>
              <div class="info-rows">
                <div class="info-row"><span class="info-label">Aadhaar</span><span class="info-value">{{ emp.aadhaar || '-' }}</span></div>
                <div class="info-row"><span class="info-label">PAN</span><span class="info-value">{{ emp.pan || '-' }}</span></div>
                <div class="info-row"><span class="info-label">UAN</span><span class="info-value">{{ emp.uan || '-' }}</span></div>
                <div class="info-row"><span class="info-label">ESIC Number</span><span class="info-value">{{ emp.esic || '-' }}</span></div>
              </div>
            </div>

            <div class="info-section">
              <h4 class="info-section-title">Employment</h4>
              <div class="info-rows">
                <div class="info-row"><span class="info-label">Employee Code</span><span class="info-value font-mono">{{ emp.employeeCode }}</span></div>
                <div class="info-row"><span class="info-label">Designation</span><span class="info-value">{{ emp.designation || '-' }}</span></div>
                <div class="info-row"><span class="info-label">Department</span><span class="info-value">{{ emp.department || '-' }}</span></div>
                <div class="info-row"><span class="info-label">Date of Joining</span><span class="info-value">{{ emp.dateOfJoining || '-' }}</span></div>
                <div *ngIf="emp.dateOfExit" class="info-row"><span class="info-label">Date of Exit</span><span class="info-value text-red-600">{{ emp.dateOfExit }}</span></div>
                <div class="info-row"><span class="info-label">State</span><span class="info-value">{{ emp.stateCode || '-' }}</span></div>
              </div>
            </div>

            <div class="info-section">
              <h4 class="info-section-title">Bank Details</h4>
              <div class="info-rows">
                <div class="info-row"><span class="info-label">Bank Name</span><span class="info-value">{{ emp.bankName || '-' }}</span></div>
                <div class="info-row"><span class="info-label">Account Number</span><span class="info-value font-mono">{{ emp.bankAccount || '-' }}</span></div>
                <div class="info-row"><span class="info-label">IFSC</span><span class="info-value font-mono">{{ emp.ifsc || '-' }}</span></div>
              </div>
            </div>
          </div>
        </div>

        <!-- Nominations Tab -->
        <div *ngIf="activeTab === 'nominations'" class="tab-content">
          <div class="flex justify-between items-center mb-4">
            <h3 class="text-base font-semibold text-gray-900">Nominations</h3>
            <ui-button variant="primary" (clicked)="openNomForm()">+ Add Nomination</ui-button>
          </div>

          <ui-loading-spinner *ngIf="loadingNoms" text="Loading nominations..."></ui-loading-spinner>

          <ui-empty-state
            *ngIf="!loadingNoms && nominations.length === 0"
            title="No Nominations"
            description="Add PF, ESI, Gratuity, Insurance, or Salary nominations for this employee.">
          </ui-empty-state>

          <div *ngFor="let nom of nominations" class="nom-card">
            <div class="nom-header">
              <ui-status-badge [status]="nom.nominationType"></ui-status-badge>
              <span *ngIf="nom.declarationDate" class="text-xs text-gray-500 ml-2">Declared: {{ nom.declarationDate }}</span>
            </div>
            <div *ngIf="nom.members && nom.members.length" class="nom-members">
              <div class="nom-member-row header">
                <span>Name</span><span>Relationship</span><span>Share %</span><span>Minor</span>
              </div>
              <div *ngFor="let m of nom.members" class="nom-member-row">
                <span>{{ m.memberName }}</span>
                <span>{{ m.relationship || '-' }}</span>
                <span>{{ m.sharePct }}%</span>
                <span>{{ m.isMinor ? 'Yes (' + (m.guardianName || '-') + ')' : 'No' }}</span>
              </div>
            </div>
            <div *ngIf="nom.witnessName" class="text-xs text-gray-500 mt-2">
              Witness: {{ nom.witnessName }} <span *ngIf="nom.witnessAddress">({{ nom.witnessAddress }})</span>
            </div>
          </div>

          <!-- Nomination Form Modal -->
          <ui-modal *ngIf="showNomModal" title="Add Nomination" size="full" (closed)="showNomModal = false">
            <div class="nom-form-grid">
              <ui-form-select label="Nomination Type *" [options]="nomTypeOptions"
                              [(ngModel)]="nomForm.nominationType"></ui-form-select>
              <div class="form-field">
                <label class="form-label">Declaration Date</label>
                <input type="date" class="form-date-input" [(ngModel)]="nomForm.declarationDate" />
              </div>
              <ui-form-input label="Witness Name" [(ngModel)]="nomForm.witnessName"></ui-form-input>
              <ui-form-input label="Witness Address" [(ngModel)]="nomForm.witnessAddress"></ui-form-input>
            </div>

            <!-- Nominee Members -->
            <div class="mt-4">
              <div class="flex justify-between items-center mb-2">
                <h4 class="text-sm font-semibold text-gray-700">Nominee Members</h4>
                <button class="text-xs text-blue-600 hover:underline" (click)="addNomMember()">+ Add Member</button>
              </div>
              <div *ngFor="let m of nomForm.members; let i = index" class="member-row">
                <ui-form-input label="Name *" [(ngModel)]="m.memberName"></ui-form-input>
                <ui-form-input label="Relationship" [(ngModel)]="m.relationship"></ui-form-input>
                <ui-form-input label="Share %" type="number" [(ngModel)]="m.sharePct"></ui-form-input>
                <div class="flex items-end gap-2">
                  <label class="flex items-center gap-1 text-xs mt-5">
                    <input type="checkbox" [(ngModel)]="m.isMinor"> Minor
                  </label>
                  <button *ngIf="nomForm.members.length > 1"
                    class="text-xs text-red-600 hover:underline mt-5" (click)="removeNomMember(i)">Remove</button>
                </div>
                <ui-form-input *ngIf="m.isMinor" label="Guardian Name" [(ngModel)]="m.guardianName"></ui-form-input>
              </div>
            </div>

            <div *ngIf="nomFormError" class="form-error mt-2">{{ nomFormError }}</div>

            <div class="form-actions">
              <ui-button variant="secondary" (clicked)="showNomModal = false">Cancel</ui-button>
              <ui-button variant="primary" [disabled]="savingNom" [loading]="savingNom"
                         (clicked)="saveNomination()">Save Nomination</ui-button>
            </div>
          </ui-modal>
        </div>

        <!-- Forms Tab -->
        <div *ngIf="activeTab === 'forms'" class="tab-content">
          <div class="flex justify-between items-center mb-4">
            <h3 class="text-base font-semibold text-gray-900">Generated Forms</h3>
            <div class="flex gap-2">
              <ui-button *ngFor="let ft of formTypes" variant="outline" size="sm"
                         [loading]="generatingForm === ft.value"
                         (clicked)="generateForm(ft.value)">
                {{ ft.label }}
              </ui-button>
            </div>
          </div>

          <ui-loading-spinner *ngIf="loadingForms" text="Loading forms..."></ui-loading-spinner>

          <ui-empty-state
            *ngIf="!loadingForms && forms.length === 0"
            title="No Forms Generated"
            description="Use the buttons above to generate statutory forms for this employee.">
          </ui-empty-state>

          <div *ngFor="let f of forms" class="form-card">
            <div class="flex items-center justify-between">
              <div>
                <div class="font-semibold text-sm text-gray-900">{{ f.formType || f.form_type }}</div>
                <div class="text-xs text-gray-500">{{ f.fileName || f.file_name }}</div>
              </div>
              <div class="text-xs text-gray-400">{{ f.createdAt || f.created_at | date:'medium' }}</div>
            </div>
          </div>

          <div *ngIf="formGenMsg" class="mt-3 text-sm" [class.text-green-600]="!formGenError" [class.text-red-600]="formGenError">
            {{ formGenMsg }}
          </div>
        </div>
      </ng-container>
    </div>
  `,
  styles: [
    `
      .page { max-width: 1280px; margin: 0 auto; padding: 1.5rem 1rem; }

      .header-card {
        background: white;
        border: 1px solid #e5e7eb;
        border-radius: 0.75rem;
        padding: 1.25rem 1.5rem;
        margin-bottom: 1rem;
      }
      .header-top { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 1rem; }
      .header-name { font-size: 1.25rem; font-weight: 700; color: #111827; display: flex; align-items: center; }
      .header-meta { font-size: 0.85rem; color: #6b7280; margin-top: 0.15rem; }
      .header-actions { display: flex; gap: 0.5rem; }

      .tab-bar {
        display: flex;
        gap: 0;
        border-bottom: 2px solid #e5e7eb;
        margin-bottom: 1.25rem;
      }
      .tab-btn {
        padding: 0.6rem 1.25rem;
        font-size: 0.875rem;
        font-weight: 500;
        color: #6b7280;
        border-bottom: 2px solid transparent;
        cursor: pointer;
        margin-bottom: -2px;
        background: none;
        border-top: none; border-left: none; border-right: none;
        transition: color 0.2s, border-color 0.2s;
      }
      .tab-btn:hover { color: #374151; }
      .tab-btn.active { color: #4f46e5; border-bottom-color: #4f46e5; }

      .tab-content { min-height: 200px; }

      .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.25rem; }
      .info-section {
        background: white;
        border: 1px solid #e5e7eb;
        border-radius: 0.5rem;
        padding: 1rem 1.25rem;
      }
      .info-section-title { font-size: 0.8rem; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 0.75rem; }
      .info-rows { display: flex; flex-direction: column; gap: 0.5rem; }
      .info-row { display: flex; justify-content: space-between; font-size: 0.875rem; padding: 0.25rem 0; border-bottom: 1px solid #f9fafb; }
      .info-label { color: #6b7280; }
      .info-value { color: #111827; font-weight: 500; text-align: right; }

      .nom-card {
        background: white;
        border: 1px solid #e5e7eb;
        border-radius: 0.75rem;
        padding: 1.25rem 1.5rem;
        margin-bottom: 0.9rem;
      }
      .nom-header { display: flex; align-items: center; margin-bottom: 0.5rem; }
      .nom-members { font-size: 0.9rem; margin-top: 0.75rem; }
      .nom-member-row { display: grid; grid-template-columns: 2fr 1.5fr 1fr 1.5fr; gap: 0.75rem; padding: 0.45rem 0; border-bottom: 1px solid #f3f4f6; }
      .nom-member-row.header { font-weight: 600; color: #374151; border-bottom-color: #d1d5db; }
      .nom-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
      .member-row {
        display: grid;
        grid-template-columns: 1fr 1fr 0.5fr 0.75fr;
        gap: 0.5rem;
        padding: 0.5rem;
        background: #f9fafb;
        border-radius: 0.375rem;
        margin-bottom: 0.5rem;
      }
      .form-field { display: flex; flex-direction: column; gap: 0.25rem; }
      .form-label { font-size: 0.875rem; font-weight: 500; color: #374151; }
      .form-date-input {
        padding: 0.5rem 0.75rem;
        border: 1px solid #d1d5db;
        border-radius: 0.5rem;
        font-size: 0.875rem;
        color: #111827;
        background: white;
        height: 38px;
      }
      .form-date-input:focus { outline: none; border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,0.1); }
      .form-error { color: #dc2626; font-size: 0.85rem; }
      .form-actions { display: flex; gap: 0.75rem; justify-content: flex-end; margin-top: 1rem; }

      .form-card {
        background: white;
        border: 1px solid #e5e7eb;
        border-radius: 0.5rem;
        padding: 0.75rem 1rem;
        margin-bottom: 0.5rem;
      }

      @media (max-width: 640px) {
        .info-grid { grid-template-columns: 1fr; }
        .nom-form-grid { grid-template-columns: 1fr; }
        .member-row { grid-template-columns: 1fr; }
        .header-top { flex-direction: column; }
      }
    `,
  ],
})
export class ClientEmployeeDetailComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  employeeId = '';
  emp: Employee | null = null;
  loading = false;
  error = '';

  activeTab: DetailTab = 'profile';
  tabs = [
    { key: 'profile' as DetailTab, label: 'Profile' },
    { key: 'nominations' as DetailTab, label: 'Nominations' },
    { key: 'forms' as DetailTab, label: 'Forms' },
  ];

  // Nominations
  nominations: EmployeeNomination[] = [];
  loadingNoms = false;
  showNomModal = false;
  nomForm: any = {};
  nomFormError = '';
  savingNom = false;

  nomTypeOptions = [
    { label: 'Select type', value: '' },
    { label: 'PF Nomination', value: 'PF' },
    { label: 'ESI Nomination', value: 'ESI' },
    { label: 'Gratuity', value: 'GRATUITY' },
    { label: 'Insurance', value: 'INSURANCE' },
    { label: 'Salary', value: 'SALARY' },
  ];

  // Forms
  forms: any[] = [];
  loadingForms = false;
  generatingForm = '';
  formGenMsg = '';
  formGenError = false;

  formTypes = [
    { label: 'PF Form 2', value: 'PF_FORM_2' },
    { label: 'ESI Form 1', value: 'ESI_FORM_1' },
    { label: 'Gratuity Form F', value: 'GRATUITY_FORM_F' },
  ];

  constructor(
    private svc: ClientEmployeesService,
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.employeeId = this.route.snapshot.paramMap.get('id') || '';
    this.loadEmployee();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadEmployee(): void {
    this.loading = true;
    this.error = '';
    this.svc
      .getById(this.employeeId)
      .pipe(takeUntil(this.destroy$), finalize(() => { this.loading = false; this.cdr.detectChanges(); }))
      .subscribe({
        next: (emp) => {
          this.loading = false;
          this.emp = emp;
        },
        error: () => {
          this.loading = false;
          this.error = 'Employee not found or access denied.';
        },
      });
  }

  switchTab(tab: DetailTab): void {
    this.activeTab = tab;
    if (tab === 'nominations' && this.nominations.length === 0) this.loadNominations();
    if (tab === 'forms' && this.forms.length === 0) this.loadForms();
  }

  editEmployee(): void {
    this.router.navigate(['/client/employees', this.employeeId, 'edit']);
  }

  confirmDeactivate(): void {
    if (!this.emp || !confirm(`Deactivate ${this.emp.firstName} ${this.emp.lastName || ''}?`)) return;
    this.svc.deactivate(this.employeeId).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => this.loadEmployee(),
      error: (e) => alert(e?.error?.message || 'Failed to deactivate'),
    });
  }

  goBack(): void {
    this.router.navigate(['/client/employees']);
  }

  // ── Nominations ─────────────────────────────────────────────
  loadNominations(): void {
    this.loadingNoms = true;
    this.svc
      .listNominations(this.employeeId)
      .pipe(takeUntil(this.destroy$), finalize(() => { this.loadingNoms = false; this.cdr.detectChanges(); }))
      .subscribe({
        next: (list) => { this.loadingNoms = false; this.nominations = list; },
        error: () => { this.loadingNoms = false; this.nominations = []; },
      });
  }

  openNomForm(): void {
    this.nomFormError = '';
    this.nomForm = {
      nominationType: '',
      declarationDate: '',
      witnessName: '',
      witnessAddress: '',
      members: [{ memberName: '', relationship: '', sharePct: 100, isMinor: false, guardianName: '' }],
    };
    this.showNomModal = true;
  }

  addNomMember(): void {
    this.nomForm.members.push({ memberName: '', relationship: '', sharePct: 0, isMinor: false, guardianName: '' });
  }

  removeNomMember(i: number): void {
    this.nomForm.members.splice(i, 1);
  }

  saveNomination(): void {
    if (!this.nomForm.nominationType) {
      this.nomFormError = 'Nomination type is required';
      return;
    }
    const validMembers = this.nomForm.members.filter((m: any) => m.memberName?.trim());
    if (validMembers.length === 0) {
      this.nomFormError = 'At least one nominee member is required';
      return;
    }
    this.savingNom = true;
    this.nomFormError = '';
    this.svc
      .createNomination(this.employeeId, { ...this.nomForm, members: validMembers })
      .pipe(takeUntil(this.destroy$), finalize(() => { this.savingNom = false; this.cdr.detectChanges(); }))
      .subscribe({
        next: () => {
          this.savingNom = false;
          this.showNomModal = false;
          this.loadNominations();
        },
        error: (e) => {
          this.savingNom = false;
          this.nomFormError = e?.error?.message || 'Failed to save nomination';
        },
      });
  }

  // ── Forms ───────────────────────────────────────────────────
  loadForms(): void {
    this.loadingForms = true;
    this.svc
      .listForms(this.employeeId)
      .pipe(takeUntil(this.destroy$), finalize(() => { this.loadingForms = false; this.cdr.detectChanges(); }))
      .subscribe({
        next: (list) => { this.loadingForms = false; this.forms = list; },
        error: () => { this.loadingForms = false; this.forms = []; },
      });
  }

  generateForm(formType: string): void {
    this.generatingForm = formType;
    this.formGenMsg = '';
    this.svc
      .generateForm(this.employeeId, formType)
      .pipe(takeUntil(this.destroy$), finalize(() => { this.generatingForm = ''; this.cdr.detectChanges(); }))
      .subscribe({
        next: () => {
          this.generatingForm = '';
          this.formGenMsg = `${formType} form generated successfully`;
          this.formGenError = false;
          this.loadForms();
        },
        error: (e) => {
          this.generatingForm = '';
          this.formGenMsg = e?.error?.message || 'Generation failed';
          this.formGenError = true;
        },
      });
  }
}
