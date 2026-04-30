import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AccountsBillingService } from '../services/accounts-billing.service';
import { INDIAN_STATES } from '../models/billing.models';

@Component({
  selector: 'app-billing-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="p-6 space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-slate-800">Billing Settings</h1>
          <p class="text-sm text-slate-500 mt-1">Company profile, bank details, invoice numbering</p>
        </div>
      </div>

      <div class="bg-white rounded-xl border p-6 space-y-6" *ngIf="settings">
        <!-- Company Info -->
        <div>
          <h2 class="text-lg font-semibold text-slate-700 mb-4">Company Information</h2>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1">Legal Name</label>
              <input [(ngModel)]="settings.legalName" class="w-full px-3 py-2 border rounded-lg text-sm">
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1">Trade Name</label>
              <input [(ngModel)]="settings.tradeName" class="w-full px-3 py-2 border rounded-lg text-sm">
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1">GSTIN</label>
              <input [(ngModel)]="settings.gstin" class="w-full px-3 py-2 border rounded-lg text-sm" maxlength="15">
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1">PAN</label>
              <input [(ngModel)]="settings.pan" class="w-full px-3 py-2 border rounded-lg text-sm" maxlength="10">
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1">State</label>
              <select [(ngModel)]="settings.stateCode" (change)="onStateChange()" class="w-full px-3 py-2 border rounded-lg text-sm">
                <option *ngFor="let s of states" [value]="s.code">{{ s.name }} ({{ s.code }})</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1">Email</label>
              <input [(ngModel)]="settings.email" type="email" class="w-full px-3 py-2 border rounded-lg text-sm">
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1">Phone</label>
              <input [(ngModel)]="settings.phone" class="w-full px-3 py-2 border rounded-lg text-sm">
            </div>
          </div>
          <div class="mt-4">
            <label class="block text-xs font-medium text-slate-600 mb-1">Address</label>
            <textarea [(ngModel)]="settings.address" rows="2" class="w-full px-3 py-2 border rounded-lg text-sm"></textarea>
          </div>
        </div>

        <!-- Bank Details -->
        <div>
          <h2 class="text-lg font-semibold text-slate-700 mb-4">Bank Details</h2>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1">Account Name</label>
              <input [(ngModel)]="settings.bankAccountName" class="w-full px-3 py-2 border rounded-lg text-sm">
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1">Bank Name</label>
              <input [(ngModel)]="settings.bankName" class="w-full px-3 py-2 border rounded-lg text-sm">
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1">Account Number</label>
              <input [(ngModel)]="settings.accountNumber" class="w-full px-3 py-2 border rounded-lg text-sm">
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1">IFSC Code</label>
              <input [(ngModel)]="settings.ifscCode" class="w-full px-3 py-2 border rounded-lg text-sm">
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1">Branch</label>
              <input [(ngModel)]="settings.branchName" class="w-full px-3 py-2 border rounded-lg text-sm">
            </div>
          </div>
        </div>

        <!-- Invoice Numbering -->
        <div>
          <h2 class="text-lg font-semibold text-slate-700 mb-4">Invoice Numbering & Defaults</h2>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1">Invoice Prefix</label>
              <input [(ngModel)]="settings.invoicePrefix" class="w-full px-3 py-2 border rounded-lg text-sm">
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1">Proforma Prefix</label>
              <input [(ngModel)]="settings.proformaPrefix" class="w-full px-3 py-2 border rounded-lg text-sm">
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1">Credit Note Prefix</label>
              <input [(ngModel)]="settings.creditNotePrefix" class="w-full px-3 py-2 border rounded-lg text-sm">
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1">Default GST Rate (%)</label>
              <input [(ngModel)]="settings.defaultGstRate" type="number" class="w-full px-3 py-2 border rounded-lg text-sm">
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1">Default Payment Terms (days)</label>
              <input [(ngModel)]="settings.defaultPaymentTermsDays" type="number" class="w-full px-3 py-2 border rounded-lg text-sm">
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1">Default SAC Code</label>
              <input [(ngModel)]="settings.defaultSacCode" class="w-full px-3 py-2 border rounded-lg text-sm">
            </div>
          </div>
        </div>

        <!-- Signatory & Terms -->
        <div>
          <h2 class="text-lg font-semibold text-slate-700 mb-4">Signatory & Terms</h2>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1">Authorized Signatory Name</label>
              <input [(ngModel)]="settings.authorizedSignatoryName" class="w-full px-3 py-2 border rounded-lg text-sm">
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1">Designation</label>
              <input [(ngModel)]="settings.authorizedSignatoryDesignation" class="w-full px-3 py-2 border rounded-lg text-sm">
            </div>
          </div>
          <div class="mt-4">
            <label class="block text-xs font-medium text-slate-600 mb-1">Terms & Conditions</label>
            <textarea [(ngModel)]="settings.termsAndConditions" rows="3" class="w-full px-3 py-2 border rounded-lg text-sm"></textarea>
          </div>
          <div class="mt-4">
            <label class="block text-xs font-medium text-slate-600 mb-1">Notes / Footer Text</label>
            <textarea [(ngModel)]="settings.notesFooter" rows="2" class="w-full px-3 py-2 border rounded-lg text-sm"></textarea>
          </div>
        </div>

        <div class="flex justify-end">
          <button (click)="save()" [disabled]="saving"
                  class="px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
            {{ saving ? 'Saving...' : 'Save Settings' }}
          </button>
        </div>
      </div>
    </div>
  `,
})
export class BillingSettingsComponent implements OnInit {
  settings: any = null;
  states = INDIAN_STATES;
  saving = false;

  constructor(private svc: AccountsBillingService) {}

  ngOnInit(): void {
    this.svc.getSettings().subscribe({
      next: (s) => (this.settings = s),
      error: () => {
        this.settings = {
          legalName: '', tradeName: '', gstin: '', pan: '', address: '',
          stateCode: '36', stateName: 'Telangana', email: '', phone: '',
          bankAccountName: '', bankName: '', accountNumber: '', ifscCode: '', branchName: '',
          invoicePrefix: 'STS/INV', proformaPrefix: 'STS/PI', creditNotePrefix: 'STS/CN',
          defaultGstRate: 18, defaultPaymentTermsDays: 30, defaultSacCode: '',
          authorizedSignatoryName: '', authorizedSignatoryDesignation: '',
          termsAndConditions: '', notesFooter: '',
        };
      },
    });
  }

  onStateChange(): void {
    const st = this.states.find((s) => s.code === this.settings.stateCode);
    if (st) this.settings.stateName = st.name;
  }

  save(): void {
    this.saving = true;
    this.svc.updateSettings(this.settings).subscribe({
      next: (s) => { this.settings = s; this.saving = false; },
      error: () => (this.saving = false),
    });
  }
}
