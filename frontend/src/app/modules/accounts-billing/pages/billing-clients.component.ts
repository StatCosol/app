import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AccountsBillingService } from '../services/accounts-billing.service';
import { BillingClient, BILLING_FREQUENCIES, INDIAN_STATES } from '../models/billing.models';

@Component({
  selector: 'app-billing-clients',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="p-6 space-y-6">
      <div class="flex items-center justify-between">
        <h1 class="text-2xl font-bold text-slate-800">Billing Clients</h1>
        <button (click)="showForm = true; editClient = null; resetForm()"
                class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium">
          + Add Client
        </button>
      </div>

      <!-- Search -->
      <div class="flex gap-3">
        <input [(ngModel)]="search" (keyup.enter)="loadClients()" placeholder="Search clients..."
               class="flex-1 px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none">
        <select [(ngModel)]="statusFilter" (change)="loadClients()"
                class="px-3 py-2 border rounded-lg text-sm">
          <option value="">All Status</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
        </select>
      </div>

      <!-- Table -->
      <div class="bg-white rounded-xl border shadow-sm overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-slate-50 text-slate-500 uppercase text-xs">
            <tr>
              <th class="px-4 py-3 text-left">Code</th>
              <th class="px-4 py-3 text-left">Legal Name</th>
              <th class="px-4 py-3 text-left">Email</th>
              <th class="px-4 py-3 text-left">State</th>
              <th class="px-4 py-3 text-left">GSTIN</th>
              <th class="px-4 py-3 text-center">Status</th>
              <th class="px-4 py-3 text-center">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y">
            <tr *ngFor="let c of clients" class="hover:bg-slate-50">
              <td class="px-4 py-3 font-mono text-xs">{{ c.billingCode }}</td>
              <td class="px-4 py-3 font-medium">{{ c.legalName }}</td>
              <td class="px-4 py-3">{{ c.billingEmail }}</td>
              <td class="px-4 py-3">{{ c.stateName }}</td>
              <td class="px-4 py-3 font-mono text-xs">{{ c.gstin || '—' }}</td>
              <td class="px-4 py-3 text-center">
                <span [class]="c.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'"
                      class="px-2 py-0.5 rounded-full text-xs font-medium">{{ c.status }}</span>
              </td>
              <td class="px-4 py-3 text-center">
                <button (click)="onEdit(c)" class="text-blue-600 hover:underline text-xs mr-2">Edit</button>
              </td>
            </tr>
            <tr *ngIf="!clients.length">
              <td colspan="7" class="px-4 py-8 text-center text-slate-400">No billing clients found</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Pagination -->
      <div class="flex items-center justify-between text-sm text-slate-500" *ngIf="totalPages > 1">
        <span>Page {{ page }} of {{ totalPages }} ({{ total }} records)</span>
        <div class="flex gap-2">
          <button (click)="page = page - 1; loadClients()" [disabled]="page <= 1"
                  class="px-3 py-1 border rounded disabled:opacity-50">Prev</button>
          <button (click)="page = page + 1; loadClients()" [disabled]="page >= totalPages"
                  class="px-3 py-1 border rounded disabled:opacity-50">Next</button>
        </div>
      </div>

      <!-- Add/Edit Modal -->
      <div *ngIf="showForm" class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
        <div class="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
          <div class="p-6 border-b flex items-center justify-between">
            <h2 class="text-lg font-bold">{{ editClient ? 'Edit' : 'Add' }} Billing Client</h2>
            <button (click)="showForm = false" class="text-slate-400 hover:text-slate-600">&times;</button>
          </div>
          <div class="p-6 space-y-4">
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-medium text-slate-600 mb-1">Legal Name *</label>
                <input [(ngModel)]="form.legalName" class="w-full px-3 py-2 border rounded-lg text-sm">
              </div>
              <div>
                <label class="block text-xs font-medium text-slate-600 mb-1">Trade Name</label>
                <input [(ngModel)]="form.tradeName" class="w-full px-3 py-2 border rounded-lg text-sm">
              </div>
              <div>
                <label class="block text-xs font-medium text-slate-600 mb-1">Billing Email *</label>
                <input [(ngModel)]="form.billingEmail" type="email" class="w-full px-3 py-2 border rounded-lg text-sm">
              </div>
              <div>
                <label class="block text-xs font-medium text-slate-600 mb-1">Contact Person</label>
                <input [(ngModel)]="form.contactPerson" class="w-full px-3 py-2 border rounded-lg text-sm">
              </div>
              <div>
                <label class="block text-xs font-medium text-slate-600 mb-1">Mobile</label>
                <input [(ngModel)]="form.mobile" class="w-full px-3 py-2 border rounded-lg text-sm">
              </div>
              <div>
                <label class="block text-xs font-medium text-slate-600 mb-1">CC Email</label>
                <input [(ngModel)]="form.ccEmail" class="w-full px-3 py-2 border rounded-lg text-sm">
              </div>
              <div>
                <label class="block text-xs font-medium text-slate-600 mb-1">GSTIN</label>
                <input [(ngModel)]="form.gstin" class="w-full px-3 py-2 border rounded-lg text-sm" maxlength="15">
              </div>
              <div>
                <label class="block text-xs font-medium text-slate-600 mb-1">PAN</label>
                <input [(ngModel)]="form.pan" class="w-full px-3 py-2 border rounded-lg text-sm" maxlength="10">
              </div>
              <div>
                <label class="block text-xs font-medium text-slate-600 mb-1">State *</label>
                <select [(ngModel)]="form.stateCode" (change)="onStateChange()" class="w-full px-3 py-2 border rounded-lg text-sm">
                  <option value="">Select State</option>
                  <option *ngFor="let s of states" [value]="s.code">{{ s.name }} ({{ s.code }})</option>
                </select>
              </div>
              <div>
                <label class="block text-xs font-medium text-slate-600 mb-1">Default GST Rate %</label>
                <input [(ngModel)]="form.defaultGstRate" type="number" class="w-full px-3 py-2 border rounded-lg text-sm">
              </div>
              <div>
                <label class="block text-xs font-medium text-slate-600 mb-1">Payment Terms (days)</label>
                <input [(ngModel)]="form.paymentTermsDays" type="number" class="w-full px-3 py-2 border rounded-lg text-sm">
              </div>
              <div>
                <label class="block text-xs font-medium text-slate-600 mb-1">Billing Frequency</label>
                <select [(ngModel)]="form.billingFrequency" class="w-full px-3 py-2 border rounded-lg text-sm">
                  <option *ngFor="let f of frequencies" [value]="f.value">{{ f.label }}</option>
                </select>
              </div>
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1">Billing Address *</label>
              <textarea [(ngModel)]="form.billingAddress" rows="2" class="w-full px-3 py-2 border rounded-lg text-sm"></textarea>
            </div>
          </div>
          <div class="p-6 border-t flex justify-end gap-3">
            <button (click)="showForm = false" class="px-4 py-2 border rounded-lg text-sm">Cancel</button>
            <button (click)="onSave()" class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
                    [disabled]="saving">{{ saving ? 'Saving...' : 'Save' }}</button>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class BillingClientsComponent implements OnInit {
  clients: BillingClient[] = [];
  search = '';
  statusFilter = '';
  page = 1;
  total = 0;
  totalPages = 0;
  showForm = false;
  saving = false;
  editClient: BillingClient | null = null;

  states = INDIAN_STATES;
  frequencies = BILLING_FREQUENCIES;

  form: any = {};

  constructor(private svc: AccountsBillingService) {}

  ngOnInit(): void {
    this.loadClients();
  }

  loadClients(): void {
    const params: Record<string, string> = { page: String(this.page) };
    if (this.search) params['search'] = this.search;
    if (this.statusFilter) params['status'] = this.statusFilter;
    this.svc.getClients(params).subscribe((r) => {
      this.clients = r.data;
      this.total = r.total;
      this.totalPages = r.totalPages;
    });
  }

  resetForm(): void {
    this.form = {
      legalName: '', tradeName: '', billingEmail: '', contactPerson: '', mobile: '',
      ccEmail: '', gstin: '', pan: '', stateCode: '', stateName: '',
      defaultGstRate: 18, paymentTermsDays: 30, billingFrequency: 'MONTHLY',
      billingAddress: '',
    };
  }

  onEdit(c: BillingClient): void {
    this.editClient = c;
    this.form = {
      legalName: c.legalName,
      tradeName: c.tradeName,
      billingEmail: c.billingEmail,
      contactPerson: c.contactPerson,
      mobile: c.mobile,
      ccEmail: c.ccEmail,
      gstin: c.gstin,
      pan: c.pan,
      stateCode: c.stateCode,
      stateName: c.stateName,
      defaultGstRate: c.defaultGstRate,
      paymentTermsDays: c.paymentTermsDays,
      billingFrequency: c.billingFrequency,
      billingAddress: c.billingAddress,
      status: c.status,
      placeOfSupply: c.placeOfSupply,
    };
    this.showForm = true;
  }

  onStateChange(): void {
    const st = this.states.find((s) => s.code === this.form.stateCode);
    if (st) this.form.stateName = st.name;
  }

  onSave(): void {
    this.saving = true;
    const obs = this.editClient
      ? this.svc.updateClient(this.editClient.id, this.form)
      : this.svc.createClient(this.form);
    obs.subscribe({
      next: () => {
        this.showForm = false;
        this.saving = false;
        this.loadClients();
      },
      error: () => (this.saving = false),
    });
  }
}
