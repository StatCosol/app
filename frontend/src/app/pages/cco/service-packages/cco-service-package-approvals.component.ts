import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import {
  ServiceAuditLogEntry,
  ServiceChangeRequest,
  ServiceEntitlementsApiService,
  ServiceModuleOption,
} from '../../../core/service-entitlements.service';
import { ClientOption } from '../../../shared/filters/models/filter.model';
import { FilterOptionsService } from '../../../shared/filters/services/filter-options.service';

@Component({
  selector: 'app-cco-service-package-approvals',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="p-6 space-y-6">
      <header>
        <h1 class="text-2xl font-semibold text-slate-900">Service Package Approvals</h1>
        <p class="text-sm text-slate-500 mt-1">Review client module changes requested by Admin.</p>
      </header>

      <div class="flex flex-wrap gap-3 items-end">
        <label>
          <span class="block text-xs font-medium text-slate-600">Client</span>
          <select
            class="mt-1 rounded-md border border-slate-300 px-3 py-2"
            name="historyClientId"
            [(ngModel)]="historyClientId"
            (ngModelChange)="load()">
            <option value="">All clients</option>
            @for (c of clients; track c) {
<option [value]="c.id">{{ c.name }}</option>
}
          </select>
        </label>
        <label>
          <span class="block text-xs font-medium text-slate-600">Status</span>
          <select class="mt-1 rounded-md border border-slate-300 px-3 py-2" name="status" [(ngModel)]="status" (change)="load()">
            <option value="">All</option>
            <option value="PENDING_CCO">Pending CCO</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
            <option value="CHANGES_REQUESTED">Changes requested</option>
          </select>
        </label>
        <label class="min-w-[260px] flex-1 max-w-md">
          <span class="block text-xs font-medium text-slate-600">Search</span>
          <input
            class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            name="searchTerm"
            [(ngModel)]="searchTerm"
            placeholder="Client, package, service, or note">
        </label>
        <button class="rounded-md border border-slate-300 px-4 py-2 text-sm" (click)="load()">Refresh</button>
      </div>

      @if (message) {
<p class="text-sm" [class.text-green-700]="!error" [class.text-red-700]="error">{{ message }}</p>
}

      <div class="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <div class="px-4 py-3 border-b border-slate-200">
          <h2 class="font-semibold text-slate-900">Requests</h2>
          <p class="mt-1 text-xs text-slate-500">
            Showing {{ filteredRequests.length }} of {{ requests.length }} request{{ requests.length === 1 ? '' : 's' }}
          </p>
        </div>
        <table class="w-full text-sm">
          <thead class="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th class="px-4 py-3">Client</th>
              <th class="px-4 py-3">Package</th>
              <th class="px-4 py-3">Current services</th>
              <th class="px-4 py-3">Requested services</th>
              <th class="px-4 py-3">Status</th>
              <th class="px-4 py-3">Notes</th>
              <th class="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            @for (r of filteredRequests; track r) {
<tr class="border-t border-slate-100 align-top">
              <td class="px-4 py-3">{{ r.clientName || r.clientId }}</td>
              <td class="px-4 py-3">{{ r.packageCode }}</td>
              <td class="px-4 py-3">
                @if (r.currentModules.length) {

                  @for (m of r.currentModules; track m) {
<span class="inline-block rounded bg-slate-100 px-2 py-1 mr-1 mb-1 text-xs">{{ moduleLabel(m) }}</span>
}
                
} @else {

                  <span class="text-xs text-slate-400">No approved services</span>
                
}
                
              </td>
              <td class="px-4 py-3">
                @for (m of r.requestedModules; track m) {
<span class="inline-block rounded bg-blue-50 text-blue-700 px-2 py-1 mr-1 mb-1 text-xs">{{ moduleLabel(m) }}</span>
}
              </td>
              <td class="px-4 py-3">
                <span class="rounded-full px-2 py-0.5 text-xs font-medium" [ngClass]="statusBadgeClass(r.status)">
                  {{ statusLabel(r.status) }}
                </span>
              </td>
              <td class="px-4 py-3 max-w-xs">
                @if (r.requestNote || r.reviewNote) {
<div class="space-y-1">
                  @if (r.requestNote) {
<p class="text-xs text-slate-600">
                    <span class="font-medium text-slate-800">Admin:</span> {{ r.requestNote }}
                  </p>
}
                  @if (r.reviewNote) {
<p class="text-xs text-amber-800">
                    <span class="font-medium">CCO:</span> {{ r.reviewNote }}
                  </p>
}
                </div>
} @else {
-
}
                
              </td>
              <td class="px-4 py-3 text-right">
                @if (r.status === 'PENDING_CCO') {

                  <button class="text-green-700 font-medium mr-3" [disabled]="actionId === r.id" (click)="submitReview(r, 'APPROVED')">Approve</button>
                  <button class="text-amber-700 font-medium mr-3" [disabled]="actionId === r.id" (click)="openReviewPanel(r, 'CHANGES_REQUESTED')">Request changes</button>
                  <button class="text-red-700 font-medium" [disabled]="actionId === r.id" (click)="openReviewPanel(r, 'REJECTED')">Reject</button>
                
} @else {
{{ r.reviewedAt ? (r.reviewedAt | date:'dd MMM, HH:mm') : '-' }}
}
                
              </td>
            </tr>
}
            @if (!loading && filteredRequests.length === 0) {
<tr>
              <td class="px-4 py-8 text-center text-slate-500" colspan="7">No service package requests found.</td>
            </tr>
}
          </tbody>
        </table>
      </div>

      @if (reviewRow) {
<div class="rounded-lg border border-amber-200 bg-amber-50 p-4 shadow-sm">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 class="font-semibold text-slate-900">
              {{ reviewAction === 'REJECTED' ? 'Reject service package request' : 'Request service package changes' }}
            </h2>
            <p class="mt-1 text-sm text-slate-600">
              {{ reviewRow.clientName || reviewRow.clientId }} - {{ reviewRow.packageCode }}
            </p>
          </div>
          <button class="text-sm text-slate-600 hover:text-slate-900" type="button" (click)="closeReviewPanel()">Cancel</button>
        </div>
        <label class="mt-3 block">
          <span class="text-xs font-medium text-slate-700">Review note <span class="text-red-600">*</span></span>
          <textarea
            class="mt-1 w-full rounded-md border border-amber-300 bg-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-200"
            rows="3"
            name="reviewNote"
            [(ngModel)]="reviewNote"
            placeholder="Explain what Admin must change before this can be approved.">
          </textarea>
        </label>
        @if (reviewNoteError) {
<p class="mt-2 text-sm text-red-700">{{ reviewNoteError }}</p>
}
        <div class="mt-3 flex justify-end gap-2">
          <button class="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm" type="button" (click)="closeReviewPanel()">Cancel</button>
          <button
            class="rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            [class.bg-amber-700]="reviewAction === 'CHANGES_REQUESTED'"
            [class.bg-red-700]="reviewAction === 'REJECTED'"
            type="button"
            [disabled]="actionId === reviewRow.id"
            (click)="submitReview(reviewRow, reviewAction)">
            {{ reviewAction === 'REJECTED' ? 'Reject request' : 'Send change request' }}
          </button>
        </div>
      </div>
}

      <div class="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <div class="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 class="font-semibold text-slate-900">Recent Audit Trail</h2>
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
            @for (entry of filteredAuditLogs; track entry) {
<tr class="border-t border-slate-100 align-top">
              <td class="px-4 py-3">{{ entry.clientName || entry.clientId }}</td>
              <td class="px-4 py-3">
                <span class="rounded-full px-2 py-0.5 text-xs font-medium" [ngClass]="auditActionBadgeClass(entry.action)">
                  {{ auditActionLabel(entry.action) }}
                </span>
              </td>
              <td class="px-4 py-3">{{ entry.packageCode || '-' }}</td>
              <td class="px-4 py-3">
                @if (entry.modules.length) {
<div class="flex flex-wrap gap-1">
                  @for (module of entry.modules; track module) {
<span
                   
                    class="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                    {{ moduleLabel(module) }}
                  </span>
}
                </div>
} @else {
-
}
                
              </td>
              <td class="px-4 py-3">{{ entry.actorName || entry.actorUserId || '-' }}</td>
              <td class="px-4 py-3">{{ entry.note || '-' }}</td>
              <td class="px-4 py-3">{{ entry.createdAt | date:'dd MMM, HH:mm' }}</td>
            </tr>
}
            @if (!loading && filteredAuditLogs.length === 0) {
<tr>
              <td class="px-4 py-8 text-center text-slate-500" colspan="7">No service package audit entries yet.</td>
            </tr>
}
          </tbody>
        </table>
      </div>
    </section>
  `,
})
export class CcoServicePackageApprovalsComponent implements OnInit {
  clients: ClientOption[] = [];
  requests: ServiceChangeRequest[] = [];
  auditLogs: ServiceAuditLogEntry[] = [];
  loading = false;
  status = 'PENDING_CCO';
  historyClientId = '';
  searchTerm = '';
  actionId: string | null = null;
  reviewRow: ServiceChangeRequest | null = null;
  reviewAction: 'REJECTED' | 'CHANGES_REQUESTED' = 'CHANGES_REQUESTED';
  reviewNote = '';
  reviewNoteError = '';
  message = '';
  error = false;
  moduleOptions: ServiceModuleOption[] = [];

  constructor(
    private readonly filterOptions: FilterOptionsService,
    private readonly entitlements: ServiceEntitlementsApiService,
  ) {}

  ngOnInit(): void {
    this.load();
  }

  moduleLabel(code: string): string {
    return this.moduleOptions.find((m) => m.code === code)?.label || code;
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

  get filteredRequests(): ServiceChangeRequest[] {
    const query = this.normalizedSearchTerm;
    if (!query) return this.requests;
    return this.requests.filter((request) =>
      this.requestSearchText(request).includes(query),
    );
  }

  get filteredAuditLogs(): ServiceAuditLogEntry[] {
    const query = this.normalizedSearchTerm;
    if (!query) return this.auditLogs;
    return this.auditLogs.filter((entry) =>
      [
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
        .includes(query),
    );
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

  load(): void {
    this.loading = true;
    forkJoin({
      clients: this.filterOptions.ceoClients(),
      modules: this.entitlements.listModules(),
      requests: this.entitlements.listRequests(
        this.status || undefined,
        this.historyClientId || undefined,
      ),
      auditLogs: this.entitlements.listAuditLogs(this.historyClientId || undefined),
    }).subscribe({
      next: ({ clients, modules, requests, auditLogs }) => {
        this.clients = clients || [];
        this.moduleOptions = modules || [];
        this.requests = requests || [];
        this.auditLogs = auditLogs || [];
        this.loading = false;
      },
      error: () => {
        this.message = 'Failed to load service package approvals.';
        this.error = true;
        this.loading = false;
      },
    });
  }

  openReviewPanel(
    row: ServiceChangeRequest,
    action: 'REJECTED' | 'CHANGES_REQUESTED',
  ): void {
    this.reviewRow = row;
    this.reviewAction = action;
    this.reviewNote = '';
    this.reviewNoteError = '';
    this.message = '';
    this.error = false;
  }

  closeReviewPanel(): void {
    this.reviewRow = null;
    this.reviewNote = '';
    this.reviewNoteError = '';
  }

  submitReview(
    row: ServiceChangeRequest,
    action: 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED',
  ): void {
    const note = action === 'APPROVED' ? '' : this.reviewNote.trim();
    if (action !== 'APPROVED' && !note) {
      this.reviewNoteError = 'Review note is required.';
      return;
    }
    this.actionId = row.id;
    this.message = '';
    this.error = false;
    this.entitlements.reviewRequest(row.id, { action, note: note || undefined }).subscribe({
      next: () => {
        this.message =
          action === 'APPROVED'
            ? 'Package approved.'
            : action === 'REJECTED'
              ? 'Request rejected.'
              : 'Changes requested.';
        this.actionId = null;
        this.closeReviewPanel();
        this.load();
      },
      error: (err) => {
        this.message = err?.error?.message || 'Review failed.';
        this.error = true;
        this.actionId = null;
      },
    });
  }
}
