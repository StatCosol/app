import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { AdminClientsService, Client } from '../clients/admin-clients.service';
import {
  ClientServiceStatus,
  ServiceChangeRequest,
  ServiceEntitlementsApiService,
  ServiceModuleOption,
  ServicePackageOption,
} from '../../../core/service-entitlements.service';

@Component({
  selector: 'app-admin-service-packages',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="p-6 space-y-6">
      <header>
        <h1 class="text-2xl font-semibold text-slate-900">Client Service Packages</h1>
        <p class="text-sm text-slate-500 mt-1">Create package requests for CCO approval.</p>
      </header>

      <div class="rounded-lg border border-slate-200 bg-white p-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <label class="block">
          <span class="text-xs font-medium text-slate-600">Client</span>
          <select class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" name="clientId" [(ngModel)]="form.clientId" (ngModelChange)="onClientSelected($event)">
            <option value="">Select client</option>
            <option *ngFor="let c of clients" [value]="c.id">{{ c.clientName }}</option>
          </select>
        </label>
        <label class="block">
          <span class="text-xs font-medium text-slate-600">Package</span>
          <select class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" name="packageCode" [(ngModel)]="form.packageCode" (ngModelChange)="applyPackageModules()">
            <option *ngFor="let p of packages" [value]="p.code">{{ p.label }}</option>
          </select>
        </label>
        <label class="block xl:col-span-1">
          <span class="text-xs font-medium text-slate-600">Note</span>
          <input class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" name="note" [(ngModel)]="form.note" placeholder="Reason for change">
        </label>
        <div class="flex items-end">
          <button class="rounded-md bg-blue-700 px-4 py-2 text-white disabled:opacity-50" [disabled]="saving || loadingClientStatus || hasPendingRequest || !form.clientId || !form.modules.length" (click)="submit()">
            Submit for CCO
          </button>
        </div>
      </div>

      <div class="rounded-lg border border-slate-200 bg-white p-4">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 class="font-semibold text-slate-900">Services</h2>
            <p class="text-xs text-slate-500 mt-1" *ngIf="selectedClientStatus">
              Current package: {{ selectedClientStatus.packageCode }}
              <span *ngIf="selectedClientStatus.pendingRequests.length" class="ml-2 text-amber-700 font-medium">
                Pending CCO review
              </span>
            </p>
          </div>
          <button
            type="button"
            class="text-sm text-blue-700 disabled:text-slate-400"
            [disabled]="!form.clientId || loadingClientStatus"
            (click)="loadSelectedClientStatus(form.clientId)">
            {{ loadingClientStatus ? 'Loading...' : 'Reload current services' }}
          </button>
        </div>
        <div class="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <label
            *ngFor="let service of moduleOptions"
            class="flex items-start gap-3 rounded-lg border border-slate-200 p-3 cursor-pointer hover:border-blue-300">
            <input
              type="checkbox"
              class="mt-1 rounded border-slate-300"
              [name]="'module_' + service.code"
              [checked]="isModuleSelected(service.code)"
              (change)="toggleModule(service.code, $any($event.target).checked)" />
            <span>
              <span class="block text-sm font-medium text-slate-900">{{ service.label }}</span>
              <span class="block text-xs text-slate-500 mt-0.5">{{ service.description }}</span>
            </span>
          </label>
        </div>
      </div>

      <p *ngIf="message" class="text-sm" [class.text-green-700]="!error" [class.text-red-700]="error">{{ message }}</p>

      <div class="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <div class="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <h2 class="font-semibold text-slate-900">Recent Requests</h2>
          <button class="text-sm text-blue-700" (click)="load()">Refresh</button>
        </div>
        <table class="w-full text-sm">
          <thead class="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th class="px-4 py-3">Client</th>
              <th class="px-4 py-3">Package</th>
              <th class="px-4 py-3">Status</th>
              <th class="px-4 py-3">Requested</th>
              <th class="px-4 py-3">Reviewed</th>
              <th class="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let r of requests" class="border-t border-slate-100">
              <td class="px-4 py-3">{{ r.clientName || r.clientId }}</td>
              <td class="px-4 py-3">{{ r.packageCode }}</td>
              <td class="px-4 py-3">{{ r.status }}</td>
              <td class="px-4 py-3">{{ r.requestedAt | date:'dd MMM, HH:mm' }}</td>
              <td class="px-4 py-3">{{ r.reviewedAt ? (r.reviewedAt | date:'dd MMM, HH:mm') : '-' }}</td>
              <td class="px-4 py-3 text-right">
                <button
                  *ngIf="r.status === 'CHANGES_REQUESTED'"
                  type="button"
                  class="text-blue-700 font-medium"
                  (click)="reviseRequest(r)">
                  Revise
                </button>
              </td>
            </tr>
            <tr *ngIf="!loading && requests.length === 0">
              <td class="px-4 py-8 text-center text-slate-500" colspan="6">No service package requests yet.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  `,
})
export class AdminServicePackagesComponent implements OnInit {
  clients: Client[] = [];
  packages: ServicePackageOption[] = [];
  moduleOptions: ServiceModuleOption[] = [];
  requests: ServiceChangeRequest[] = [];
  loading = false;
  loadingClientStatus = false;
  saving = false;
  message = '';
  error = false;
  selectedClientStatus: ClientServiceStatus | null = null;
  form = {
    clientId: '',
    packageCode: 'CUSTOM_SERVICES',
    modules: ['EMPLOYEE_COMPLIANCE'],
    note: '',
  };

  constructor(
    private readonly clientsApi: AdminClientsService,
    private readonly entitlements: ServiceEntitlementsApiService,
  ) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    forkJoin({
      clients: this.clientsApi.getClients(),
      packages: this.entitlements.listPackages(),
      modules: this.entitlements.listModules(),
      requests: this.entitlements.listRequests(),
    }).subscribe({
      next: ({ clients, packages, modules, requests }) => {
        this.clients = clients || [];
        this.packages = packages || [];
        this.moduleOptions = modules || [];
        this.requests = requests || [];
        this.loading = false;
      },
      error: () => {
        this.message = 'Failed to load service package data.';
        this.error = true;
        this.loading = false;
      },
    });
  }

  onClientSelected(clientId: string): void {
    this.selectedClientStatus = null;
    this.message = '';
    this.error = false;
    if (!clientId) {
      this.loadingClientStatus = false;
      this.form.packageCode = 'CUSTOM_SERVICES';
      this.form.modules = ['EMPLOYEE_COMPLIANCE'];
      return;
    }
    this.loadSelectedClientStatus(clientId);
  }

  loadSelectedClientStatus(clientId: string, applyCurrentToForm = true): void {
    if (!clientId) return;
    this.loadingClientStatus = true;
    this.entitlements.getClientStatus(clientId).subscribe({
      next: (status) => {
        if (this.form.clientId !== clientId) return;
        this.selectedClientStatus = status;
        if (applyCurrentToForm) {
          this.form.packageCode = status.packageCode || 'CUSTOM_SERVICES';
          this.form.modules = status.enabledModules?.length
            ? [...status.enabledModules]
            : ['EMPLOYEE_COMPLIANCE'];
        }
        this.loadingClientStatus = false;
      },
      error: () => {
        if (this.form.clientId !== clientId) return;
        this.message = 'Failed to load current services for this client.';
        this.error = true;
        this.loadingClientStatus = false;
      },
    });
  }

  applyPackageModules(): void {
    const selected = this.packages.find((p) => p.code === this.form.packageCode);
    this.form.modules = selected?.modules?.length
      ? [...selected.modules]
      : [...this.form.modules];
  }

  isModuleSelected(code: string): boolean {
    return this.form.modules.includes(code);
  }

  toggleModule(code: string, checked: boolean): void {
    const current = new Set(this.form.modules);
    if (checked) current.add(code);
    else current.delete(code);
    this.form.modules = Array.from(current);
    this.form.packageCode = 'CUSTOM_SERVICES';
  }

  get hasPendingRequest(): boolean {
    return !!this.selectedClientStatus?.pendingRequests?.length;
  }

  reviseRequest(request: ServiceChangeRequest): void {
    this.form.clientId = request.clientId;
    this.form.packageCode = request.packageCode || 'CUSTOM_SERVICES';
    this.form.modules = request.requestedModules?.length
      ? [...request.requestedModules]
      : ['EMPLOYEE_COMPLIANCE'];
    this.form.note = request.reviewNote
      ? `Revision after CCO note: ${request.reviewNote}`
      : request.requestNote || '';
    this.selectedClientStatus = null;
    this.message = request.reviewNote
      ? `CCO requested changes: ${request.reviewNote}`
      : 'Revise the selected request and submit it again for CCO review.';
    this.error = false;
    this.loadSelectedClientStatus(request.clientId, false);
  }

  submit(): void {
    if (!this.form.modules.length) {
      this.message = 'Select at least one service.';
      this.error = true;
      return;
    }
    this.saving = true;
    this.message = '';
    this.error = false;
    this.entitlements.createRequest({
      clientId: this.form.clientId,
      packageCode: this.form.packageCode,
      modules: [...this.form.modules],
      note: this.form.note || undefined,
    }).subscribe({
      next: () => {
        this.message = 'Request submitted for CCO approval.';
        this.saving = false;
        this.form.note = '';
        this.load();
      },
      error: (err) => {
        this.message = err?.error?.message || 'Failed to submit request.';
        this.error = true;
        this.saving = false;
      },
    });
  }
}
