import { Component, OnInit, inject, signal, computed } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { PageHeaderComponent } from '../../../shared/ui/page-header/page-header.component';
import {
  AdminClientsService,
  Client,
} from '../clients/admin-clients.service';
import {
  ClientContactsService,
  ClientContactDepartment,
  ClientDepartmentContact,
  CreateContactPayload,
} from './client-contacts.service';
import { ConfirmDialogService } from '../../../shared/ui/confirm-dialog/confirm-dialog.service';

interface ContactForm {
  id: string | null;
  department: ClientContactDepartment;
  name: string;
  email: string;
  phone: string;
  designation: string;
  isActive: boolean;
  notes: string;
}

const ALL_DEPARTMENTS: ClientContactDepartment[] = [
  'ACCOUNTS',
  'COMPLIANCE',
  'CONTRACTOR_COMPLIANCE',
  'HR',
  'PAYROLL',
];

const DEPT_LABELS: Record<ClientContactDepartment, string> = {
  ACCOUNTS: 'Accounts',
  COMPLIANCE: 'Compliance',
  CONTRACTOR_COMPLIANCE: 'Contractor Compliance',
  HR: 'HR',
  PAYROLL: 'Payroll',
};

const DEPT_COLORS: Record<ClientContactDepartment, string> = {
  ACCOUNTS: 'bg-amber-100 text-amber-800',
  COMPLIANCE: 'bg-blue-100 text-blue-800',
  CONTRACTOR_COMPLIANCE: 'bg-purple-100 text-purple-800',
  HR: 'bg-pink-100 text-pink-800',
  PAYROLL: 'bg-emerald-100 text-emerald-800',
};

@Component({
  selector: 'app-admin-client-contacts',
  standalone: true,
  imports: [FormsModule, PageHeaderComponent],
  template: `
    <ui-page-header
      title="Client Department Contacts"
      subtitle="Maintain per-client mailing lists for Accounts, Compliance, HR, Payroll & Contractor Compliance"
      [breadcrumbs]="[
        { label: 'Admin', route: '/admin/dashboard' },
        { label: 'Client Contacts' }
      ]"
    ></ui-page-header>

    <div class="max-w-7xl mx-auto px-4 py-6">
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <!-- ────── LEFT: Client list ────── -->
        <div class="lg:col-span-4">
          <div class="bg-white border border-gray-200 rounded-xl shadow-sm">
            <div class="p-3 border-b border-gray-100">
              <input
                type="text"
                [(ngModel)]="clientSearch"
                placeholder="Search clients…"
                class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
            @if (loadingClients()) {
<div class="p-4 text-sm text-gray-500">
              Loading clients…
            </div>
}
            @if (!loadingClients()) {
<ul
             
              class="max-h-[70vh] overflow-y-auto divide-y divide-gray-100"
            >
              @for (c of filteredClients(); track c) {
<li
               
                class="cursor-pointer px-3 py-2.5 hover:bg-blue-50 transition-colors"
                [class.bg-blue-50]="selectedClient()?.id === c.id"
                [class.border-l-4]="selectedClient()?.id === c.id"
                [class.border-blue-500]="selectedClient()?.id === c.id"
                (click)="selectClient(c)"
              >
                <div class="text-sm font-medium text-gray-900 truncate">
                  {{ c.clientName }}
                </div>
                @if (c.clientCode) {
<div
                  class="text-xs text-gray-500 truncate"
                 
                >
                  {{ c.clientCode }}
                </div>
}
              </li>
}
              @if (filteredClients().length === 0) {
<li
               
                class="p-4 text-sm text-gray-400 text-center"
              >
                No clients match your search.
              </li>
}
            </ul>
}
          </div>
        </div>

        <!-- ────── RIGHT: Contacts for selected client ────── -->
        <div class="lg:col-span-8 space-y-4">
          @if (!selectedClient()) {
<div
           
            class="bg-white border border-dashed border-gray-300 rounded-xl p-12 text-center text-gray-500"
          >
            Select a client from the list to manage their department contacts.
          </div>
}

          @if (selectedClient(); as client) {

            <!-- Header bar with actions -->
            <div
              class="bg-white border border-gray-200 rounded-xl shadow-sm p-4 flex items-start justify-between gap-3 flex-wrap"
            >
              <div>
                <div class="text-lg font-semibold text-gray-900">
                  {{ client.clientName }}
                </div>
                @if (client.clientCode) {
<div class="text-xs text-gray-500">
                  {{ client.clientCode }}
                </div>
}
              </div>
              <div class="flex flex-wrap gap-2">
                <button
                  type="button"
                  class="px-3 py-1.5 text-xs font-medium rounded-md border border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                  (click)="triggerPayrollMail(client)"
                  [disabled]="busyTrigger()"
                >
                  ▶ Send Payroll Mail Now
                </button>
                <button
                  type="button"
                  class="px-3 py-1.5 text-xs font-medium rounded-md border border-purple-300 text-purple-700 hover:bg-purple-50"
                  (click)="triggerMcdMail(client)"
                  [disabled]="busyTrigger()"
                >
                  ▶ Send MCD Mail Now
                </button>
                <button
                  type="button"
                  class="px-3 py-1.5 text-xs font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700"
                  (click)="openCreate()"
                >
                  + Add Contact
                </button>
              </div>
            </div>

            <!-- Contacts grouped by department -->
            @if (loadingContacts()) {
<div class="text-sm text-gray-500 p-4">
              Loading contacts…
            </div>
}

            @if (!loadingContacts()) {
<div class="space-y-3">
              @for (dept of departments; track dept) {
<div
               
                class="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden"
              >
                <div
                  class="px-4 py-2.5 flex items-center justify-between border-b border-gray-100 bg-gray-50"
                >
                  <div class="flex items-center gap-2">
                    <span
                      class="text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded"
                      [class]="deptColor(dept)"
                    >
                      {{ deptLabel(dept) }}
                    </span>
                    <span class="text-xs text-gray-500">
                      {{ contactsByDept(dept).length }} contact(s)
                    </span>
                  </div>
                  <button
                    class="text-xs font-medium text-blue-600 hover:text-blue-800"
                    (click)="openCreate(dept)"
                  >
                    + Add to {{ deptLabel(dept) }}
                  </button>
                </div>
                @if (contactsByDept(dept).length === 0) {
<div class="p-4 text-sm text-gray-400">
                  No contacts configured.
                </div>
}
                @if (contactsByDept(dept).length > 0) {
<div class="table-wrap"><table
                 
                  class="w-full text-sm"
                >
                  <thead class="bg-gray-50 text-gray-600">
                    <tr>
                      <th class="text-left font-medium px-4 py-2">Name</th>
                      <th class="text-left font-medium px-4 py-2">Email</th>
                      <th class="text-left font-medium px-4 py-2">Phone</th>
                      <th class="text-left font-medium px-4 py-2">Designation</th>
                      <th class="text-center font-medium px-2 py-2">Active</th>
                      <th class="text-right font-medium px-4 py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-gray-100">
                    @for (c of contactsByDept(dept); track c) {
<tr>
                      <td class="px-4 py-2 text-gray-900">{{ c.name }}</td>
                      <td class="px-4 py-2 text-gray-700">
                        <a
                          [href]="'mailto:' + c.email"
                          class="text-blue-600 hover:underline"
                          >{{ c.email }}</a
                        >
                      </td>
                      <td class="px-4 py-2 text-gray-700">{{ c.phone || '—' }}</td>
                      <td class="px-4 py-2 text-gray-700">
                        {{ c.designation || '—' }}
                      </td>
                      <td class="px-2 py-2 text-center">
                        <span
                          class="inline-flex w-2 h-2 rounded-full"
                          [class.bg-emerald-500]="c.isActive"
                          [class.bg-gray-300]="!c.isActive"
                        ></span>
                      </td>
                      <td class="px-4 py-2 text-right space-x-2">
                        <button
                          class="text-xs text-blue-600 hover:text-blue-800"
                          (click)="openEdit(c)"
                        >
                          Edit
                        </button>
                        <button
                          class="text-xs text-red-600 hover:text-red-800"
                          (click)="remove(c)"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
}
                  </tbody>
                </table></div>
}
              </div>
}
            </div>
}
          
}
        </div>
      </div>
    </div>

    <!-- ────── Modal: Create/Edit ────── -->
    @if (formOpen()) {
<div
     
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      (click)="closeForm()"
    >
      <div
        class="bg-white rounded-xl shadow-xl w-full max-w-lg p-5"
        (click)="$event.stopPropagation()"
      >
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-lg font-semibold text-gray-900">
            {{ form.id ? 'Edit Contact' : 'New Contact' }}
          </h3>
          <button
            class="text-gray-400 hover:text-gray-700"
            (click)="closeForm()"
          >
            ✕
          </button>
        </div>

        <div class="space-y-3">
          <div>
            <label class="block text-xs font-medium text-gray-700 mb-1"
              >Department <span class="text-red-500">*</span></label
            >
            <select
              [(ngModel)]="form.department"
              class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            >
              @for (d of departments; track d) {
<option [value]="d">
                {{ deptLabel(d) }}
              </option>
}
            </select>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-medium text-gray-700 mb-1"
                >Name <span class="text-red-500">*</span></label
              >
              <input
                type="text"
                [(ngModel)]="form.name"
                maxlength="160"
                class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-700 mb-1"
                >Designation</label
              >
              <input
                type="text"
                [(ngModel)]="form.designation"
                maxlength="120"
                class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-medium text-gray-700 mb-1"
                >Email <span class="text-red-500">*</span></label
              >
              <input
                type="email"
                [(ngModel)]="form.email"
                maxlength="160"
                class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-700 mb-1"
                >Phone</label
              >
              <input
                type="text"
                [(ngModel)]="form.phone"
                maxlength="40"
                class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-700 mb-1"
              >Notes</label
            >
            <textarea
              rows="2"
              [(ngModel)]="form.notes"
              class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            ></textarea>
          </div>
          <label class="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" [(ngModel)]="form.isActive" />
            Active (include in mailings)
          </label>
        </div>

        @if (formError()) {
<div class="mt-3 text-sm text-red-600">
          {{ formError() }}
        </div>
}

        <div class="mt-5 flex justify-end gap-2">
          <button
            type="button"
            class="px-3 py-1.5 text-sm rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
            (click)="closeForm()"
          >
            Cancel
          </button>
          <button
            type="button"
            class="px-3 py-1.5 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
            (click)="save()"
            [disabled]="busySave()"
          >
            {{ form.id ? 'Update' : 'Create' }}
          </button>
        </div>
      </div>
    </div>
}

    <!-- Toast -->
    @if (toast(); as t) {
<div
     
      class="fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg shadow-lg text-sm text-white"
      [class.bg-emerald-600]="t.kind === 'ok'"
      [class.bg-red-600]="t.kind === 'err'"
    >
      {{ t.text }}
    </div>
}
  `,
})
export class AdminClientContactsComponent implements OnInit {
  private readonly clientsSvc = inject(AdminClientsService);
  private readonly contactsSvc = inject(ClientContactsService);
  private readonly dialog = inject(ConfirmDialogService);

  readonly departments = ALL_DEPARTMENTS;

  loadingClients = signal(true);
  loadingContacts = signal(false);
  busySave = signal(false);
  busyTrigger = signal(false);
  formOpen = signal(false);
  formError = signal<string | null>(null);
  toast = signal<{ kind: 'ok' | 'err'; text: string } | null>(null);

  clients = signal<Client[]>([]);
  contacts = signal<ClientDepartmentContact[]>([]);
  selectedClient = signal<Client | null>(null);

  clientSearch = '';

  form: ContactForm = this.emptyForm();

  filteredClients = computed(() => {
    const q = (this.clientSearch || '').trim().toLowerCase();
    const list = this.clients();
    if (!q) return list;
    return list.filter(
      (c) =>
        c.clientName.toLowerCase().includes(q) ||
        (c.clientCode || '').toLowerCase().includes(q),
    );
  });

  ngOnInit(): void {
    this.clientsSvc.getClients().subscribe({
      next: (list) => {
        this.clients.set(list || []);
        this.loadingClients.set(false);
      },
      error: () => {
        this.loadingClients.set(false);
        this.flash('err', 'Failed to load clients');
      },
    });
  }

  selectClient(c: Client): void {
    this.selectedClient.set(c);
    this.loadContacts(c.id);
  }

  loadContacts(clientId: string): void {
    this.loadingContacts.set(true);
    this.contactsSvc.list(clientId).subscribe({
      next: (rows) => {
        this.contacts.set(rows || []);
        this.loadingContacts.set(false);
      },
      error: () => {
        this.loadingContacts.set(false);
        this.flash('err', 'Failed to load contacts');
      },
    });
  }

  contactsByDept(dept: ClientContactDepartment): ClientDepartmentContact[] {
    return this.contacts().filter((c) => c.department === dept);
  }

  deptLabel(d: ClientContactDepartment): string {
    return DEPT_LABELS[d];
  }
  deptColor(d: ClientContactDepartment): string {
    return DEPT_COLORS[d];
  }

  // ─── Form ───
  openCreate(dept?: ClientContactDepartment): void {
    this.form = this.emptyForm();
    if (dept) this.form.department = dept;
    this.formError.set(null);
    this.formOpen.set(true);
  }

  openEdit(c: ClientDepartmentContact): void {
    this.form = {
      id: c.id,
      department: c.department,
      name: c.name,
      email: c.email,
      phone: c.phone || '',
      designation: c.designation || '',
      isActive: c.isActive,
      notes: c.notes || '',
    };
    this.formError.set(null);
    this.formOpen.set(true);
  }

  closeForm(): void {
    if (this.busySave()) return;
    this.formOpen.set(false);
  }

  save(): void {
    const client = this.selectedClient();
    if (!client) return;

    if (!this.form.name.trim()) {
      this.formError.set('Name is required');
      return;
    }
    if (!this.form.email.trim() || !/^\S+@\S+\.\S+$/.test(this.form.email)) {
      this.formError.set('A valid email is required');
      return;
    }

    this.busySave.set(true);
    this.formError.set(null);

    if (this.form.id) {
      this.contactsSvc
        .update(this.form.id, {
          department: this.form.department,
          name: this.form.name.trim(),
          email: this.form.email.trim(),
          phone: this.form.phone.trim() || undefined,
          designation: this.form.designation.trim() || undefined,
          isActive: this.form.isActive,
          notes: this.form.notes.trim() || undefined,
        })
        .subscribe({
          next: () => {
            this.busySave.set(false);
            this.formOpen.set(false);
            this.flash('ok', 'Contact updated');
            this.loadContacts(client.id);
          },
          error: (e) => {
            this.busySave.set(false);
            this.formError.set(this.errMsg(e));
          },
        });
    } else {
      const payload: CreateContactPayload = {
        clientId: client.id,
        department: this.form.department,
        name: this.form.name.trim(),
        email: this.form.email.trim(),
        phone: this.form.phone.trim() || undefined,
        designation: this.form.designation.trim() || undefined,
        isActive: this.form.isActive,
        notes: this.form.notes.trim() || undefined,
      };
      this.contactsSvc.create(payload).subscribe({
        next: () => {
          this.busySave.set(false);
          this.formOpen.set(false);
          this.flash('ok', 'Contact added');
          this.loadContacts(client.id);
        },
        error: (e) => {
          this.busySave.set(false);
          this.formError.set(this.errMsg(e));
        },
      });
    }
  }

  async remove(c: ClientDepartmentContact): Promise<void> {
    const ok = await this.dialog.confirm(
      'Delete Contact',
      `Delete contact "${c.name}" (${c.email})?`,
      { variant: 'danger', confirmText: 'Delete' },
    );
    if (!ok) return;
    this.contactsSvc.remove(c.id).subscribe({
      next: () => {
        this.flash('ok', 'Contact deleted');
        const cl = this.selectedClient();
        if (cl) this.loadContacts(cl.id);
      },
      error: (e) => this.flash('err', this.errMsg(e)),
    });
  }

  async triggerPayrollMail(c: Client): Promise<void> {
    const ok = await this.dialog.confirm(
      'Send Payroll Mail',
      `Send payroll-input request email now to PAYROLL contacts of ${c.clientName}?`,
      { confirmText: 'Send' },
    );
    if (!ok) return;
    this.busyTrigger.set(true);
    this.contactsSvc.triggerPayrollNow(c.id).subscribe({
      next: (res) => {
        this.busyTrigger.set(false);
        const s = res.summary;
        this.flash(
          s.failed ? 'err' : 'ok',
          `Payroll mail: sent=${s.sent}, skipped=${s.skipped}, failed=${s.failed}`,
        );
      },
      error: (e) => {
        this.busyTrigger.set(false);
        this.flash('err', this.errMsg(e));
      },
    });
  }

  async triggerMcdMail(c: Client): Promise<void> {
    const ok = await this.dialog.confirm(
      'Send MCD Mail',
      `Send MCD data-request email now to contractors of ${c.clientName}?`,
      { confirmText: 'Send' },
    );
    if (!ok) return;
    this.busyTrigger.set(true);
    this.contactsSvc.triggerMcdNow(c.id).subscribe({
      next: (res) => {
        this.busyTrigger.set(false);
        const s = res.summary;
        this.flash(
          s.failed ? 'err' : 'ok',
          `MCD mail: sent=${s.sent}, skipped=${s.skipped}, failed=${s.failed}`,
        );
      },
      error: (e) => {
        this.busyTrigger.set(false);
        this.flash('err', this.errMsg(e));
      },
    });
  }

  // ─── helpers ───
  private emptyForm(): ContactForm {
    return {
      id: null,
      department: 'PAYROLL',
      name: '',
      email: '',
      phone: '',
      designation: '',
      isActive: true,
      notes: '',
    };
  }

  private errMsg(e: unknown): string {
    const err = e as {
      error?: { message?: string | string[] };
      message?: string;
    };
    const m = err?.error?.message;
    if (Array.isArray(m)) return m.join('; ');
    return (m as string) || err?.message || 'Request failed';
  }

  private flash(kind: 'ok' | 'err', text: string): void {
    this.toast.set({ kind, text });
    setTimeout(() => this.toast.set(null), 4000);
  }
}
