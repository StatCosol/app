import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AccountsBillingService } from '../services/accounts-billing.service';
import { BillingClient, BILLING_FREQUENCIES } from '../models/billing.models';
import { ConfirmDialogService } from '../../../shared/ui/confirm-dialog/confirm-dialog.service';

interface RecurringConfig {
  id: string;
  billingClientId: string;
  billingClient?: BillingClient;
  invoiceName: string;
  frequency: string;
  serviceDescription: string;
  defaultAmount: number;
  defaultGstRate: number;
  startDate: string;
  endDate?: string | null;
  nextRunDate: string;
  isActive: boolean;
  createdAt?: string;
}

@Component({
  selector: 'app-billing-recurring',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="p-6 space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-slate-800">Recurring Invoices</h1>
          <p class="text-sm text-slate-500 mt-1">
            Auto-generated invoices run on the 1st of each month at 09:00 UTC (14:30 IST).
            Active configs whose <strong>Next Run</strong> date has been reached will be billed and emailed automatically.
          </p>
        </div>
        <div class="flex gap-2">
          <button (click)="runNow()" [disabled]="running"
                  class="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition text-sm font-medium disabled:opacity-50">
            {{ running ? 'Running…' : 'Run Now' }}
          </button>
          <button (click)="openCreate()"
                  class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium">
            + Add Recurring
          </button>
        </div>
      </div>

      @if (message) {
<div class="p-3 rounded-lg text-sm"
           [class.bg-green-50]="!error" [class.text-green-700]="!error"
           [class.bg-red-50]="error" [class.text-red-700]="error">
        {{ message }}
      </div>
}

      <div class="bg-white rounded-xl border shadow-sm overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-slate-50 text-slate-500 uppercase text-xs">
            <tr>
              <th class="px-4 py-3 text-left">Client</th>
              <th class="px-4 py-3 text-left">Invoice Name</th>
              <th class="px-4 py-3 text-left">Frequency</th>
              <th class="px-4 py-3 text-right">Amount (₹)</th>
              <th class="px-4 py-3 text-right">GST %</th>
              <th class="px-4 py-3 text-left">Next Run</th>
              <th class="px-4 py-3 text-center">Active</th>
              <th class="px-4 py-3 text-center">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y">
            @for (r of configs; track r) {
<tr class="hover:bg-slate-50">
              <td class="px-4 py-3 font-medium">{{ r.billingClient?.legalName || '—' }}</td>
              <td class="px-4 py-3">{{ r.invoiceName }}</td>
              <td class="px-4 py-3">{{ r.frequency }}</td>
              <td class="px-4 py-3 text-right font-mono">{{ r.defaultAmount | number:'1.2-2' }}</td>
              <td class="px-4 py-3 text-right">{{ r.defaultGstRate }}</td>
              <td class="px-4 py-3 font-mono text-xs">{{ r.nextRunDate }}</td>
              <td class="px-4 py-3 text-center">
                <button (click)="toggle(r)"
                        [class.bg-green-100]="r.isActive" [class.text-green-700]="r.isActive"
                        [class.bg-slate-100]="!r.isActive" [class.text-slate-600]="!r.isActive"
                        class="px-2 py-0.5 rounded-full text-xs font-medium">
                  {{ r.isActive ? 'Active' : 'Inactive' }}
                </button>
              </td>
              <td class="px-4 py-3 text-center">
                <button (click)="openEdit(r)" class="text-blue-600 hover:underline text-xs mr-2">Edit</button>
                <button (click)="onDelete(r)" class="text-red-600 hover:underline text-xs">Delete</button>
              </td>
            </tr>
}
            @if (!configs.length) {
<tr>
              <td colspan="8" class="px-4 py-8 text-center text-slate-400">
                No recurring invoice configurations yet. Click "Add Recurring" to set one up.
              </td>
            </tr>
}
          </tbody>
        </table>
      </div>

      <!-- Modal -->
      @if (showForm) {
<div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div class="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
          <div class="px-6 py-4 border-b flex justify-between items-center">
            <h2 class="text-lg font-bold">{{ editing ? 'Edit' : 'Add' }} Recurring Invoice</h2>
            <button (click)="closeForm()" class="text-slate-400 hover:text-slate-700 text-2xl leading-none">&times;</button>
          </div>
          <div class="p-6 space-y-4">
            @if (saveError) {
<div class="p-3 bg-red-50 text-red-700 text-sm rounded-lg">{{ saveError }}</div>
}

            <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">Billing Client *</label>
              <select [(ngModel)]="form.billingClientId" [disabled]="!!editing"
                      class="w-full px-3 py-2 border rounded-lg text-sm">
                <option value="">-- Select Client --</option>
                @for (c of clients; track c) {
<option [value]="c.id">{{ c.legalName }}</option>
}
              </select>
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-sm font-medium text-slate-700 mb-1">Invoice Name *</label>
                <input [(ngModel)]="form.invoiceName" placeholder="e.g. Monthly Compliance Retainer"
                       class="w-full px-3 py-2 border rounded-lg text-sm">
              </div>
              <div>
                <label class="block text-sm font-medium text-slate-700 mb-1">Frequency *</label>
                <select [(ngModel)]="form.frequency" class="w-full px-3 py-2 border rounded-lg text-sm">
                  @for (f of frequencies; track f) {
<option [value]="f.value">{{ f.label }}</option>
}
                </select>
              </div>
            </div>

            <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">Service Description *</label>
              <textarea [(ngModel)]="form.serviceDescription" rows="2"
                        placeholder="Description that will appear as the invoice line item"
                        class="w-full px-3 py-2 border rounded-lg text-sm"></textarea>
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-sm font-medium text-slate-700 mb-1">Amount (excl. GST) *</label>
                <input type="number" step="0.01" [(ngModel)]="form.defaultAmount"
                       class="w-full px-3 py-2 border rounded-lg text-sm">
              </div>
              <div>
                <label class="block text-sm font-medium text-slate-700 mb-1">GST Rate %</label>
                <input type="number" step="0.01" [(ngModel)]="form.defaultGstRate"
                       class="w-full px-3 py-2 border rounded-lg text-sm">
              </div>
            </div>

            <div class="grid grid-cols-3 gap-3">
              <div>
                <label class="block text-sm font-medium text-slate-700 mb-1">Start Date *</label>
                <input type="date" [(ngModel)]="form.startDate"
                       class="w-full px-3 py-2 border rounded-lg text-sm">
              </div>
              <div>
                <label class="block text-sm font-medium text-slate-700 mb-1">Next Run *</label>
                <input type="date" [(ngModel)]="form.nextRunDate"
                       class="w-full px-3 py-2 border rounded-lg text-sm">
              </div>
              <div>
                <label class="block text-sm font-medium text-slate-700 mb-1">End Date</label>
                <input type="date" [(ngModel)]="form.endDate"
                       class="w-full px-3 py-2 border rounded-lg text-sm">
              </div>
            </div>

            <div class="flex items-center gap-2 pt-2">
              <input type="checkbox" [(ngModel)]="form.isActive" id="ric-active">
              <label for="ric-active" class="text-sm text-slate-700">Active (will run automatically)</label>
            </div>
          </div>
          <div class="px-6 py-4 border-t flex justify-end gap-2">
            <button (click)="closeForm()" class="px-4 py-2 border rounded-lg text-sm">Cancel</button>
            <button (click)="save()" [disabled]="saving"
                    class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm disabled:opacity-50">
              {{ saving ? 'Saving…' : (editing ? 'Update' : 'Create') }}
            </button>
          </div>
        </div>
      </div>
}
    </div>
  `,
})
export class BillingRecurringComponent implements OnInit {
  configs: RecurringConfig[] = [];
  clients: BillingClient[] = [];
  frequencies = BILLING_FREQUENCIES;

  showForm = false;
  editing: RecurringConfig | null = null;
  saving = false;
  saveError = '';
  message = '';
  error = false;
  running = false;

  form: any = this.emptyForm();

  constructor(
    private svc: AccountsBillingService,
    private dialog: ConfirmDialogService,
  ) {}

  ngOnInit() {
    this.load();
    this.svc.getActiveClients().subscribe((c: BillingClient[]) => (this.clients = c));
  }

  load() {
    this.svc.getRecurringConfigs().subscribe({
      next: (rows) => (this.configs = rows),
      error: (e) => this.flash('Failed to load configs: ' + (e.error?.message || e.message), true),
    });
  }

  emptyForm() {
    const today = new Date().toISOString().slice(0, 10);
    const firstOfNextMonth = (() => {
      const d = new Date();
      d.setMonth(d.getMonth() + 1);
      d.setDate(1);
      return d.toISOString().slice(0, 10);
    })();
    return {
      billingClientId: '',
      invoiceName: '',
      frequency: 'MONTHLY',
      serviceDescription: '',
      defaultAmount: 0,
      defaultGstRate: 18,
      startDate: today,
      endDate: '',
      nextRunDate: firstOfNextMonth,
      isActive: true,
    };
  }

  openCreate() {
    this.editing = null;
    this.form = this.emptyForm();
    this.saveError = '';
    this.showForm = true;
  }

  openEdit(r: RecurringConfig) {
    this.editing = r;
    this.form = {
      billingClientId: r.billingClientId,
      invoiceName: r.invoiceName,
      frequency: r.frequency,
      serviceDescription: r.serviceDescription,
      defaultAmount: Number(r.defaultAmount),
      defaultGstRate: Number(r.defaultGstRate),
      startDate: r.startDate,
      endDate: r.endDate || '',
      nextRunDate: r.nextRunDate,
      isActive: r.isActive,
    };
    this.saveError = '';
    this.showForm = true;
  }

  closeForm() {
    this.showForm = false;
    this.editing = null;
  }

  save() {
    this.saving = true;
    this.saveError = '';
    const payload: any = { ...this.form };
    payload.defaultAmount = Number(payload.defaultAmount);
    payload.defaultGstRate = Number(payload.defaultGstRate);
    if (!payload.endDate) delete payload.endDate;

    const obs = this.editing
      ? this.svc.updateRecurringConfig(this.editing.id, payload)
      : this.svc.createRecurringConfig(payload);

    obs.subscribe({
      next: () => {
        this.saving = false;
        this.closeForm();
        this.flash('Saved.');
        this.load();
      },
      error: (e) => {
        this.saving = false;
        this.saveError = e.error?.message || e.message || 'Save failed';
      },
    });
  }

  toggle(r: RecurringConfig) {
    this.svc.toggleRecurringConfig(r.id, !r.isActive).subscribe({
      next: () => {
        r.isActive = !r.isActive;
      },
      error: (e) => this.flash('Toggle failed: ' + (e.error?.message || e.message), true),
    });
  }

  async onDelete(r: RecurringConfig): Promise<void> {
    const ok = await this.dialog.confirm(
      'Delete Recurring Config',
      `Delete recurring config "${r.invoiceName}"?`,
      { confirmText: 'Delete', variant: 'danger' },
    );
    if (!ok) return;
    this.svc.deleteRecurringConfig(r.id).subscribe({
      next: () => {
        this.flash('Deleted.');
        this.load();
      },
      error: (e) => this.flash('Delete failed: ' + (e.error?.message || e.message), true),
    });
  }

  async runNow(): Promise<void> {
    const ok = await this.dialog.confirm(
      'Run Recurring Job',
      'Run the recurring invoice job now? This will generate and email invoices for all due active configs.',
      { confirmText: 'Run Now' },
    );
    if (!ok) return;
    this.running = true;
    this.svc.runRecurringNow().subscribe({
      next: (r: any) => {
        this.running = false;
        const due = r?.due ?? 0;
        const ok = r?.ok ?? 0;
        const failed = r?.failed ?? 0;
        const noEmail = r?.skippedNoEmail ?? 0;
        if (due === 0) {
          this.flash('Run completed: no configs were due today.');
        } else {
          const parts = [`due=${due}`, `sent=${ok}`];
          if (noEmail) parts.push(`skipped (no email)=${noEmail}`);
          if (failed) parts.push(`failed=${failed}`);
          this.flash(`Run completed: ${parts.join(', ')}. Check Email Logs.`);
        }
        this.load();
      },
      error: (e) => {
        this.running = false;
        this.flash('Run failed: ' + (e.error?.message || e.message), true);
      },
    });
  }

  flash(msg: string, isError = false) {
    this.message = msg;
    this.error = isError;
    setTimeout(() => (this.message = ''), 5000);
  }
}
