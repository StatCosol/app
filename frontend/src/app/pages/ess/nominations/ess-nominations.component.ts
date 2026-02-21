import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs/operators';
import { EssApiService, EssNomination } from '../ess-api.service';

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
            <span>Name</span><span>Relationship</span><span>Share %</span><span>Minor</span>
          </div>
          <div *ngFor="let m of nom.members" class="member-row">
            <span>{{ m.memberName }}</span>
            <span>{{ m.relationship || '-' }}</span>
            <span>{{ m.sharePct }}%</span>
            <span>{{ m.isMinor ? 'Yes' : 'No' }}</span>
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
          <button *ngIf="nom.status === 'REJECTED'" (click)="openResubmitForm(nom)" class="action-btn resubmit-btn">
            Edit &amp; Resubmit</button>
        </div>
      </div>

      <!-- Form modal -->
      <div *ngIf="showForm" class="modal-overlay" (click)="showForm = false">
        <div class="modal-panel" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h2 class="text-lg font-semibold">Add Nomination</h2>
            <button (click)="showForm = false" class="text-gray-400 hover:text-gray-600">&times;</button>
          </div>
          <div class="modal-body space-y-4">
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="field-label">Nomination Type *</label>
                <select [(ngModel)]="form.nominationType" class="field-input">
                  <option value="">Select type</option>
                  <option value="PF">PF</option>
                  <option value="ESI">ESI</option>
                  <option value="GRATUITY">Gratuity</option>
                  <option value="INSURANCE">Insurance</option>
                  <option value="SALARY">Salary</option>
                </select>
              </div>
              <div>
                <label class="field-label">Declaration Date</label>
                <input type="date" [(ngModel)]="form.declarationDate" class="field-input" />
              </div>
              <div>
                <label class="field-label">Witness Name</label>
                <input type="text" [(ngModel)]="form.witnessName" class="field-input" />
              </div>
              <div>
                <label class="field-label">Witness Address</label>
                <input type="text" [(ngModel)]="form.witnessAddress" class="field-input" />
              </div>
            </div>

            <div>
              <div class="flex justify-between items-center mb-2">
                <label class="field-label">Nominee Members</label>
                <button class="text-xs text-blue-600 hover:underline" (click)="addMember()">+ Add Member</button>
              </div>
              <div *ngFor="let m of form.members; let i = index" class="member-form-row">
                <input type="text" [(ngModel)]="m.memberName" placeholder="Name *" class="field-input" />
                <input type="text" [(ngModel)]="m.relationship" placeholder="Relationship" class="field-input" />
                <input type="number" [(ngModel)]="m.sharePct" placeholder="Share %" class="field-input" />
                <label class="flex items-center gap-1 text-xs">
                  <input type="checkbox" [(ngModel)]="m.isMinor" /> Minor
                </label>
                <button *ngIf="form.members.length > 1" (click)="form.members.splice(i, 1)"
                        class="text-xs text-red-600 hover:underline">Remove</button>
              </div>
            </div>

            <div *ngIf="formError" class="text-red-600 text-sm">{{ formError }}</div>
          </div>
          <div class="modal-footer">
            <button (click)="showForm = false" class="btn-secondary">Cancel</button>
            <button *ngIf="!resubmitId" (click)="save(true)" [disabled]="saving" class="btn-secondary">
              {{ saving ? 'Saving...' : 'Save as Draft' }}
            </button>
            <button *ngIf="!resubmitId" (click)="save(false)" [disabled]="saving" class="btn-primary">
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

    .member-header, .member-row {
      display: grid;
      grid-template-columns: 2fr 1.5fr 1fr 1fr;
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

    .member-form-row {
      display: grid;
      grid-template-columns: 1fr 1fr 0.5fr auto auto;
      gap: 8px;
      margin-bottom: 8px;
      align-items: center;
    }

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
      max-width: 700px;
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
export class EssNominationsComponent implements OnInit {
  nominations: EssNomination[] = [];
  loading = true;
  showForm = false;
  saving = false;
  formError = '';
  form: any = {};
  actionPending = false;
  resubmitId: string | null = null;

  constructor(private api: EssApiService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.loadNominations();
  }

  loadNominations(): void {
    this.loading = true;
    this.api.listNominations()
      .pipe(finalize(() => { this.loading = false; this.cdr.detectChanges(); }))
      .subscribe({
        next: (list) => { this.nominations = list; },
        error: () => { this.nominations = []; },
      });
  }

  statusClass(status: string): string {
    return `status-${status}`;
  }

  openForm(): void {
    this.formError = '';
    this.resubmitId = null;
    this.form = {
      nominationType: '',
      declarationDate: '',
      witnessName: '',
      witnessAddress: '',
      members: [{ memberName: '', relationship: '', sharePct: 100, isMinor: false }],
    };
    this.showForm = true;
  }

  addMember(): void {
    this.form.members.push({ memberName: '', relationship: '', sharePct: 0, isMinor: false });
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
    this.saving = true;
    this.formError = '';
    this.api.createNomination({ ...this.form, members: validMembers, asDraft })
      .pipe(finalize(() => { this.saving = false; this.cdr.detectChanges(); }))
      .subscribe({
        next: () => {
          this.showForm = false;
          this.loadNominations();
        },
        error: (e) => {
          this.formError = e?.error?.message || 'Failed to save nomination';
        },
      });
  }

  submitNomination(nom: EssNomination): void {
    if (!confirm('Submit this nomination for approval? You will not be able to edit it afterwards.')) return;
    this.actionPending = true;
    this.api.submitNomination(nom.id)
      .pipe(finalize(() => { this.actionPending = false; this.cdr.detectChanges(); }))
      .subscribe({
        next: () => this.loadNominations(),
        error: (e) => alert(e?.error?.message || 'Failed to submit'),
      });
  }

  openResubmitForm(nom: EssNomination): void {
    this.formError = '';
    this.resubmitId = nom.id;
    this.form = {
      nominationType: nom.nominationType,
      declarationDate: nom.declarationDate || '',
      witnessName: nom.witnessName || '',
      witnessAddress: nom.witnessAddress || '',
      members: nom.members.length
        ? nom.members.map(m => ({ ...m }))
        : [{ memberName: '', relationship: '', sharePct: 100, isMinor: false }],
    };
    this.showForm = true;
  }

  doResubmit(): void {
    const validMembers = this.form.members.filter((m: any) => m.memberName?.trim());
    if (!validMembers.length) {
      this.formError = 'At least one nominee member is required';
      return;
    }
    this.saving = true;
    this.formError = '';
    this.api.resubmitNomination(this.resubmitId!, { ...this.form, members: validMembers })
      .pipe(finalize(() => { this.saving = false; this.cdr.detectChanges(); }))
      .subscribe({
        next: () => {
          this.showForm = false;
          this.resubmitId = null;
          this.loadNominations();
        },
        error: (e) => {
          this.formError = e?.error?.message || 'Failed to resubmit';
        },
      });
  }
}
