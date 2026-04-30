import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, FormArray, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AccountsBillingService } from '../services/accounts-billing.service';
import { BillingClient, INVOICE_TYPES } from '../models/billing.models';

@Component({
  selector: 'app-billing-create-invoice',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  template: `
    <div class="p-6 space-y-6">
      <div class="flex items-center justify-between">
        <h1 class="text-2xl font-bold text-slate-800">Create Invoice</h1>
      </div>

      <form [formGroup]="form" (ngSubmit)="onSubmit()" class="space-y-6">
        <!-- Header Section -->
        <div class="bg-white rounded-xl border p-6 space-y-4">
          <h2 class="text-lg font-semibold text-slate-700">Invoice Details</h2>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1">Billing Client *</label>
              <select formControlName="billingClientId" (change)="onClientChange()" class="w-full px-3 py-2 border rounded-lg text-sm">
                <option value="">Select Client</option>
                <option *ngFor="let c of clients" [value]="c.id">{{ c.legalName }} ({{ c.billingCode }})</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1">Invoice Type *</label>
              <select formControlName="invoiceType" class="w-full px-3 py-2 border rounded-lg text-sm">
                <option value="">Select Type</option>
                <option *ngFor="let t of invoiceTypes" [value]="t.value">{{ t.label }}</option>
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
          </div>
          <div>
            <label class="block text-xs font-medium text-slate-600 mb-1">Remarks</label>
            <textarea formControlName="remarks" rows="2" class="w-full px-3 py-2 border rounded-lg text-sm"></textarea>
          </div>

          <!-- Selected Client Info -->
          <div *ngIf="selectedClient" class="bg-blue-50 rounded-lg p-4 text-sm">
            <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div><span class="text-slate-500">GSTIN:</span> <strong>{{ selectedClient.gstin || 'N/A' }}</strong></div>
              <div><span class="text-slate-500">State:</span> <strong>{{ selectedClient.stateName }} ({{ selectedClient.stateCode }})</strong></div>
              <div><span class="text-slate-500">GST Rate:</span> <strong>{{ selectedClient.defaultGstRate }}%</strong></div>
              <div><span class="text-slate-500">Terms:</span> <strong>{{ selectedClient.paymentTermsDays }} days</strong></div>
            </div>
          </div>
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
                  <th class="px-3 py-2 text-right" style="width:100px">Amount</th>
                  <th class="px-3 py-2" style="width:40px"></th>
                </tr>
              </thead>
              <tbody formArrayName="items">
                <tr *ngFor="let item of itemsArray.controls; let i = index" [formGroupName]="i" class="border-t">
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
                    <input formControlName="gstRate" type="number" min="0" class="w-full px-2 py-1.5 border rounded text-sm text-right">
                  </td>
                  <td class="px-3 py-2 text-right font-medium">
                    ₹{{ calcLineTotal(i) }}
                  </td>
                  <td class="px-3 py-2 text-center">
                    <button type="button" (click)="removeItem(i)" class="text-red-500 hover:text-red-700" *ngIf="itemsArray.length > 1">&times;</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Submit -->
        <div class="flex justify-end gap-3">
          <button type="button" (click)="router.navigate(['/admin/billing/invoices'])"
                  class="px-6 py-2.5 border rounded-lg text-sm">Cancel</button>
          <button type="submit" [disabled]="saving || form.invalid"
                  class="px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
            {{ saving ? 'Creating...' : 'Create Invoice' }}
          </button>
        </div>
      </form>
    </div>
  `,
})
export class BillingCreateInvoiceComponent implements OnInit {
  form!: FormGroup;
  clients: BillingClient[] = [];
  selectedClient: BillingClient | null = null;
  invoiceTypes = INVOICE_TYPES;
  saving = false;

  constructor(
    private fb: FormBuilder,
    private svc: AccountsBillingService,
    public router: Router,
  ) {}

  ngOnInit(): void {
    this.form = this.fb.group({
      billingClientId: ['', Validators.required],
      invoiceType: ['TAX_INVOICE', Validators.required],
      invoiceDate: [new Date().toISOString().split('T')[0], Validators.required],
      dueDate: [''],
      placeOfSupply: [''],
      remarks: [''],
      items: this.fb.array([this.newItem()]),
    });

    this.svc.getActiveClients().subscribe((c) => (this.clients = c));
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
    });
  }

  addItem(): void {
    this.itemsArray.push(this.newItem());
  }

  removeItem(i: number): void {
    this.itemsArray.removeAt(i);
  }

  onClientChange(): void {
    const id = this.form.value.billingClientId;
    this.selectedClient = this.clients.find((c) => c.id === id) || null;
    if (this.selectedClient) {
      this.form.patchValue({ placeOfSupply: this.selectedClient.placeOfSupply || this.selectedClient.stateName });
      this.itemsArray.controls.forEach((ctrl) => {
        ctrl.patchValue({ gstRate: this.selectedClient!.defaultGstRate });
      });
    }
  }

  calcLineTotal(i: number): string {
    const item = this.itemsArray.at(i).value;
    const amount = (item.quantity || 0) * (item.rate || 0);
    const taxable = amount - (item.discountAmount || 0);
    const gst = taxable * (item.gstRate || 0) / 100;
    return (taxable + gst).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  onSubmit(): void {
    if (this.form.invalid) return;
    this.saving = true;
    this.svc.createInvoice(this.form.value).subscribe({
      next: (inv) => {
        this.saving = false;
        this.router.navigate(['/admin/billing/invoices', inv.id]);
      },
      error: () => (this.saving = false),
    });
  }
}
