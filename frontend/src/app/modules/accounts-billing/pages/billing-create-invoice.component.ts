import { Component, OnInit } from '@angular/core';

import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, FormArray, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { AccountsBillingService } from '../services/accounts-billing.service';
import { BillingClient, INVOICE_TYPES } from '../models/billing.models';

// Mirrors the backend's EDITABLE_STATUSES guard (invoices.service.ts) —
// once an invoice has a recorded payment or is cancelled its figures are
// locked, so the edit form should not even try to submit changes.
const EDITABLE_STATUSES = new Set([
  'DRAFT', 'APPROVED', 'GENERATED', 'EMAILED', 'OVERDUE',
]);

@Component({
  selector: 'app-billing-create-invoice',
  standalone: true,
  imports: [FormsModule, ReactiveFormsModule, RouterModule],
  template: `
    <div class="p-6 space-y-6">
      <div class="flex items-center justify-between">
        <h1 class="text-2xl font-bold text-slate-800">{{ isEditMode ? 'Edit Invoice' : 'Create Invoice' }}</h1>
      </div>

      @if (loadingInvoice) {
<div class="bg-white rounded-xl border p-10 text-center text-slate-500">
        Loading invoice…
      </div>
}

      @if (isEditMode && !loadingInvoice && lockedStatus) {
<div class="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-4 text-sm">
        This invoice is <strong>{{ lockedStatus }}</strong> and can no longer be edited
        (payments have been recorded or it has been cancelled).
        <a routerLink="/accounts/invoices/{{ invoiceId }}" class="underline font-medium">Back to invoice</a>
      </div>
}

      @if (!loadingInvoice && !lockedStatus) {
<form [formGroup]="form" (ngSubmit)="onSubmit()" class="space-y-6">
        <!-- Header Section -->
        <div class="bg-white rounded-xl border p-6 space-y-4">
          <h2 class="text-lg font-semibold text-slate-700">Invoice Details</h2>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1">Billing Client *</label>
              <select formControlName="billingClientId" (change)="onClientChange()" class="w-full px-3 py-2 border rounded-lg text-sm">
                <option value="">Select Client</option>
                @for (c of clients; track c) {
<option [value]="c.id">{{ c.legalName }} ({{ c.billingCode }})</option>
}
              </select>
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1">Invoice Type *</label>
              <select formControlName="invoiceType" class="w-full px-3 py-2 border rounded-lg text-sm">
                <option value="">Select Type</option>
                @for (t of invoiceTypes; track t) {
<option [value]="t.value">{{ t.label }}</option>
}
              </select>
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1">Invoice Date *</label>
              <input formControlName="invoiceDate" type="date" class="w-full px-3 py-2 border rounded-lg text-sm">
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1">Due Date</label>
              <input formControlName="dueDate" type="date" class="w-full px-3 py-2 border rounded-lg text-sm">
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1">Place of Supply</label>
              <input formControlName="placeOfSupply" class="w-full px-3 py-2 border rounded-lg text-sm">
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1">Client PO Number</label>
              <input formControlName="purchaseOrderNumber" maxlength="100"
                     class="w-full px-3 py-2 border rounded-lg text-sm"
                     placeholder="PO number provided by client">
            </div>
          </div>
          <div>
            <label class="block text-xs font-medium text-slate-600 mb-1">Remarks</label>
            <textarea formControlName="remarks" rows="2" class="w-full px-3 py-2 border rounded-lg text-sm"></textarea>
          </div>

          <!-- Selected Client Info -->
          @if (selectedClient) {
<div class="bg-brand-50 rounded-lg p-4 text-sm">
            <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div><span class="text-slate-500">GSTIN:</span> <strong>{{ selectedClient.gstin || 'N/A' }}</strong></div>
              <div><span class="text-slate-500">State:</span> <strong>{{ selectedClient.stateName }} ({{ selectedClient.stateCode }})</strong></div>
              <div><span class="text-slate-500">GST Rate:</span> <strong>{{ selectedClient.defaultGstRate }}%</strong></div>
              <div><span class="text-slate-500">Terms:</span> <strong>{{ selectedClient.paymentTermsDays }} days</strong></div>
            </div>
          </div>
}
        </div>

        <!-- Line Items -->
        <div class="bg-white rounded-xl border p-6 space-y-4">
          <div class="flex items-center justify-between">
            <h2 class="text-lg font-semibold text-slate-700">Line Items</h2>
            <button type="button" (click)="addItem()" class="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs hover:bg-green-700">
              + Add Item
            </button>
          </div>

          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-slate-50 text-slate-500 uppercase text-xs">
                <tr>
                  <th class="px-3 py-2 text-left" style="min-width:200px">Description *</th>
                  <th class="px-3 py-2 text-left" style="width:80px">SAC Code</th>
                  <th class="px-3 py-2 text-right" style="width:80px">Qty</th>
                  <th class="px-3 py-2 text-right" style="width:100px">Rate</th>
                  <th class="px-3 py-2 text-right" style="width:100px">Discount</th>
                  <th class="px-3 py-2 text-right" style="width:80px">GST %</th>
                  <th class="px-3 py-2 text-center" style="width:70px" title="Government / statutory fee paid on the client's behalf. No GST charged on this line.">Govt Fee</th>
                  <th class="px-3 py-2 text-right" style="width:100px">Amount</th>
                  <th class="px-3 py-2" style="width:40px"></th>
                </tr>
              </thead>
              <tbody formArrayName="items">
                @for (item of itemsArray.controls; track item; let i = $index) {
<tr [formGroupName]="i" class="border-t">
                  <td class="px-3 py-2">
                    <input formControlName="serviceDescription" class="w-full px-2 py-1.5 border rounded text-sm" placeholder="Service description">
                  </td>
                  <td class="px-3 py-2">
                    <input formControlName="sacCode" class="w-full px-2 py-1.5 border rounded text-sm">
                  </td>
                  <td class="px-3 py-2">
                    <input formControlName="quantity" type="number" min="1" class="w-full px-2 py-1.5 border rounded text-sm text-right">
                  </td>
                  <td class="px-3 py-2">
                    <input formControlName="rate" type="number" min="0" class="w-full px-2 py-1.5 border rounded text-sm text-right">
                  </td>
                  <td class="px-3 py-2">
                    <input formControlName="discountAmount" type="number" min="0" class="w-full px-2 py-1.5 border rounded text-sm text-right">
                  </td>
                  <td class="px-3 py-2">
                    <input formControlName="gstRate" type="number" min="0" class="w-full px-2 py-1.5 border rounded text-sm text-right" [readonly]="item.value.isReimbursement">
                  </td>
                  <td class="px-3 py-2 text-center">
                    <input formControlName="isReimbursement" type="checkbox" class="h-4 w-4" (change)="onReimbursementToggle(i)" title="Tick for government / statutory fees passed through to the client. No GST will be charged on this line.">
                  </td>
                  <td class="px-3 py-2 text-right font-medium">
                    ₹{{ calcLineTotal(i) }}
                  </td>
                  <td class="px-3 py-2 text-center">
                    @if (itemsArray.length > 1) {
<button type="button" (click)="removeItem(i)" class="text-red-500 hover:text-red-700">&times;</button>
}
                  </td>
                </tr>
}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Submit -->
        <div class="flex justify-end gap-3">
          <button type="button" (click)="onCancel()"
                  class="px-6 py-2.5 border rounded-lg text-sm">Cancel</button>
          <button type="submit" [disabled]="saving || form.invalid"
                  class="px-6 py-2.5 bg-brand-600 text-white rounded-lg text-sm hover:bg-brand-700 disabled:opacity-50">
            {{ saving ? (isEditMode ? 'Saving...' : 'Creating...') : (isEditMode ? 'Save Changes' : 'Create Invoice') }}
          </button>
        </div>
      </form>
}
    </div>
  `,
})
export class BillingCreateInvoiceComponent implements OnInit {
  form!: FormGroup;
  clients: BillingClient[] = [];
  selectedClient: BillingClient | null = null;
  invoiceTypes = INVOICE_TYPES;
  saving = false;

  invoiceId: string | null = null;
  isEditMode = false;
  loadingInvoice = false;
  lockedStatus: string | null = null;

  constructor(
    private fb: FormBuilder,
    private svc: AccountsBillingService,
    private route: ActivatedRoute,
    public router: Router,
  ) {}

  ngOnInit(): void {
    this.form = this.fb.group({
      billingClientId: ['', Validators.required],
      invoiceType: ['TAX_INVOICE', Validators.required],
      invoiceDate: [new Date().toISOString().split('T')[0], Validators.required],
      dueDate: [''],
      placeOfSupply: [''],
      purchaseOrderNumber: [''],
      remarks: [''],
      items: this.fb.array([this.newItem()]),
    });

    this.svc.getActiveClients().subscribe({
      next: (c) => (this.clients = c || []),
      error: (e) => { console.error('[billing] active clients load failed', e); this.clients = []; },
    });

    this.invoiceId = this.route.snapshot.paramMap.get('id');
    if (this.invoiceId) {
      this.isEditMode = true;
      this.loadingInvoice = true;
      this.svc.getInvoice(this.invoiceId).subscribe({
        next: (inv) => {
          this.loadingInvoice = false;
          if (!EDITABLE_STATUSES.has(inv.invoiceStatus)) {
            this.lockedStatus = inv.invoiceStatus;
            return;
          }
          this.itemsArray.clear();
          (inv.items || []).forEach((item) => {
            this.itemsArray.push(
              this.fb.group({
                serviceDescription: [item.serviceDescription, Validators.required],
                sacCode: [item.sacCode || ''],
                quantity: [item.quantity, [Validators.required, Validators.min(1)]],
                rate: [item.rate, [Validators.required, Validators.min(0)]],
                discountAmount: [item.discountAmount || 0],
                gstRate: [item.gstRate ?? 18],
                isReimbursement: [item.isReimbursement || false],
              }),
            );
          });
          if (!this.itemsArray.length) this.itemsArray.push(this.newItem());

          this.form.patchValue({
            billingClientId: inv.billingClient?.id || '',
            invoiceType: inv.invoiceType,
            invoiceDate: inv.invoiceDate,
            dueDate: inv.dueDate || '',
            placeOfSupply: inv.placeOfSupply || '',
            purchaseOrderNumber: inv.purchaseOrderNumber || '',
            remarks: inv.remarks || '',
          });
          this.selectedClient = inv.billingClient || null;
        },
        error: (e) => {
          this.loadingInvoice = false;
          console.error('[billing] invoice load failed', e);
          this.lockedStatus = 'unavailable';
        },
      });
    }
  }

  get itemsArray(): FormArray {
    return this.form.get('items') as FormArray;
  }

  newItem(): FormGroup {
    return this.fb.group({
      serviceDescription: ['', Validators.required],
      sacCode: [''],
      quantity: [1, [Validators.required, Validators.min(1)]],
      rate: [0, [Validators.required, Validators.min(0)]],
      discountAmount: [0],
      gstRate: [18],
      isReimbursement: [false],
    });
  }

  addItem(): void {
    this.itemsArray.push(this.newItem());
  }

  removeItem(i: number): void {
    this.itemsArray.removeAt(i);
  }

  onReimbursementToggle(i: number): void {
    const ctrl = this.itemsArray.at(i);
    if (ctrl.value.isReimbursement) {
      // Government / statutory fees are pass-through — never carry GST.
      ctrl.patchValue({ gstRate: 0, discountAmount: 0 });
    } else {
      // Restore the client default (or fall back to 18%) when toggled off.
      ctrl.patchValue({
        gstRate: this.selectedClient?.defaultGstRate ?? 18,
      });
    }
  }

  onClientChange(): void {
    const id = this.form.value.billingClientId;
    this.selectedClient = this.clients.find((c) => c.id === id) || null;
    if (this.selectedClient) {
      this.form.patchValue({ placeOfSupply: this.selectedClient.placeOfSupply || this.selectedClient.stateName });
      this.itemsArray.controls.forEach((ctrl) => {
        // Don't overwrite the GST rate of a govt-fee line.
        if (!ctrl.value.isReimbursement) {
          ctrl.patchValue({ gstRate: this.selectedClient!.defaultGstRate });
        }
      });
    }
  }

  calcLineTotal(i: number): string {
    const item = this.itemsArray.at(i).value;
    const amount = (item.quantity || 0) * (item.rate || 0);
    const taxable = amount - (item.discountAmount || 0);
    const gstRate = item.isReimbursement ? 0 : (item.gstRate || 0);
    const gst = (taxable * gstRate) / 100;
    return (taxable + gst).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  onSubmit(): void {
    if (this.form.invalid) return;
    this.saving = true;
    const request = this.isEditMode && this.invoiceId
      ? this.svc.updateInvoice(this.invoiceId, this.form.value)
      : this.svc.createInvoice(this.form.value);
    request.subscribe({
      next: (inv) => {
        this.saving = false;
        this.router.navigate(['/accounts/invoices', inv.id]);
      },
      error: () => (this.saving = false),
    });
  }

  onCancel(): void {
    if (this.isEditMode && this.invoiceId) {
      this.router.navigate(['/accounts/invoices', this.invoiceId]);
    } else {
      this.router.navigate(['/accounts/invoices']);
    }
  }
}
