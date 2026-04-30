import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';
import { EssApiService, EssNomination } from '../ess-api.service';
import { ConfirmDialogService } from '../../../shared/ui/confirm-dialog/confirm-dialog.service';
import { ToastService } from '../../../shared/toast/toast.service';

@Component({
  selector: 'app-ess-nominations',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="max-w-5xl mx-auto space-y-6">
      <div class="flex justify-between items-center">
        <h1 class="text-2xl font-bold text-gray-900">Nominations</h1>
        <button (click)="openForm()" class="btn-primary">+ Add Nomination</button>
      </div>

      <div *ngIf="loading" class="text-gray-500 text-sm">Loading...</div>

      <div *ngIf="!loading && !nominations.length" class="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-500">
        No nominations yet. Add PF, ESI, Gratuity, Insurance, or Salary nominations.
      </div>

      <div *ngFor="let nom of nominations" class="nom-card">
        <div class="flex items-center gap-3 mb-3">
          <span class="nom-type">{{ nom.nominationType }}</span>
          <span class="nom-status" [ngClass]="statusClass(nom.status)">{{ nom.status }}</span>
          <span *ngIf="nom.declarationDate" class="text-xs text-gray-500">Declared: {{ nom.declarationDate }}</span>
        </div>

        <div *ngIf="nom.members.length" class="mb-2">
          <div class="member-header">
            <span>Name</span><span>Relationship</span><span>Share %</span><span>DOB</span><span>Minor</span>
          </div>
          <div *ngFor="let m of nom.members" class="member-row">
            <span>{{ m.memberName }}</span>
            <span>{{ m.relationship || '-' }}</span>
            <span>{{ m.sharePct }}%</span>
            <span>{{ m.dateOfBirth || '-' }}</span>
            <span>{{ m.isMinor ? 'Yes' : 'No' }}</span>
          </div>
          <div *ngFor="let m of nom.members" class="member-address-row">
            <ng-container *ngIf="m.address">
              <span class="text-xs text-gray-500"><strong>{{ m.memberName }}</strong> address: {{ m.address }}</span>
            </ng-container>
            <ng-container *ngIf="m.isMinor && m.guardianName">
              <span class="text-xs text-blue-700 ml-4">Guardian: {{ m.guardianName }}<ng-container *ngIf="m.guardianRelationship"> ({{ m.guardianRelationship }})</ng-container></span>
            </ng-container>
          </div>
        </div>

        <div *ngIf="nom.witnessName" class="text-xs text-gray-500">
          Witness: {{ nom.witnessName }} <span *ngIf="nom.witnessAddress">({{ nom.witnessAddress }})</span>
        </div>
        <div *ngIf="nom.rejectionReason" class="text-xs text-red-600 mt-1">
          Rejection: {{ nom.rejectionReason }}
        </div>

        <!-- Workflow action buttons -->
        <div class="flex gap-2 mt-3">
          <button *ngIf="nom.status === 'DRAFT'" (click)="submitNomination(nom)" [disabled]="actionPending"
                  class="action-btn submit-btn">Submit for Approval</button>
          <button *ngIf="nom.status === 'DRAFT'" (click)="openEditForm(nom)" [disabled]="actionPending"
                  class="action-btn edit-btn">Edit</button>
          <button *ngIf="nom.status === 'APPROVED'" (click)="openEditForm(nom)"
                  class="action-btn edit-btn">Edit / Update</button>
          <button *ngIf="nom.status === 'REJECTED'" (click)="openResubmitForm(nom)" class="action-btn resubmit-btn">
            Edit &amp; Resubmit</button>
        </div>
      </div>

      <!-- Form modal -->
      <div *ngIf="showForm" class="modal-overlay" (click)="closeForm()">
        <div class="modal-panel" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h2 class="text-lg font-semibold">{{ editId ? 'Edit Nomination' : resubmitId ? 'Edit &amp; Resubmit' : 'Add Nomination' }}</h2>
            <button (click)="closeForm()" class="text-gray-400 hover:text-gray-600">&times;</button>
          </div>
          <div class="modal-body space-y-4">
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="field-label" for="nom-type">Nomination Type *</label>
                <select id="nom-type" name="nominationType" [(ngModel)]="form.nominationType" class="field-input">
                  <option value="">Select type</option>
                  <option value="PF">PF</option>
                  <option value="ESI">ESI</option>
                  <option value="GRATUITY">Gratuity</option>
                  <option value="INSURANCE">Insurance</option>
                  <option value="SALARY">Salary</option>
                </select>
              </div>
              <div>
                <label class="field-label" for="nom-declaration-date">Declaration Date</label>
                <input autocomplete="off" id="nom-declaration-date" name="declarationDate" type="date" [(ngModel)]="form.declarationDate" class="field-input" />
              </div>
              <div>
                <label class="field-label" for="nom-witness-name">Witness Name</label>
                <input autocomplete="off" id="nom-witness-name" name="witnessName" type="text" [(ngModel)]="form.witnessName" class="field-input" />
              </div>
              <div>
                <label class="field-label" for="nom-witness-address">Witness Address</label>
                <input autocomplete="off" id="nom-witness-address" name="witnessAddress" type="text" [(ngModel)]="form.witnessAddress" class="field-input" />
              </div>
            </div>

            <div>
              <div class="flex justify-between items-center mb-2">
                <span class="field-label">Nominee Members</span>
                <button class="text-xs text-blue-600 hover:underline" (click)="addMember()">+ Add Member</button>
              </div>
              <div *ngFor="let m of form.members; let i = index" class="member-form-block">
                <div class="member-form-block-header">
                  <span class="text-sm font-semibold text-gray-700">Nominee {{ i + 1 }}</span>
                  <button *ngIf="form.members.length > 1" (click)="form.members.splice(i, 1)"
                          class="text-xs text-red-600 hover:underline">Remove</button>
                </div>
                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="field-label" [attr.for]="'member-name-' + i">Nominee Name *</label>
                    <input autocomplete="off" [id]="'member-name-' + i" [name]="'memberName-' + i" type="text" [(ngModel)]="m.memberName" placeholder="Full name" class="field-input" />
                  </div>
                  <div>
                    <label class="field-label" [attr.for]="'member-rel-' + i">Relationship *</label>
                    <select [id]="'member-rel-' + i" [name]="'relationship-' + i" [(ngModel)]="m.relationship" (ngModelChange)="onRelationshipChange(m)" class="field-input">
                      <option value="">Select relationship</option>
                      <option value="Father">Father</option>
                      <option value="Mother">Mother</option>
                      <option value="Spouse">Spouse</option>
                      <option value="Son">Son</option>
                      <option value="Daughter">Daughter</option>
                      <option value="Dependent Brother (Minor)">Dependent Brother (Minor)</option>
                      <option value="Dependent Sister (Minor)">Dependent Sister (Minor)</option>
                      <option value="Dependent Brother (Person with Disability)">Dependent Brother (Person with Disability)</option>
                      <option value="Dependent Sister (Person with Disability)">Dependent Sister (Person with Disability)</option>
                    </select>
                  </div>
                  <div>
                    <label class="field-label" [attr.for]="'member-dob-' + i">Date of Birth *</label>
                    <input autocomplete="off" [id]="'member-dob-' + i" [name]="'dateOfBirth-' + i" type="date" [(ngModel)]="m.dateOfBirth" class="field-input" />
                  </div>
                  <div>
                    <label class="field-label" [attr.for]="'member-share-' + i">Share % *</label>
                    <input autocomplete="off" [id]="'member-share-' + i" [name]="'sharePct-' + i" type="number" [(ngModel)]="m.sharePct" min="1" max="100" class="field-input" />
                  </div>
                  <div class="col-span-2">
                    <label class="field-label" [attr.for]="'member-addr-' + i">Nominee Address *</label>
                    <textarea [id]="'member-addr-' + i" [name]="'address-' + i" [(ngModel)]="m.address" rows="2" placeholder="Full address" class="field-input"></textarea>
                  </div>
                </div>
                <!-- Guardian section: shown only when isMinor -->
                <div *ngIf="m.isMinor" class="guardian-section mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p class="text-xs font-semibold text-blue-700 mb-2">Guardian Details (required for Dependent nominee)</p>
                  <div class="grid grid-cols-2 gap-3">
                    <div>
                      <label class="field-label" [attr.for]="'guardian-name-' + i">Guardian Name *</label>
                      <input autocomplete="off" [id]="'guardian-name-' + i" [name]="'guardianName-' + i" type="text" [(ngModel)]="m.guardianName" placeholder="Guardian full name" class="field-input" />
                    </div>
                    <div>
                      <label class="field-label" [attr.for]="'guardian-rel-' + i">Guardian Relationship</label>
                      <input autocomplete="off" [id]="'guardian-rel-' + i" [name]="'guardianRelationship-' + i" type="text" [(ngModel)]="m.guardianRelationship" placeholder="e.g. Father, Mother" class="field-input" />
                    </div>
                    <div class="col-span-2">
                      <label class="field-label" [attr.for]="'guardian-addr-' + i">Guardian Address *</label>
                      <textarea [id]="'guardian-addr-' + i" [name]="'guardianAddress-' + i" [(ngModel)]="m.guardianAddress" rows="2" placeholder="Guardian's full address" class="field-input"></textarea>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div *ngIf="formError" class="text-red-600 text-sm">{{ formError }}</div>
          </div>
          <div class="modal-footer">
            <button (click)="closeForm()" class="btn-secondary">Cancel</button>
            <button *ngIf="!resubmitId && !editId" (click)="save(true)" [disabled]="saving" class="btn-secondary">
              {{ saving ? 'Saving...' : 'Save as Draft' }}
            </button>
            <button *ngIf="!resubmitId && !editId" (click)="save(false)" [disabled]="saving" class="btn-primary">
              {{ saving ? 'Saving...' : 'Save & Submit' }}
            </button>
            <button *ngIf="editId" (click)="saveEdit(true)" [disabled]="saving" class="btn-secondary">
              {{ saving ? 'Saving...' : 'Save as Draft' }}
            </button>
            <button *ngIf="editId" (click)="saveEdit(false)" [disabled]="saving" class="btn-primary">
              {{ saving ? 'Saving...' : 'Save & Submit' }}
            </button>
            <button *ngIf="resubmitId" (click)="doResubmit()" [disabled]="saving" class="btn-primary">
              {{ saving ? 'Resubmitting...' : 'Resubmit' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .btn-primary {
      background: #0f2547;
      color: #fff;
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      border: none;
      cursor: pointer;
      transition: opacity 0.15s;
    }
    .btn-primary:hover { opacity: 0.9; }
    .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-secondary {
      background: #f3f4f6;
      color: #374151;
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      border: 1px solid #d1d5db;
      cursor: pointer;
    }

    .nom-card {
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      padding: 16px 20px;
    }
    .nom-type {
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      background: #e0ecff;
      color: #1d4ed8;
      padding: 4px 10px;
      border-radius: 999px;
    }
    .nom-status {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      padding: 3px 8px;
      border-radius: 999px;
    }
    .status-DRAFT { background: #f3f4f6; color: #6b7280; }
    .status-SUBMITTED { background: #fef3c7; color: #b45309; }
    .status-APPROVED { background: #dcfce7; color: #15803d; }
    .status-REJECTED { background: #fee2e2; color: #b91c1c; }

    .action-btn {
      padding: 5px 14px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      border: none;
      cursor: pointer;
      transition: opacity 0.15s;
    }
    .action-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .submit-btn { background: #059669; color: white; }
    .submit-btn:hover { opacity: 0.9; }
    .resubmit-btn { background: #d97706; color: white; }
    .resubmit-btn:hover { opacity: 0.9; }
    .edit-btn { background: #4f46e5; color: white; }
    .edit-btn:hover { opacity: 0.9; }

    .member-header, .member-row {
      display: grid;
      grid-template-columns: 2fr 2fr 0.8fr 1.2fr 0.8fr;
      gap: 8px;
      padding: 5px 0;
      font-size: 13px;
      border-bottom: 1px solid #f3f4f6;
    }
    .member-header {
      font-weight: 600;
      color: #374151;
      border-bottom-color: #d1d5db;
    }
    .member-address-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      padding: 4px 0;
    }

    .member-form-block {
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 12px;
      margin-bottom: 10px;
      background: #fafafa;
    }
    .member-form-block-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
    }
    .guardian-section {}

    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.4);
      z-index: 50;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .modal-panel {
      background: white;
      border-radius: 16px;
      width: 95%;
      max-width: 780px;
      max-height: 90vh;
      overflow-y: auto;
      box-shadow: 0 20px 60px rgba(0,0,0,0.2);
    }
    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 20px;
      border-bottom: 1px solid #e5e7eb;
    }
    .modal-body { padding: 16px 20px; }
    .modal-footer {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      padding: 12px 20px;
      border-top: 1px solid #e5e7eb;
    }

    .field-label {
      display: block;
      font-size: 13px;
      font-weight: 500;
      color: #374151;
      margin-bottom: 4px;
    }
    .field-input {
      width: 100%;
      padding: 8px 10px;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      font-size: 14px;
      color: #111827;
      background: white;
    }
    .field-input:focus { outline: none; border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,0.1); }
  `],
})
export class EssNominationsComponent implements OnInit, OnDestroy {
  nominations: EssNomination[] = [];
  loading = false;
  showForm = false;
  saving = false;
  formError = '';
  form: any = {};
  actionPending = false;
  resubmitId: string | null = null;
  editId: string | null = null;
  private readonly destroy$ = new Subject<void>();

  constructor(private api: EssApiService, private cdr: ChangeDetectorRef, private dialog: ConfirmDialogService, private toast: ToastService) {}

  ngOnInit(): void {
    this.loadNominations();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadNominations(): void {
    if (this.loading && this.nominations.length) return; // prevent double-load
    this.loading = true;
    this.api.listNominations()
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => { this.loading = false; this.cdr.detectChanges(); }),
      )
      .subscribe({
        next: (list) => { this.loading = false; this.nominations = list; },
        error: () => { this.loading = false; this.nominations = []; },
      });
  }

  statusClass(status: string): string {
    return `status-${status}`;
  }

  closeForm(): void {
    this.showForm = false;
    this.editId = null;
    this.resubmitId = null;
    this.formError = '';
  }

  openForm(): void {
    this.formError = '';
    this.resubmitId = null;
    this.editId = null;
    this.form = {
      nominationType: '',
      declarationDate: '',
      witnessName: '',
      witnessAddress: '',
      members: [{ memberName: '', relationship: '', sharePct: 100, isMinor: false, dateOfBirth: '', address: '', guardianName: '', guardianRelationship: '', guardianAddress: '' }],
    };
    this.showForm = true;
  }

  addMember(): void {
    this.form.members.push({ memberName: '', relationship: '', sharePct: 0, isMinor: false, dateOfBirth: '', address: '', guardianName: '', guardianRelationship: '', guardianAddress: '' });
  }

  onRelationshipChange(m: any): void {
    m.isMinor = m.relationship?.startsWith('Dependent') ?? false;
  }

  save(asDraft: boolean): void {
    if (!this.form.nominationType) {
      this.formError = 'Nomination type is required';
      return;
    }
    const validMembers = this.form.members.filter((m: any) => m.memberName?.trim());
    if (!validMembers.length) {
      this.formError = 'At least one nominee member is required';
      return;
    }
    for (const m of validMembers) {
      if (!m.dateOfBirth) { this.formError = `Date of birth is required for ${m.memberName || 'nominee'}`; return; }
      if (!m.address?.trim()) { this.formError = `Address is required for ${m.memberName || 'nominee'}`; return; }
      if (m.isMinor && !m.guardianName?.trim()) { this.formError = `Guardian name is required for dependent nominee ${m.memberName || ''}`; return; }
      if (m.isMinor && !m.guardianAddress?.trim()) { this.formError = `Guardian address is required for dependent nominee ${m.memberName || ''}`; return; }
    }
    this.saving = true;
    this.formError = '';
    this.api.createNomination({ ...this.form, members: validMembers, asDraft })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => { this.saving = false; this.cdr.detectChanges(); }),
      )
      .subscribe({
        next: () => {
          this.saving = false;
          this.showForm = false;
          this.loadNominations();
        },
        error: (e) => {
          this.saving = false;
          this.formError = e?.error?.message || 'Failed to save nomination';
        },
      });
  }

  async submitNomination(nom: EssNomination): Promise<void> {
    if (!(await this.dialog.confirm('Submit Nomination', 'Submit this nomination for approval? You will not be able to edit it afterwards.'))) return;
    this.actionPending = true;
    this.api.submitNomination(nom.id)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => { this.actionPending = false; this.cdr.detectChanges(); }),
      )
      .subscribe({
        next: () => { this.actionPending = false; this.loadNominations(); },
        error: (e) => { this.actionPending = false; this.toast.error(e?.error?.message || 'Failed to submit'); },
      });
  }

  openResubmitForm(nom: EssNomination): void {
    this.formError = '';
    this.resubmitId = nom.id;
    this.editId = null;
    this.form = {
      nominationType: nom.nominationType,
      declarationDate: nom.declarationDate || '',
      witnessName: nom.witnessName || '',
      witnessAddress: nom.witnessAddress || '',
      members: nom.members.length
        ? nom.members.map(m => ({ ...m, dateOfBirth: m.dateOfBirth || '', address: m.address || '', guardianName: m.guardianName || '', guardianRelationship: m.guardianRelationship || '', guardianAddress: m.guardianAddress || '' }))
        : [{ memberName: '', relationship: '', sharePct: 100, isMinor: false, dateOfBirth: '', address: '', guardianName: '', guardianRelationship: '', guardianAddress: '' }],
    };
    this.showForm = true;
  }

  openEditForm(nom: EssNomination): void {
    this.formError = '';
    this.resubmitId = null;
    this.editId = nom.id;
    this.form = {
      nominationType: nom.nominationType,
      declarationDate: nom.declarationDate || '',
      witnessName: nom.witnessName || '',
      witnessAddress: nom.witnessAddress || '',
      members: nom.members.length
        ? nom.members.map(m => ({ ...m, dateOfBirth: m.dateOfBirth || '', address: m.address || '', guardianName: m.guardianName || '', guardianRelationship: m.guardianRelationship || '', guardianAddress: m.guardianAddress || '' }))
        : [{ memberName: '', relationship: '', sharePct: 100, isMinor: false, dateOfBirth: '', address: '', guardianName: '', guardianRelationship: '', guardianAddress: '' }],
    };
    this.showForm = true;
  }

  saveEdit(asDraft: boolean): void {
    const validMembers = this.form.members.filter((m: any) => m.memberName?.trim());
    if (!validMembers.length) {
      this.formError = 'At least one nominee member is required';
      return;
    }
    for (const m of validMembers) {
      if (!m.dateOfBirth) { this.formError = `Date of birth is required for ${m.memberName || 'nominee'}`; return; }
      if (!m.address?.trim()) { this.formError = `Address is required for ${m.memberName || 'nominee'}`; return; }
      if (m.isMinor && !m.guardianName?.trim()) { this.formError = `Guardian name is required for dependent nominee ${m.memberName || ''}`; return; }
      if (m.isMinor && !m.guardianAddress?.trim()) { this.formError = `Guardian address is required for dependent nominee ${m.memberName || ''}`; return; }
    }
    this.saving = true;
    this.formError = '';
    this.api.updateNomination(this.editId!, { ...this.form, members: validMembers, asDraft })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => { this.saving = false; this.cdr.detectChanges(); }),
      )
      .subscribe({
        next: () => {
          this.saving = false;
          this.showForm = false;
          this.editId = null;
          this.loadNominations();
        },
        error: (e) => {
          this.saving = false;
          this.formError = e?.error?.message || 'Failed to update nomination';
        },
      });
  }

  doResubmit(): void {
    const validMembers = this.form.members.filter((m: any) => m.memberName?.trim());
    if (!validMembers.length) {
      this.formError = 'At least one nominee member is required';
      return;
    }
    for (const m of validMembers) {
      if (!m.dateOfBirth) { this.formError = `Date of birth is required for ${m.memberName || 'nominee'}`; return; }
      if (!m.address?.trim()) { this.formError = `Address is required for ${m.memberName || 'nominee'}`; return; }
      if (m.isMinor && !m.guardianName?.trim()) { this.formError = `Guardian name is required for dependent nominee ${m.memberName || ''}`; return; }
      if (m.isMinor && !m.guardianAddress?.trim()) { this.formError = `Guardian address is required for dependent nominee ${m.memberName || ''}`; return; }
    }
    this.saving = true;
    this.formError = '';
    this.api.resubmitNomination(this.resubmitId!, { ...this.form, members: validMembers })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => { this.saving = false; this.cdr.detectChanges(); }),
      )
      .subscribe({
        next: () => {
          this.saving = false;
          this.showForm = false;
          this.resubmitId = null;
          this.loadNominations();
        },
        error: (e) => {
          this.saving = false;
          this.formError = e?.error?.message || 'Failed to resubmit';
        },
      });
  }
}
