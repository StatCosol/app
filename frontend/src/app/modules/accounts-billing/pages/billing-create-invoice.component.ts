import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, takeUntil } from 'rxjs';

import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, FormArray, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { AccountsBillingService } from '../services/accounts-billing.service';
import { BillingClient, InvoiceItem, INVOICE_TYPES } from '../models/billing.models';

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

      @if (loadError) {
        <div role="alert" class="text-red-800 p-3">{{ loadError }} <button type="button" (click)="loadInvoice(invoiceId)">Retry</button></div>
      }
      @if (clientsError) {
        <div role="alert" class="text-red-800 p-3">{{ clientsError }} <button type="button" (click)="loadClients()">Retry</button></div>
      }
      @if (!loadingInvoice && !lockedStatus && !loadError) {
<form [formGroup]="form" (ngSubmit)="onSubmit()" class="space-y-6">
        @if (saveError) {
          <div role="alert" class="border border-red-200 bg-red-50 text-red-800 rounded-lg p-3 text-sm break-words">{{ saveError }}</div>
        }
        <fieldset [disabled]="saving" class="min-w-0 space-y-6">
        <!-- Header Section -->
        <div class="bg-white rounded-xl border p-6 space-y-4">
          <h2 class="text-lg font-semibold text-slate-700">Invoice Details</h2>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1">Billing Client *</label>
              <select formControlName="billingClientId" (change)="onClientChange()" class="w-full px-3 py-2 border rounded-lg text-sm">
                <option value="">Select Client</option>
                @for (c of clientOptions; track c.id) {
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
              <input formControlName="invoiceDate" type="date" [min]="isUnchangedLegacyDate ? '' : minInvoiceDate" [max]="isUnchangedLegacyDate ? '' : maxInvoiceDate" class="w-full px-3 py-2 border rounded-lg text-sm">
              @if (form.get('invoiceDate')?.hasError('financialYear')) {
                <p role="alert" class="text-red-700 text-xs mt-1">Invoice date must remain in financial year {{ financialYear }}.</p>
              }
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
                    <input formControlName="quantity" type="number" min="0.01" step="0.01" class="w-full px-2 py-1.5 border rounded text-sm text-right">
                  </td>
                  <td class="px-3 py-2">
                    <input formControlName="rate" type="number" min="0" step="0.01" class="w-full px-2 py-1.5 border rounded text-sm text-right">
                  </td>
                  <td class="px-3 py-2">
                    <input formControlName="discountAmount" type="number" min="0" step="0.01" class="w-full px-2 py-1.5 border rounded text-sm text-right">
                  </td>
                  <td class="px-3 py-2">
                    <input formControlName="gstRate" type="number" min="0" max="100" step="0.01" class="w-full px-2 py-1.5 border rounded text-sm text-right" [readonly]="item.value.isReimbursement">
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
        </fieldset>
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
  saveError = '';
  financialYear = '';
  minInvoiceDate = '';
  maxInvoiceDate = '';
  private originalInvoiceDate: string | null = null;
  private readonly destroyRef = inject(DestroyRef);
  private readonly contextChanged = new Subject<void>();
  loadError = '';
  clientsError = '';

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
    this.loadClients();
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => this.loadInvoice(params.get('id')));
  }

  loadClients(): void {
    this.clientsError = '';
    this.svc.getActiveClients().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: clients => { this.clients = clients || []; },
      error: () => { this.clientsError = 'Unable to load billing clients.'; },
    });
  }

  get clientOptions(): BillingClient[] {
    return this.selectedClient && !this.clients.some(client => client.id === this.selectedClient!.id)
      ? [...this.clients, this.selectedClient] : this.clients;
  }

  loadInvoice(id: string | null): void {
    this.contextChanged.next();
    this.invoiceId = id;
    this.isEditMode = !!id;
    this.saving = false;
    this.saveError = '';
    this.loadError = '';
    this.lockedStatus = null;
    this.selectedClient = null;
    this.originalInvoiceDate = null;
    this.financialYear = this.minInvoiceDate = this.maxInvoiceDate = '';
    this.loadingInvoice = !!id;
    const today = new Date();
    const localDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    this.form = this.fb.group({
      billingClientId: ['', Validators.required],
      invoiceType: ['TAX_INVOICE', Validators.required],
      invoiceDate: [localDate, Validators.required],
      dueDate: [''],
      placeOfSupply: [''],
      purchaseOrderNumber: ['', Validators.maxLength(100)],
      remarks: [''],
      items: this.fb.array([this.newItem()], Validators.required),
    });
    if (this.invoiceId) {
      this.isEditMode = true;
      this.loadingInvoice = true;
      this.svc.getInvoice(this.invoiceId).pipe(takeUntil(this.contextChanged), takeUntilDestroyed(this.destroyRef)).subscribe({
        next: (inv) => {
          this.loadingInvoice = false;
          if (!EDITABLE_STATUSES.has(inv.invoiceStatus) || inv.paymentStatus !== 'UNPAID' || Number(inv.amountReceived) > 0) {
            this.lockedStatus = Number(inv.amountReceived) > 0 ? 'payment recorded' : inv.paymentStatus !== 'UNPAID' ? inv.paymentStatus : inv.invoiceStatus;
            return;
          }
          this.itemsArray.clear();
          (inv.items || []).forEach((item) => {
            this.itemsArray.push(this.newItem(item));
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
          this.form.get('invoiceType')!.disable();
          this.financialYear = inv.financialYear;
          this.originalInvoiceDate = inv.invoiceDate;
          const startYear = Number(inv.financialYear.split('-')[0]);
          this.minInvoiceDate = `${startYear}-04-01`;
          this.maxInvoiceDate = `${startYear + 1}-03-31`;
          this.form.get('invoiceDate')!.addValidators(control =>
            control.value && control.value !== this.originalInvoiceDate && (control.value < this.minInvoiceDate || control.value > this.maxInvoiceDate)
              ? { financialYear: true } : null);
          this.form.get('invoiceDate')!.updateValueAndValidity();
        },
        error: () => {
          this.loadingInvoice = false;
          this.loadError = 'Unable to load invoice.';
        },
      });
    }
  }

  get itemsArray(): FormArray {
    return this.form.get('items') as FormArray;
  }

  get isUnchangedLegacyDate(): boolean {
    const date = this.form.get('invoiceDate')?.value;
    return !!date && date === this.originalInvoiceDate &&
      (date < this.minInvoiceDate || date > this.maxInvoiceDate);
  }

  newItem(item?: InvoiceItem): FormGroup {
    const decimal = [Validators.required, Validators.min(0), Validators.pattern(/^\d+(\.\d{1,2})?$/)];
    return this.fb.group({
      serviceDescription: [item?.serviceDescription || '', Validators.required],
      serviceCode: [item?.serviceCode], periodFrom: [item?.periodFrom], periodTo: [item?.periodTo], sequence: [item?.sequence],
      sacCode: [item?.sacCode || ''],
      quantity: [Number(item?.quantity ?? 1), [...decimal, Validators.min(0.01)]],
      rate: [Number(item?.rate ?? 0), decimal],
      discountAmount: [Number(item?.discountAmount ?? 0), decimal],
      gstRate: [Number(item?.gstRate ?? this.selectedClient?.defaultGstRate ?? 18), [...decimal, Validators.max(100)]],
      isReimbursement: [item?.isReimbursement || false],
    }, { validators: group => Number(group.value.discountAmount) > Number((group.value.quantity * group.value.rate).toFixed(2)) ? { excessDiscount: true } : null });
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
        gstRate: Number(this.selectedClient?.defaultGstRate ?? 18),
      });
    }
  }

  onClientChange(): void {
    const id = this.form.value.billingClientId;
    this.selectedClient = this.clientOptions.find((c) => c.id === id) || null;
    if (this.selectedClient) {
      this.form.patchValue({ placeOfSupply: this.selectedClient.placeOfSupply || this.selectedClient.stateName });
      this.itemsArray.controls.forEach((ctrl) => {
        // Don't overwrite the GST rate of a govt-fee line.
        if (!ctrl.value.isReimbursement) {
          ctrl.patchValue({ gstRate: Number(this.selectedClient!.defaultGstRate ?? 18) });
        }
      });
    }
  }

  calcLineTotal(i: number): string {
    const item = this.itemsArray.at(i).value;
    const amount = Number(((item.quantity || 0) * (item.rate || 0)).toFixed(2));
    const taxable = Number((amount - (item.discountAmount || 0)).toFixed(2));
    const gstRate = item.isReimbursement ? 0 : (item.gstRate || 0);
    const gst = Number(((taxable * gstRate) / 100).toFixed(2));
    return (taxable + gst).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  onSubmit(): void {
    if (this.saving || this.loadingInvoice || this.lockedStatus || this.loadError) return;
    this.saveError = '';
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.saveError = 'Check the invoice date and required line-item values.';
      return;
    }
    this.saving = true;
    const payload = { ...this.form.value, dueDate: this.form.value.dueDate || null };
    const request = this.isEditMode && this.invoiceId
      ? this.svc.updateInvoice(this.invoiceId, payload)
      : this.svc.createInvoice(payload);
    request.pipe(takeUntil(this.contextChanged), takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (inv) => {
        this.saving = false;
        this.router.navigate(['/accounts/invoices', inv.id]);
      },
      error: (error) => {
        this.saving = false;
        const message = error?.error?.message;
        this.saveError = Array.isArray(message) ? message.join('. ')
          : typeof message === 'string' ? message : 'Unable to save invoice. Please try again.';
      },
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
