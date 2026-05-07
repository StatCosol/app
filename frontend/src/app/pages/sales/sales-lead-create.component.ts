import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import {
  Lead,
  LeadPriority,
  LeadSource,
  SalesService,
} from '../../modules/sales/sales.service';

@Component({
  selector: 'app-sales-lead-create',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  template: `
    <div class="max-w-3xl mx-auto space-y-5">
      <div class="flex items-center justify-between">
        <h2 class="text-2xl font-bold text-gray-900">New Lead</h2>
        <a routerLink="/sales/leads" class="text-sm text-gray-500 hover:underline">← Back to leads</a>
      </div>

      <form (submit)="$event.preventDefault(); save()" class="bg-white rounded-xl border border-gray-200 p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="md:col-span-2">
          <label class="block text-sm font-medium text-gray-700 mb-1">Company name <span class="text-red-500">*</span></label>
          <input [(ngModel)]="model.companyName" name="companyName" required class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Contact name</label>
          <input [(ngModel)]="model.contactName" name="contactName" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Designation</label>
          <input [(ngModel)]="model.designation" name="designation" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Phone</label>
          <input [(ngModel)]="model.contactPhone" name="contactPhone" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input [(ngModel)]="model.contactEmail" name="contactEmail" type="email" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Industry</label>
          <input [(ngModel)]="model.industry" name="industry" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Employee count</label>
          <input [(ngModel)]="model.employeeCount" name="employeeCount" type="number" min="0" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">State</label>
          <input [(ngModel)]="model.state" name="state" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">City</label>
          <input [(ngModel)]="model.city" name="city" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Source</label>
          <select [(ngModel)]="model.source" name="source" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
            <option *ngFor="let s of sources" [value]="s">{{ s }}</option>
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Source detail</label>
          <input [(ngModel)]="model.sourceDetail" name="sourceDetail" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Priority</label>
          <select [(ngModel)]="model.priority" name="priority" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
            <option *ngFor="let p of priorities" [value]="p">{{ p }}</option>
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Estimated value (₹)</label>
          <input [(ngModel)]="model.estimatedValue" name="estimatedValue" type="number" min="0" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Probability (%)</label>
          <input [(ngModel)]="model.probability" name="probability" type="number" min="0" max="100" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Expected close date</label>
          <input [(ngModel)]="model.expectedCloseDate" name="expectedCloseDate" type="date" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Next follow-up</label>
          <input [(ngModel)]="model.nextFollowupAt" name="nextFollowupAt" type="datetime-local" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div class="md:col-span-2">
          <label class="block text-sm font-medium text-gray-700 mb-1">Description / requirement</label>
          <textarea [(ngModel)]="model.description" name="description" rows="3" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"></textarea>
        </div>

        <div *ngIf="error" class="md:col-span-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{{ error }}</div>
        <div class="md:col-span-2 flex justify-end gap-2 pt-2">
          <a routerLink="/sales/leads" class="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg">Cancel</a>
          <button type="submit" [disabled]="saving" class="px-5 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50">
            {{ saving ? 'Saving…' : 'Create Lead' }}
          </button>
        </div>
      </form>
    </div>
  `,
})
export class SalesLeadCreateComponent {
  sources: LeadSource[] = ['INBOUND','REFERRAL','OUTBOUND','EVENT','WEBSITE','MARKETING','PARTNER','OTHER'];
  priorities: LeadPriority[] = ['LOW','MEDIUM','HIGH','CRITICAL'];

  model: Partial<Lead> & { companyName: string } = {
    companyName: '',
    source: 'OUTBOUND',
    priority: 'MEDIUM',
    estimatedValue: 0,
    probability: 20,
  };
  saving = false;
  error = '';

  constructor(private svc: SalesService, private router: Router) {}

  save(): void {
    this.saving = true;
    this.error = '';
    this.svc.create(this.cleanup(this.model)).subscribe({
      next: (lead) => this.router.navigate(['/sales/leads', lead.id]),
      error: (err) => {
        this.error = err?.error?.message?.toString() || 'Failed to create lead';
        this.saving = false;
      },
    });
  }

  private cleanup<T extends Record<string, any>>(o: T): T {
    const out: Record<string, any> = {};
    for (const k of Object.keys(o)) {
      const v = o[k];
      if (v === '' || v === null || v === undefined) continue;
      out[k] = v;
    }
    return out as T;
  }
}
