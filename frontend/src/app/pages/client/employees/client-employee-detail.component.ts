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
import { EmployeeDocumentService, EmployeeDocument } from './employee-document.service';
import { SalaryRevisionService, SalaryRevision } from './salary-revision.service';
import { ToastService } from '../../../shared/toast/toast.service';
import { ConfirmDialogService } from '../../../shared/ui/confirm-dialog/confirm-dialog.service';
import {
  ActionButtonComponent,
  StatusBadgeComponent,
  LoadingSpinnerComponent,
  EmptyStateComponent,
  ModalComponent,
  FormInputComponent,
  FormSelectComponent,
} from '../../../shared/ui';

type DetailTab = 'profile' | 'nominations' | 'forms' | 'documents' | 'salary';

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

      @if (loading) {
<ui-loading-spinner text="Loading employee..." size="lg"></ui-loading-spinner>
}

      <!-- Error -->
      @if (error && !loading) {
<div
           class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-6 flex items-center justify-between">
        <span>{{ error }}</span>
        <button (click)="goBack()" class="text-red-800 font-semibold hover:underline ml-4">Go Back</button>
      </div>
}

      @if (emp && !loading) {

        <!-- Header Card -->
        <div class="header-card">
          <div class="header-top">
            <div class="header-info">
              <div class="header-name">
                {{ emp.name }}
                <ui-status-badge [status]="emp.isActive ? 'ACTIVE' : 'INACTIVE'" class="ml-2"></ui-status-badge>
                @if (emp.approvalStatus === 'PENDING') {
<span class="ml-2 inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">Pending Approval</span>
}
                @if (emp.approvalStatus === 'REJECTED') {
<span class="ml-2 inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">Rejected</span>
}
              </div>
              <div class="header-meta">{{ emp.employeeCode }}</div>
              @if (emp.designation || emp.department) {
<div class="header-meta">
                {{ emp.designation || '' }}@if (emp.designation && emp.department) {
<span> &middot; </span>
}{{ emp.department || '' }}
              </div>
}
            </div>
            <div class="header-actions">
              @if (emp.approvalStatus === 'PENDING') {
<ui-button variant="primary" (clicked)="approveEmployee()">Approve</ui-button>
}
              @if (emp.approvalStatus === 'PENDING') {
<ui-button variant="danger" (clicked)="rejectEmployee()">Reject</ui-button>
}
              <ui-button variant="secondary" (clicked)="editEmployee()">Edit</ui-button>
              <ui-button variant="outline" [disabled]="downloadingLetter" (clicked)="downloadAppointmentLetter()">
                {{ downloadingLetter ? 'Downloading...' : 'Appointment Letter (PDF)' }}
              </ui-button>
              <ui-button variant="outline" [disabled]="downloadingDocx" (clicked)="downloadAppointmentLetterDocx()">
                {{ downloadingDocx ? 'Downloading...' : 'Appointment Letter (Word)' }}
              </ui-button>
              @if (emp.isActive && emp.approvalStatus !== 'PENDING') {
<ui-button variant="secondary" [disabled]="provisioningEss || !hasValidEmail()" (clicked)="provisionEssLogin()"
                [title]="hasValidEmail() ? 'Create ESS login for this employee' : 'Add a valid employee email first to create ESS login'">
                {{ provisioningEss ? 'Creating...' : 'Create ESS Login' }}
              </ui-button>
}
              @if (emp.isActive && emp.approvalStatus !== 'PENDING') {
<ui-button variant="outline" [disabled]="resettingEssPassword || !hasValidEmail()" (clicked)="resetEssPassword()"
                [title]="hasValidEmail() ? 'Reset ESS password for this employee' : 'Add a valid employee email first'">
                {{ resettingEssPassword ? 'Resetting...' : 'Reset ESS Password' }}
              </ui-button>
}
              @if (emp.isActive && emp.approvalStatus !== 'PENDING') {
<ui-button variant="danger" (clicked)="confirmDeactivate()">Mark Exit</ui-button>
}
            </div>
          </div>
        </div>

        <!-- ESS Credentials Card (persistent after provisioning) -->
        @if (essResult?.generatedPassword) {
<div class="ess-credentials-card">
          <div class="ess-cred-header">
            <div class="flex items-center gap-2">
              <svg class="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
              <h4 class="text-sm font-semibold text-green-800">{{ resettingEssPassword ? 'ESS Password Reset' : 'ESS Login Created Successfully' }}</h4>
            </div>
            <button (click)="essResult = null" class="text-gray-400 hover:text-gray-600 p-1">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
          <p class="text-xs text-amber-700 mb-3">
            <svg class="w-3.5 h-3.5 inline -mt-0.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            Copy these credentials now. The password will not be shown again.
          </p>
          <div class="ess-cred-fields">
            <div class="ess-cred-row">
              <span class="ess-cred-label">Email</span>
              <span class="ess-cred-value">{{ essResult.email }}</span>
              <button class="ess-copy-btn" (click)="copyCredential(essResult.email)" title="Copy email">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
                </svg>
              </button>
            </div>
            <div class="ess-cred-row">
              <span class="ess-cred-label">Password</span>
              <span class="ess-cred-value font-mono">{{ essResult.generatedPassword }}</span>
              <button class="ess-copy-btn" (click)="copyCredential(essResult.generatedPassword)" title="Copy password">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
}

        <!-- Tabs -->
        <div class="tab-bar">
          @for (t of tabs; track t) {
<button
            class="tab-btn"
            [class.active]="activeTab === t.key"
            (click)="switchTab(t.key)">
            {{ t.label }}
          </button>
}
        </div>

        <!-- Profile Tab -->
        @if (activeTab === 'profile') {
<div class="tab-content">
          <div class="info-grid">
            <div class="info-section">
              <h4 class="info-section-title">Personal Information</h4>
              <div class="info-rows">
                <div class="info-row"><span class="info-label">Name as per Aadhaar</span><span class="info-value">{{ emp.name }}</span></div>
                <div class="info-row"><span class="info-label">Gender</span><span class="info-value">{{ emp.gender || '-' }}</span></div>
                <div class="info-row"><span class="info-label">DOB as per Aadhaar</span><span class="info-value">{{ emp.dateOfBirth || '-' }}</span></div>
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
                <div class="info-row"><span class="info-label">Date of Joining</span><span class="info-value">{{ emp.dateOfJoining ? (emp.dateOfJoining | date:'dd/MM/yyyy') : '-' }}</span></div>
                @if (emp.dateOfExit) {
<div class="info-row"><span class="info-label">Date of Exit</span><span class="info-value text-red-600">{{ emp.dateOfExit }}</span></div>
}
                @if (emp.exitReason) {
<div class="info-row"><span class="info-label">Exit Reason</span><span class="info-value text-red-600">{{ emp.exitReason }}</span></div>
}
                <div class="info-row"><span class="info-label">State</span><span class="info-value">{{ emp.stateCode || '-' }}</span></div>
                <div class="info-row"><span class="info-label">CTC (Annual)</span><span class="info-value">{{ emp.ctc ? '₹' + (emp.ctc | number:'1.0-0') : '-' }}</span></div>
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
}

        <!-- Nominations Tab -->
        @if (activeTab === 'nominations') {
<div class="tab-content">
          <div class="flex justify-between items-center mb-4">
            <h3 class="text-base font-semibold text-gray-900">Nominations</h3>
            <ui-button variant="primary" (clicked)="openNomForm()">+ Add Nomination</ui-button>
          </div>

          @if (loadingNoms) {
<ui-loading-spinner text="Loading nominations..."></ui-loading-spinner>
}

          @if (!loadingNoms && nominations.length === 0) {
<ui-empty-state
           
            title="No Nominations"
            description="Add PF, ESI, Gratuity, Insurance, or Salary nominations for this employee.">
          </ui-empty-state>
}

          @for (nom of nominations; track nom) {
<div class="nom-card">
            <div class="nom-header">
              <ui-status-badge [status]="nom.nominationType"></ui-status-badge>
              @if (nom.declarationDate) {
<span class="text-xs text-gray-500 ml-2">Declared: {{ nom.declarationDate }}</span>
}
              <ui-button variant="outline" size="sm" class="ml-auto"
                         [disabled]="printingNomination === nom.nominationType"
                         (clicked)="printNomination(nom.nominationType)">
                {{ printingNomination === nom.nominationType ? 'Preparing...' : 'Print / Download PDF' }}
              </ui-button>
            </div>
            @if (nom.members && nom.members.length) {
<div class="nom-members">
              <div class="nom-member-row header">
                <span>Name</span><span>Relationship</span><span>DOB</span><span>Share %</span><span>Address</span><span>Minor / Guardian</span>
              </div>
              @for (m of nom.members; track m) {
<div class="nom-member-row">
                <span>{{ m.memberName }}</span>
                <span>{{ m.relationship || '-' }}</span>
                <span>{{ m.dateOfBirth || '-' }}</span>
                <span>{{ m.sharePct }}%</span>
                <span>{{ m.address || '-' }}</span>
                <span>{{ m.isMinor ? 'Yes — ' + (m.guardianName || '-') + (m.guardianRelationship ? ' (' + m.guardianRelationship + ')' : '') : 'No' }}</span>
              </div>
}
            </div>
}
            @if (nom.witnessName) {
<div class="text-xs text-gray-500 mt-2">
              Witness: {{ nom.witnessName }} @if (nom.witnessAddress) {
<span>({{ nom.witnessAddress }})</span>
}
            </div>
}
          </div>
}

          <!-- Nomination Form Modal -->
          @if (showNomModal) {
<ui-modal title="Add Nomination" size="full" (closed)="showNomModal = false">
            <div class="nom-form-grid">
              <ui-form-select label="Nomination Type *" [options]="nomTypeOptions"
                              [(ngModel)]="nomForm.nominationType"></ui-form-select>
              <div class="form-field">
                <label class="form-label" for="ced-declaration-date">Declaration Date</label>
                <input autocomplete="off" id="ced-declaration-date" name="declarationDate" type="date" class="form-date-input" [(ngModel)]="nomForm.declarationDate" />
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
              @for (m of nomForm.members; track m; let i = $index) {
<div class="member-row">
                <ui-form-input label="Name *" [(ngModel)]="m.memberName"></ui-form-input>
                <ui-form-input label="Relationship" [(ngModel)]="m.relationship"></ui-form-input>
                <div class="form-field">
                  <label class="form-label" [attr.for]="'ced-nom-dob-' + i">Date of Birth</label>
                  <input autocomplete="off" [id]="'ced-nom-dob-' + i" [name]="'nomDob' + i" type="date" class="form-date-input" [(ngModel)]="m.dateOfBirth" />
                </div>
                <ui-form-input label="Share %" type="number" [(ngModel)]="m.sharePct"></ui-form-input>
                <ui-form-input class="full" label="Address" [(ngModel)]="m.address"></ui-form-input>
                <div class="member-actions">
                  <label class="flex items-center gap-1 text-xs">
                    <input autocomplete="off" [id]="'ced-is-minor-' + i" [name]="'isMinor' + i" type="checkbox" [(ngModel)]="m.isMinor"> Minor (under 18)
                  </label>
                  @if (nomForm.members.length > 1) {
<button
                    class="text-xs text-red-600 hover:underline ml-auto" (click)="removeNomMember(i)">Remove</button>
}
                </div>
                @if (m.isMinor) {
<div class="guardian-block">
                  <ui-form-input label="Guardian Name" [(ngModel)]="m.guardianName"></ui-form-input>
                  <ui-form-input label="Guardian Relationship" [(ngModel)]="m.guardianRelationship"></ui-form-input>
                  <ui-form-input class="full" label="Guardian Address" [(ngModel)]="m.guardianAddress"></ui-form-input>
                </div>
}
              </div>
}
            </div>

            @if (nomFormError) {
<div class="form-error mt-2">{{ nomFormError }}</div>
}

            <div class="form-actions">
              <ui-button variant="secondary" (clicked)="showNomModal = false">Cancel</ui-button>
              <ui-button variant="primary" [disabled]="savingNom" [loading]="savingNom"
                         (clicked)="saveNomination()">Save Nomination</ui-button>
            </div>
          </ui-modal>
}
        </div>
}

        <!-- Forms Tab -->
        @if (activeTab === 'forms') {
<div class="tab-content">
          <div class="flex justify-between items-center mb-4">
            <h3 class="text-base font-semibold text-gray-900">Generated Forms</h3>
            <div class="flex gap-2">
              @for (ft of formTypes; track ft) {
<ui-button variant="outline" size="sm"
                         [loading]="generatingForm === ft.value"
                         (clicked)="generateForm(ft.value)">
                {{ ft.label }}
              </ui-button>
}
            </div>
          </div>

          @if (loadingForms) {
<ui-loading-spinner text="Loading forms..."></ui-loading-spinner>
}

          @if (!loadingForms && forms.length === 0) {
<ui-empty-state
           
            title="No Forms Generated"
            description="Use the buttons above to generate statutory forms for this employee.">
          </ui-empty-state>
}

          @for (f of forms; track f) {
<div class="form-card">
            <div class="flex items-center justify-between">
              <div>
                <div class="font-semibold text-sm text-gray-900">{{ f.formType || f.form_type }}</div>
                <div class="text-xs text-gray-500">{{ f.fileName || f.file_name }}</div>
              </div>
              <div class="text-xs text-gray-400">{{ f.createdAt || f.created_at | date:'medium' }}</div>
            </div>
          </div>
}

          @if (formGenMsg) {
<div class="mt-3 text-sm" [class.text-green-600]="!formGenError" [class.text-red-600]="formGenError">
            {{ formGenMsg }}
          </div>
}
        </div>
}

        <!-- Documents Tab -->
        @if (activeTab === 'documents') {
<div class="tab-content">
          <div class="flex justify-between items-center mb-4">
            <h3 class="text-base font-semibold text-gray-900">Employee Documents</h3>
          </div>

          <!-- Upload Form -->
          <div class="bg-gray-50 rounded-lg border border-gray-200 p-4 mb-4">
            <h4 class="text-sm font-semibold text-gray-700 mb-3">Upload Document</h4>
            <div class="grid grid-cols-2 gap-3">
              <ui-form-select label="Document Type *" [options]="docTypeOptions" [(ngModel)]="docUpload.docType"></ui-form-select>
              <ui-form-input label="Document Name" [(ngModel)]="docUpload.docName" placeholder="e.g. Aadhaar Card"></ui-form-input>
              <div class="form-field">
                <label class="form-label" for="ced-expiry-date">Expiry Date</label>
                <input autocomplete="off" id="ced-expiry-date" name="expiryDate" type="date" class="form-date-input" [(ngModel)]="docUpload.expiryDate" />
              </div>
              <div class="form-field">
                <label class="form-label" for="ced-file-max10mb">File (max 10 MB)</label>
                <input id="ced-file-max10mb" type="file" (change)="onDocFileSelected($event)" class="text-sm border border-gray-300 rounded-lg p-2 bg-white" />
              </div>
            </div>
            <div class="mt-3 flex items-center gap-3">
              <ui-button variant="primary" [disabled]="!docUpload.file || uploadingDoc" [loading]="uploadingDoc" (clicked)="uploadDocument()">
                {{ uploadingDoc ? 'Uploading...' : 'Upload' }}
              </ui-button>
              @if (docUploadMsg) {
<span class="text-sm" [class.text-green-600]="!docUploadError" [class.text-red-600]="docUploadError">{{ docUploadMsg }}</span>
}
            </div>
          </div>

          @if (loadingDocs) {
<ui-loading-spinner text="Loading documents..."></ui-loading-spinner>
}

          @if (!loadingDocs && documents.length === 0) {
<ui-empty-state title="No Documents" description="Upload employee documents using the form above."></ui-empty-state>
}

          @if (!loadingDocs && documents.length > 0) {
<div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table class="w-full text-sm">
              <thead>
                <tr class="bg-gray-50 border-b border-gray-200">
                  <th class="text-left px-4 py-3 font-semibold text-gray-700">Name</th>
                  <th class="text-left px-4 py-3 font-semibold text-gray-700">Type</th>
                  <th class="text-center px-4 py-3 font-semibold text-gray-700">Verified</th>
                  <th class="text-left px-4 py-3 font-semibold text-gray-700">Expiry</th>
                  <th class="text-right px-4 py-3 font-semibold text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                @for (d of documents; track d) {
<tr class="border-b border-gray-100 hover:bg-gray-50">
                  <td class="px-4 py-3 text-gray-900">{{ d.docName }}</td>
                  <td class="px-4 py-3 text-gray-600">{{ d.docType }}</td>
                  <td class="px-4 py-3 text-center">
                    <ui-status-badge [status]="d.isVerified ? 'VERIFIED' : 'PENDING'"></ui-status-badge>
                  </td>
                  <td class="px-4 py-3 text-gray-600">{{ d.expiryDate || '-' }}</td>
                  <td class="px-4 py-3 text-right">
                    <div class="flex justify-end gap-2">
                      <button class="text-xs text-blue-600 hover:underline" (click)="downloadDoc(d)">Download</button>
                      @if (!d.isVerified) {
<button class="text-xs text-green-600 hover:underline" (click)="verifyDoc(d)">Verify</button>
}
                      <button class="text-xs text-red-600 hover:underline" (click)="deleteDoc(d)">Delete</button>
                    </div>
                  </td>
                </tr>
}
              </tbody>
            </table>
          </div>
}
        </div>
}

        <!-- Salary Revisions Tab -->
        @if (activeTab === 'salary') {
<div class="tab-content">
          <div class="flex justify-between items-center mb-4">
            <h3 class="text-base font-semibold text-gray-900">Salary Revisions</h3>
            <ui-button variant="primary" (clicked)="showRevisionModal = true">+ New Revision</ui-button>
          </div>

          @if (loadingRevisions) {
<ui-loading-spinner text="Loading revisions..."></ui-loading-spinner>
}

          @if (!loadingRevisions && revisions.length === 0) {
<ui-empty-state title="No Revisions" description="Add a salary revision using the button above."></ui-empty-state>
}

          @for (rev of revisions; track rev) {
<div class="bg-white border border-gray-200 rounded-lg p-4 mb-3">
            <div class="flex justify-between items-start">
              <div>
                <div class="text-sm font-semibold text-gray-900">Effective: {{ rev.effectiveDate }}</div>
                <div class="text-xs text-gray-500 mt-1">{{ rev.reason || 'No reason specified' }}</div>
              </div>
              <div class="text-right">
                <div class="text-sm">₹{{ rev.previousCtc }} → ₹{{ rev.newCtc }}</div>
                @if (rev.incrementPct) {
<div class="text-xs text-green-600 mt-0.5">+{{ rev.incrementPct }}%</div>
}
              </div>
            </div>
          </div>
}

          <!-- Revision Modal -->
          @if (showRevisionModal) {
<ui-modal title="New Salary Revision" (closed)="showRevisionModal = false">
            <div class="grid grid-cols-2 gap-3">
              <div class="form-field">
                <label class="form-label" for="ced-effective-date">Effective Date *</label>
                <input autocomplete="off" id="ced-effective-date" name="effectiveDate" type="date" class="form-date-input" [(ngModel)]="revisionForm.effectiveDate" />
              </div>
              <ui-form-input label="Previous CTC (₹) *" type="number" [(ngModel)]="revisionForm.previousCtc"></ui-form-input>
              <ui-form-input label="New CTC (₹) *" type="number" [(ngModel)]="revisionForm.newCtc"></ui-form-input>
              <ui-form-input label="Reason" [(ngModel)]="revisionForm.reason" placeholder="e.g. Annual appraisal"></ui-form-input>
            </div>
            @if (revisionError) {
<div class="form-error mt-2">{{ revisionError }}</div>
}
            <div class="form-actions">
              <ui-button variant="secondary" (clicked)="showRevisionModal = false">Cancel</ui-button>
              <ui-button variant="primary" [disabled]="savingRevision" [loading]="savingRevision" (clicked)="saveRevision()">Save</ui-button>
            </div>
          </ui-modal>
}
        </div>
}
      
}
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
      .nom-member-row { display: grid; grid-template-columns: 1.4fr 1fr 1fr 0.7fr 1.6fr 1.6fr; gap: 0.75rem; padding: 0.45rem 0; border-bottom: 1px solid #f3f4f6; font-size: 0.85rem; }
      .nom-member-row.header { font-weight: 600; color: #374151; border-bottom-color: #d1d5db; }
      .nom-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
      .member-row {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 0.5rem;
        padding: 0.75rem;
        background: #f9fafb;
        border: 1px solid #e5e7eb;
        border-radius: 0.375rem;
        margin-bottom: 0.75rem;
      }
      .member-row .full { grid-column: 1 / -1; }
      .member-row .member-actions {
        grid-column: 1 / -1;
        display: flex;
        align-items: center;
        gap: 1rem;
        padding-top: 0.25rem;
        border-top: 1px dashed #e5e7eb;
      }
      .member-row .guardian-block {
        grid-column: 1 / -1;
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 0.5rem;
        padding: 0.5rem;
        margin-top: 0.25rem;
        background: #ffffff;
        border: 1px dashed #d1d5db;
        border-radius: 0.375rem;
      }
      .member-row .guardian-block .full { grid-column: 1 / -1; }
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

      .ess-credentials-card {
        background: linear-gradient(135deg, #ecfdf5, #f0fdf4);
        border: 1px solid #86efac;
        border-radius: 0.75rem;
        padding: 1rem 1.25rem;
        margin-bottom: 1rem;
      }
      .ess-cred-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 0.5rem;
      }
      .ess-cred-fields {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }
      .ess-cred-row {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        background: white;
        border: 1px solid #d1fae5;
        border-radius: 0.5rem;
        padding: 0.5rem 0.75rem;
      }
      .ess-cred-label {
        font-size: 0.75rem;
        font-weight: 600;
        color: #6b7280;
        min-width: 64px;
      }
      .ess-cred-value {
        flex: 1;
        font-size: 0.875rem;
        font-weight: 500;
        color: #111827;
        word-break: break-all;
      }
      .ess-copy-btn {
        background: none;
        border: 1px solid #d1d5db;
        border-radius: 0.375rem;
        padding: 0.25rem;
        cursor: pointer;
        color: #6b7280;
        transition: color 0.15s, border-color 0.15s;
      }
      .ess-copy-btn:hover {
        color: #4f46e5;
        border-color: #4f46e5;
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
    { key: 'documents' as DetailTab, label: 'Documents' },
    { key: 'salary' as DetailTab, label: 'Salary' },
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

  // ESS Provisioning
  provisioningEss = false;
  essResult: any = null;
  essError = '';
  resettingEssPassword = false;

  // Appointment Letter
  downloadingLetter = false;
  downloadingDocx = false;

  // Documents
  documents: EmployeeDocument[] = [];
  loadingDocs = false;
  uploadingDoc = false;
  docUploadMsg = '';
  docUploadError = false;
  docUpload: any = { docType: '', docName: '', expiryDate: '', file: null };
  docTypeOptions = [
    { label: 'Select type', value: '' },
    { label: 'Aadhaar', value: 'AADHAAR' },
    { label: 'PAN Card', value: 'PAN' },
    { label: 'Passport', value: 'PASSPORT' },
    { label: 'Offer Letter', value: 'OFFER_LETTER' },
    { label: 'Relieving Letter', value: 'RELIEVING_LETTER' },
    { label: 'Bank Proof', value: 'BANK_PROOF' },
    { label: 'Address Proof', value: 'ADDRESS_PROOF' },
    { label: 'Education Certificate', value: 'EDUCATION' },
    { label: 'Other', value: 'OTHER' },
  ];

  // Salary Revisions
  revisions: SalaryRevision[] = [];
  loadingRevisions = false;
  showRevisionModal = false;
  savingRevision = false;
  revisionError = '';
  revisionForm: any = { effectiveDate: '', previousCtc: null, newCtc: null, reason: '' };

  formTypes = [
    { label: 'PF Form 2', value: 'PF_FORM_2' },
    { label: 'ESI Form 1', value: 'ESI_FORM_1' },
    { label: 'Gratuity Form F', value: 'GRATUITY_FORM_F' },
  ];

  constructor(
    private svc: ClientEmployeesService,
    private docSvc: EmployeeDocumentService,
    private revSvc: SalaryRevisionService,
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef,
    private toast: ToastService,
    private dialog: ConfirmDialogService,
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
    if (tab === 'documents' && this.documents.length === 0) this.loadDocuments();
    if (tab === 'salary' && this.revisions.length === 0) this.loadRevisions();
  }

  editEmployee(): void {
    this.router.navigate(['/client/employees', this.employeeId, 'edit']);
  }

  downloadAppointmentLetter(): void {
    if (this.downloadingLetter) return;
    this.downloadingLetter = true;
    this.svc.downloadAppointmentLetter(this.employeeId).pipe(
      finalize(() => { this.downloadingLetter = false; this.cdr.detectChanges(); }),
      takeUntil(this.destroy$),
    ).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Appointment_Letter_${this.emp?.employeeCode || 'employee'}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: (e) => this.toast.error(e?.error?.message || 'Failed to generate appointment letter'),
    });
  }

  downloadAppointmentLetterDocx(): void {
    if (this.downloadingDocx) return;
    this.downloadingDocx = true;
    this.svc.downloadAppointmentLetter(this.employeeId, 'docx').pipe(
      finalize(() => { this.downloadingDocx = false; this.cdr.detectChanges(); }),
      takeUntil(this.destroy$),
    ).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Appointment_Letter_${this.emp?.employeeCode || 'employee'}.docx`;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: (e) => this.toast.error(e?.error?.message || 'Failed to generate appointment letter'),
    });
  }

  async confirmDeactivate(): Promise<void> {
    if (!this.emp) return;
    const dateResult = await this.dialog.prompt('Mark Employee Exit', `Enter exit date for ${this.emp.name}:`, {
      placeholder: 'YYYY-MM-DD',
      defaultValue: this.todayIsoDate(),
      confirmText: 'Next',
    });
    if (!dateResult.confirmed) return;
    const dateOfExit = (dateResult.value || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfExit)) {
      this.toast.error('Exit date must be in YYYY-MM-DD format');
      return;
    }

    const reasonResult = await this.dialog.prompt('Exit Reason', `Enter reason for exiting ${this.emp.name}:`, {
      placeholder: 'e.g. Resignation, Termination, Contract End',
      confirmText: 'Confirm Exit',
    });
    if (!reasonResult.confirmed || !reasonResult.value?.trim()) {
      if (reasonResult.confirmed) this.toast.error('Exit reason is required');
      return;
    }

    this.svc.markExit(this.employeeId, { dateOfExit, exitReason: reasonResult.value.trim() }).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => { this.toast.success('Employee exit marked'); this.loadEmployee(); },
      error: (e) => this.toast.error(e?.error?.message || 'Failed to mark exit'),
    });
  }

  private todayIsoDate(): string {
    const now = new Date();
    const tzOffsetMs = now.getTimezoneOffset() * 60000;
    return new Date(now.getTime() - tzOffsetMs).toISOString().slice(0, 10);
  }

  async approveEmployee(): Promise<void> {
    if (!this.emp) return;
    const ok = await this.dialog.confirm(
      'Approve Registration',
      `Approve registration of ${this.emp.name}?`,
      { confirmText: 'Approve' },
    );
    if (!ok) return;
    this.svc.approve(this.employeeId).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => { this.toast.success('Employee approved'); this.loadEmployee(); },
      error: (e) => this.toast.error(e?.error?.message || 'Failed to approve'),
    });
  }

  async rejectEmployee(): Promise<void> {
    if (!this.emp) return;
    const ok = await this.dialog.confirm(
      'Reject Registration',
      `Reject registration of ${this.emp.name}? The employee will be deactivated.`,
      { variant: 'danger', confirmText: 'Reject' },
    );
    if (!ok) return;
    this.svc.reject(this.employeeId).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => { this.toast.success('Employee rejected'); this.loadEmployee(); },
      error: (e) => this.toast.error(e?.error?.message || 'Failed to reject'),
    });
  }

  hasValidEmail(): boolean {
    if (!this.emp?.email) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.emp.email);
  }

  async provisionEssLogin(): Promise<void> {
    if (!this.emp || !this.hasValidEmail()) {
      this.toast.error('Please add a valid email address for this employee first');
      return;
    }
    const ok = await this.dialog.confirm(
      'Create ESS Login',
      `Create ESS login for ${this.emp.name}?\nEmail: ${this.emp.email}`,
      { confirmText: 'Create' },
    );
    if (!ok) return;
    this.provisioningEss = true;
    this.essResult = null;
    this.essError = '';
    this.cdr.detectChanges();

    this.svc.provisionEss(this.employeeId).pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.provisioningEss = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (res) => {
        this.provisioningEss = false;
        this.essResult = res;
        if (res.generatedPassword) {
          this.toast.success('ESS login created — see credentials below');
        } else {
          this.toast.success(`ESS login created for ${res.email}`);
        }
        this.cdr.detectChanges();
      },
      error: (e) => {
        this.provisioningEss = false;
        this.essError = e?.error?.message || 'Failed to create ESS login';
        this.toast.error(this.essError);
      },
    });
  }

  async resetEssPassword(): Promise<void> {
    const ok = await this.dialog.confirm(
      'Reset ESS Password',
      `Generate a new password for ${this.emp?.name ?? 'this employee'}? Share it with them immediately — it won't be shown again.`,
      { confirmText: 'Reset Password', variant: 'danger' },
    );
    if (!ok) return;
    this.resettingEssPassword = true;
    this.essResult = null;
    this.cdr.detectChanges();
    this.svc.resetEssPassword(this.employeeId).pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.resettingEssPassword = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (res) => {
        this.essResult = { email: res.email, generatedPassword: res.newPassword };
        this.toast.success('ESS password reset — see new credentials below');
        this.cdr.detectChanges();
      },
      error: (e) => {
        const msg = e?.error?.message || 'Failed to reset ESS password';
        this.toast.error(msg);
      },
    });
  }

  goBack(): void {
    this.router.navigate(['/client/employees']);
  }

  copyCredential(value: string): void {
    navigator.clipboard.writeText(value).then(
      () => this.toast.success('Copied to clipboard'),
      () => this.toast.error('Failed to copy'),
    );
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
      members: [this.blankNomMember(100)],
    };
    this.showNomModal = true;
  }

  addNomMember(): void {
    this.nomForm.members.push(this.blankNomMember(0));
  }

  private blankNomMember(sharePct: number): any {
    return {
      memberName: '',
      relationship: '',
      dateOfBirth: '',
      sharePct,
      address: '',
      isMinor: false,
      guardianName: '',
      guardianRelationship: '',
      guardianAddress: '',
    };
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

  // Print/Download nomination form (streamed PDF)
  printingNomination = '';
  printNomination(formType: string): void {
    if (this.printingNomination) return;
    this.printingNomination = formType;
    this.svc.printNominationForm(this.employeeId, formType).pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.printingNomination = ''; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${formType}_Nomination_${this.emp?.employeeCode || 'employee'}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: (e) => this.toast.error(e?.error?.message || 'Failed to download nomination form'),
    });
  }

  // ── Documents ───────────────────────────────────────────────
  loadDocuments(): void {
    this.loadingDocs = true;
    this.docSvc.list(this.employeeId).pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.loadingDocs = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (list) => { this.documents = list; },
      error: () => { this.documents = []; },
    });
  }

  onDocFileSelected(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.docUpload.file = target.files && target.files.length ? target.files[0] : null;
  }

  uploadDocument(): void {
    if (!this.docUpload.file) return;
    if (!this.docUpload.docType) {
      this.docUploadMsg = 'Select a document type';
      this.docUploadError = true;
      return;
    }
    this.uploadingDoc = true;
    this.docUploadMsg = '';
    this.docSvc.upload(
      this.employeeId,
      this.docUpload.file,
      this.docUpload.docType,
      this.docUpload.docName || this.docUpload.file.name,
      this.docUpload.expiryDate || undefined,
    ).pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.uploadingDoc = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: () => {
        this.docUploadMsg = 'Document uploaded';
        this.docUploadError = false;
        this.docUpload = { docType: '', docName: '', expiryDate: '', file: null };
        this.loadDocuments();
      },
      error: (e) => {
        this.docUploadMsg = e?.error?.message || 'Upload failed';
        this.docUploadError = true;
      },
    });
  }

  downloadDoc(doc: EmployeeDocument): void {
    this.docSvc.download(doc.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = doc.docName || doc.fileName;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: () => this.toast.error('Download failed'),
    });
  }

  verifyDoc(doc: EmployeeDocument): void {
    this.docSvc.verify(doc.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => { this.toast.success('Document verified'); this.loadDocuments(); },
      error: (e) => this.toast.error(e?.error?.message || 'Verification failed'),
    });
  }

  async deleteDoc(doc: EmployeeDocument): Promise<void> {
    if (!(await this.dialog.confirm('Delete Document', `Delete "${doc.docName}"?`, { variant: 'danger', confirmText: 'Delete' }))) return;
    this.docSvc.remove(doc.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => { this.toast.success('Document deleted'); this.loadDocuments(); },
      error: (e) => this.toast.error(e?.error?.message || 'Delete failed'),
    });
  }

  // ── Salary Revisions ───────────────────────────────────────
  loadRevisions(): void {
    this.loadingRevisions = true;
    this.revSvc.listForEmployee(this.employeeId).pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.loadingRevisions = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (list) => { this.revisions = list; },
      error: () => { this.revisions = []; },
    });
  }

  saveRevision(): void {
    if (!this.revisionForm.effectiveDate || !this.revisionForm.previousCtc || !this.revisionForm.newCtc) {
      this.revisionError = 'Effective date, previous CTC, and new CTC are required';
      return;
    }
    this.savingRevision = true;
    this.revisionError = '';
    this.revSvc.create({
      clientId: (this.emp as any)?.clientId || '',
      employeeId: this.employeeId,
      effectiveDate: this.revisionForm.effectiveDate,
      previousCtc: Number(this.revisionForm.previousCtc),
      newCtc: Number(this.revisionForm.newCtc),
      reason: this.revisionForm.reason || undefined,
    }).pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.savingRevision = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: () => {
        this.showRevisionModal = false;
        this.revisionForm = { effectiveDate: '', previousCtc: null, newCtc: null, reason: '' };
        this.toast.success('Salary revision saved');
        this.loadRevisions();
      },
      error: (e) => {
        this.revisionError = e?.error?.message || 'Save failed';
      },
    });
  }
}
