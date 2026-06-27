import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { AdminClientsService, Client } from '../clients/admin-clients.service';
import {
  ClientServiceStatus,
  ServiceAuditLogEntry,
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
            <div *ngIf="selectedClientStatus?.pendingRequests?.length" class="mt-3 space-y-2">
              <div
                *ngFor="let request of selectedClientStatus?.pendingRequests"
                class="rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <span class="text-sm font-medium text-amber-950">{{ request.packageCode }}</span>
                  <span class="text-xs text-amber-800">Requested {{ request.requestedAt | date:'dd MMM, HH:mm' }}</span>
                </div>
                <div class="mt-2 flex flex-wrap gap-1">
                  <span
                    *ngFor="let module of request.requestedModules"
                    class="rounded-full bg-white px-2 py-0.5 text-xs text-slate-700 border border-amber-100">
                    {{ moduleLabel(module) }}
                  </span>
                </div>
                <p *ngIf="request.requestNote" class="mt-2 text-xs text-amber-900">
                  {{ request.requestNote }}
                </p>
              </div>
            </div>
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

      <div *ngIf="changeRequestedRequests.length" class="rounded-lg border border-amber-200 bg-amber-50 overflow-hidden">
        <div class="px-4 py-3 border-b border-amber-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 class="font-semibold text-amber-950">CCO Change Requests</h2>
            <p class="text-xs text-amber-800 mt-1">Revise these requests and resubmit them for CCO approval.</p>
          </div>
          <span class="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">
            {{ changeRequestedRequests.length }} pending revision{{ changeRequestedRequests.length === 1 ? '' : 's' }}
          </span>
        </div>
        <div class="divide-y divide-amber-100">
          <div *ngFor="let request of changeRequestedRequests" class="p-4 grid gap-3 lg:grid-cols-[1fr_auto]">
            <div>
              <div class="font-medium text-slate-900">{{ request.clientName || request.clientId }}</div>
              <div class="mt-1 text-sm text-slate-700">{{ request.packageCode }}</div>
              <div class="mt-2 flex flex-wrap gap-1">
                <span
                  *ngFor="let module of request.requestedModules"
                  class="rounded-full bg-white px-2 py-0.5 text-xs text-slate-700 border border-amber-100">
                  {{ moduleLabel(module) }}
                </span>
              </div>
              <p class="mt-2 text-sm text-amber-900">
                <span class="font-medium">CCO note:</span> {{ request.reviewNote || 'No note provided' }}
              </p>
            </div>
            <div class="flex items-center justify-end">
              <button
                type="button"
                class="rounded-md bg-amber-700 px-4 py-2 text-sm font-medium text-white hover:bg-amber-800"
                (click)="reviseRequest(request)">
                Revise request
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <div class="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 class="font-semibold text-slate-900">Recent Requests</h2>
            <p class="mt-1 text-xs text-slate-500">
              Showing {{ filteredRequests.length }} of {{ historyRequests.length }} request{{ historyRequests.length === 1 ? '' : 's' }}
            </p>
          </div>
          <div class="flex flex-wrap items-center gap-3">
            <label>
              <span class="sr-only">Filter service history by client</span>
              <select
                class="rounded-md border border-slate-300 px-3 py-2 text-sm"
                name="historyClientId"
                [(ngModel)]="historyClientId"
                (ngModelChange)="loadHistory()">
                <option value="">All clients</option>
                <option *ngFor="let c of clients" [value]="c.id">{{ c.clientName }}</option>
              </select>
            </label>
            <label>
              <span class="sr-only">Filter service requests by status</span>
              <select
                class="rounded-md border border-slate-300 px-3 py-2 text-sm"
                name="requestStatusFilter"
                [(ngModel)]="requestStatusFilter"
                (ngModelChange)="loadHistory()">
                <option value="">All statuses</option>
                <option value="PENDING_CCO">Pending CCO</option>
                <option value="APPROVED">Approved</option>
                <option value="REJECTED">Rejected</option>
                <option value="CHANGES_REQUESTED">Changes requested</option>
              </select>
            </label>
            <label class="min-w-[260px]">
              <span class="sr-only">Search service requests</span>
              <input
                class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                name="searchTerm"
                [(ngModel)]="searchTerm"
                placeholder="Search client, package, service, or note">
            </label>
            <button class="text-sm text-blue-700" (click)="load()">Refresh</button>
          </div>
        </div>
        <table class="w-full text-sm">
          <thead class="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th class="px-4 py-3">Client</th>
              <th class="px-4 py-3">Package</th>
              <th class="px-4 py-3">Status</th>
              <th class="px-4 py-3">Notes</th>
              <th class="px-4 py-3">Requested</th>
              <th class="px-4 py-3">Reviewed</th>
              <th class="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let r of filteredRequests" class="border-t border-slate-100">
              <td class="px-4 py-3">{{ r.clientName || r.clientId }}</td>
              <td class="px-4 py-3">{{ r.packageCode }}</td>
              <td class="px-4 py-3">
                <span class="rounded-full px-2 py-0.5 text-xs font-medium" [ngClass]="statusBadgeClass(r.status)">
                  {{ statusLabel(r.status) }}
                </span>
              </td>
              <td class="px-4 py-3 max-w-xs">
                <div class="space-y-1" *ngIf="r.requestNote || r.reviewNote; else noRequestNotes">
                  <p *ngIf="r.requestNote" class="text-xs text-slate-600">
                    <span class="font-medium text-slate-800">Admin:</span> {{ r.requestNote }}
                  </p>
                  <p *ngIf="r.reviewNote" class="text-xs text-amber-800">
                    <span class="font-medium">CCO:</span> {{ r.reviewNote }}
                  </p>
                </div>
                <ng-template #noRequestNotes>-</ng-template>
              </td>
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
            <tr *ngIf="!loading && filteredRequests.length === 0">
              <td class="px-4 py-8 text-center text-slate-500" colspan="7">No service package requests yet.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <div class="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 class="font-semibold text-slate-900">Audit Trail</h2>
            <p class="mt-1 text-xs text-slate-500">
              Showing {{ filteredAuditLogs.length }} of {{ auditLogs.length }} entr{{ auditLogs.length === 1 ? 'y' : 'ies' }}
            </p>
          </div>
          <button class="text-sm text-blue-700" (click)="load()">Refresh</button>
        </div>
        <table class="w-full text-sm">
          <thead class="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th class="px-4 py-3">Client</th>
              <th class="px-4 py-3">Action</th>
              <th class="px-4 py-3">Package</th>
              <th class="px-4 py-3">Services</th>
              <th class="px-4 py-3">Actor</th>
              <th class="px-4 py-3">Note</th>
              <th class="px-4 py-3">At</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let entry of filteredAuditLogs" class="border-t border-slate-100 align-top">
              <td class="px-4 py-3">{{ entry.clientName || entry.clientId }}</td>
              <td class="px-4 py-3">
                <span class="rounded-full px-2 py-0.5 text-xs font-medium" [ngClass]="auditActionBadgeClass(entry.action)">
                  {{ auditActionLabel(entry.action) }}
                </span>
              </td>
              <td class="px-4 py-3">{{ entry.packageCode || '-' }}</td>
              <td class="px-4 py-3">
                <div class="flex flex-wrap gap-1" *ngIf="entry.modules.length; else noModules">
                  <span
                    *ngFor="let module of entry.modules"
                    class="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                    {{ moduleLabel(module) }}
                  </span>
                </div>
                <ng-template #noModules>-</ng-template>
              </td>
              <td class="px-4 py-3">{{ entry.actorName || entry.actorUserId || '-' }}</td>
              <td class="px-4 py-3">{{ entry.note || '-' }}</td>
              <td class="px-4 py-3">{{ entry.createdAt | date:'dd MMM, HH:mm' }}</td>
            </tr>
            <tr *ngIf="!loading && filteredAuditLogs.length === 0">
              <td class="px-4 py-8 text-center text-slate-500" colspan="7">No service package audit entries yet.</td>
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
  historyRequests: ServiceChangeRequest[] = [];
  auditLogs: ServiceAuditLogEntry[] = [];
  loading = false;
  loadingClientStatus = false;
  saving = false;
  message = '';
  error = false;
  searchTerm = '';
  historyClientId = '';
  requestStatusFilter = '';
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
      historyRequests: this.entitlements.listRequests(
        this.requestStatusFilter || undefined,
        this.historyClientId || undefined,
      ),
      auditLogs: this.entitlements.listAuditLogs(this.historyClientId || undefined),
    }).subscribe({
      next: ({ clients, packages, modules, requests, historyRequests, auditLogs }) => {
        this.clients = clients || [];
        this.packages = packages || [];
        this.moduleOptions = modules || [];
        this.requests = requests || [];
        this.historyRequests = historyRequests || [];
        this.auditLogs = auditLogs || [];
        this.loading = false;
      },
      error: () => {
        this.message = 'Failed to load service package data.';
        this.error = true;
        this.loading = false;
      },
    });
  }

  loadHistory(): void {
    this.loading = true;
    forkJoin({
      requests: this.entitlements.listRequests(
        this.requestStatusFilter || undefined,
        this.historyClientId || undefined,
      ),
      auditLogs: this.entitlements.listAuditLogs(this.historyClientId || undefined),
    }).subscribe({
      next: ({ requests, auditLogs }) => {
        this.historyRequests = requests || [];
        this.auditLogs = auditLogs || [];
        this.loading = false;
      },
      error: () => {
        this.message = 'Failed to load service package history.';
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

  moduleLabel(code: string): string {
    return this.moduleOptions.find((module) => module.code === code)?.label || code;
  }

  statusLabel(status: ServiceChangeRequest['status']): string {
    switch (status) {
      case 'PENDING_CCO':
        return 'Pending CCO';
      case 'CHANGES_REQUESTED':
        return 'Changes requested';
      case 'REJECTED':
        return 'Rejected';
      default:
        return 'Approved';
    }
  }

  statusBadgeClass(status: ServiceChangeRequest['status']): string {
    switch (status) {
      case 'PENDING_CCO':
        return 'bg-blue-50 text-blue-700';
      case 'CHANGES_REQUESTED':
        return 'bg-amber-100 text-amber-800';
      case 'REJECTED':
        return 'bg-red-50 text-red-700';
      default:
        return 'bg-green-50 text-green-700';
    }
  }

  auditActionLabel(action: string): string {
    switch (action) {
      case 'REQUESTED':
        return 'Requested';
      case 'APPROVED':
        return 'Approved';
      case 'CHANGES_REQUESTED':
        return 'Changes requested';
      case 'REJECTED':
        return 'Rejected';
      default:
        return action;
    }
  }

  auditActionBadgeClass(action: string): string {
    switch (action) {
      case 'REQUESTED':
        return 'bg-blue-50 text-blue-700';
      case 'APPROVED':
        return 'bg-green-50 text-green-700';
      case 'CHANGES_REQUESTED':
        return 'bg-amber-100 text-amber-800';
      case 'REJECTED':
        return 'bg-red-50 text-red-700';
      default:
        return 'bg-slate-100 text-slate-700';
    }
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

  get changeRequestedRequests(): ServiceChangeRequest[] {
    return this.requests.filter((request) => request.status === 'CHANGES_REQUESTED');
  }

  get filteredRequests(): ServiceChangeRequest[] {
    const query = this.normalizedSearchTerm;
    return this.historyRequests.filter((request) => {
      if (this.historyClientId && request.clientId !== this.historyClientId) {
        return false;
      }
      if (this.requestStatusFilter && request.status !== this.requestStatusFilter) {
        return false;
      }
      return !query || this.requestSearchText(request).includes(query);
    });
  }

  get filteredAuditLogs(): ServiceAuditLogEntry[] {
    const query = this.normalizedSearchTerm;
    return this.auditLogs.filter((entry) => {
      if (this.historyClientId && entry.clientId !== this.historyClientId) {
        return false;
      }
      if (!query) return true;
      return [
        entry.clientName,
        entry.clientId,
        entry.action,
        this.auditActionLabel(entry.action),
        entry.packageCode,
        entry.actorName,
        entry.actorUserId,
        entry.note,
        ...entry.modules.map((module) => this.moduleLabel(module)),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(query);
    });
  }

  private get normalizedSearchTerm(): string {
    return this.searchTerm.trim().toLowerCase();
  }

  private requestSearchText(request: ServiceChangeRequest): string {
    return [
      request.clientName,
      request.clientId,
      request.packageCode,
      request.status,
      this.statusLabel(request.status),
      request.requestNote,
      request.reviewNote,
      request.requestedByName,
      request.reviewedByName,
      ...request.currentModules.map((module) => this.moduleLabel(module)),
      ...request.requestedModules.map((module) => this.moduleLabel(module)),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
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
