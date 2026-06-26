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

      <div class="flex gap-3 items-end">
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
        <button class="rounded-md border border-slate-300 px-4 py-2 text-sm" (click)="load()">Refresh</button>
      </div>

      <p *ngIf="message" class="text-sm" [class.text-green-700]="!error" [class.text-red-700]="error">{{ message }}</p>

      <div class="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <table class="w-full text-sm">
          <thead class="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th class="px-4 py-3">Client</th>
              <th class="px-4 py-3">Package</th>
              <th class="px-4 py-3">Current services</th>
              <th class="px-4 py-3">Requested services</th>
              <th class="px-4 py-3">Status</th>
              <th class="px-4 py-3">Note</th>
              <th class="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let r of requests" class="border-t border-slate-100 align-top">
              <td class="px-4 py-3">{{ r.clientName || r.clientId }}</td>
              <td class="px-4 py-3">{{ r.packageCode }}</td>
              <td class="px-4 py-3">
                <ng-container *ngIf="r.currentModules.length; else noCurrentModules">
                  <span class="inline-block rounded bg-slate-100 px-2 py-1 mr-1 mb-1 text-xs" *ngFor="let m of r.currentModules">{{ moduleLabel(m) }}</span>
                </ng-container>
                <ng-template #noCurrentModules>
                  <span class="text-xs text-slate-400">No approved services</span>
                </ng-template>
              </td>
              <td class="px-4 py-3">
                <span class="inline-block rounded bg-blue-50 text-blue-700 px-2 py-1 mr-1 mb-1 text-xs" *ngFor="let m of r.requestedModules">{{ moduleLabel(m) }}</span>
              </td>
              <td class="px-4 py-3">{{ r.status }}</td>
              <td class="px-4 py-3">{{ r.requestNote || '-' }}</td>
              <td class="px-4 py-3 text-right">
                <ng-container *ngIf="r.status === 'PENDING_CCO'; else reviewed">
                  <button class="text-green-700 font-medium mr-3" [disabled]="actionId === r.id" (click)="review(r, 'APPROVED')">Approve</button>
                  <button class="text-amber-700 font-medium mr-3" [disabled]="actionId === r.id" (click)="review(r, 'CHANGES_REQUESTED')">Request changes</button>
                  <button class="text-red-700 font-medium" [disabled]="actionId === r.id" (click)="review(r, 'REJECTED')">Reject</button>
                </ng-container>
                <ng-template #reviewed>{{ r.reviewedAt ? (r.reviewedAt | date:'dd MMM, HH:mm') : '-' }}</ng-template>
              </td>
            </tr>
            <tr *ngIf="!loading && requests.length === 0">
              <td class="px-4 py-8 text-center text-slate-500" colspan="7">No service package requests found.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <div class="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <h2 class="font-semibold text-slate-900">Recent Audit Trail</h2>
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
            <tr *ngFor="let entry of auditLogs" class="border-t border-slate-100 align-top">
              <td class="px-4 py-3">{{ entry.clientName || entry.clientId }}</td>
              <td class="px-4 py-3">{{ entry.action }}</td>
              <td class="px-4 py-3">{{ entry.packageCode || '-' }}</td>
              <td class="px-4 py-3">
                <div class="flex flex-wrap gap-1" *ngIf="entry.modules.length; else noAuditModules">
                  <span
                    *ngFor="let module of entry.modules"
                    class="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                    {{ moduleLabel(module) }}
                  </span>
                </div>
                <ng-template #noAuditModules>-</ng-template>
              </td>
              <td class="px-4 py-3">{{ entry.actorName || entry.actorUserId || '-' }}</td>
              <td class="px-4 py-3">{{ entry.note || '-' }}</td>
              <td class="px-4 py-3">{{ entry.createdAt | date:'dd MMM, HH:mm' }}</td>
            </tr>
            <tr *ngIf="!loading && auditLogs.length === 0">
              <td class="px-4 py-8 text-center text-slate-500" colspan="7">No service package audit entries yet.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  `,
})
export class CcoServicePackageApprovalsComponent implements OnInit {
  requests: ServiceChangeRequest[] = [];
  auditLogs: ServiceAuditLogEntry[] = [];
  loading = false;
  status = 'PENDING_CCO';
  actionId: string | null = null;
  message = '';
  error = false;
  moduleOptions: ServiceModuleOption[] = [];

  constructor(private readonly entitlements: ServiceEntitlementsApiService) {}

  ngOnInit(): void {
    this.load();
  }

  moduleLabel(code: string): string {
    return this.moduleOptions.find((m) => m.code === code)?.label || code;
  }

  load(): void {
    this.loading = true;
    forkJoin({
      modules: this.entitlements.listModules(),
      requests: this.entitlements.listRequests(this.status || undefined),
      auditLogs: this.entitlements.listAuditLogs(),
    }).subscribe({
      next: ({ modules, requests, auditLogs }) => {
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

  review(
    row: ServiceChangeRequest,
    action: 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED',
  ): void {
    const note =
      action === 'APPROVED'
        ? ''
        : window.prompt(
            action === 'REJECTED' ? 'Rejection note' : 'Change request note',
          ) || '';
    if (action !== 'APPROVED' && !note.trim()) return;
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
