import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { PfTeamApiService, HdTicket } from '../pf-team-api.service';
import { Subscription } from 'rxjs';
import { IconComponent } from '../../../shared/ui/icon/icon.component';

@Component({
  selector: 'app-pf-team-tickets',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, IconComponent],
  template: `
    <div class="space-y-5">
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 class="text-xl font-bold text-gray-900">Helpdesk Tickets</h1>
          @if (!loading && !loadError) {
            <p class="text-sm text-gray-500">{{ filtered.length }} ticket{{ filtered.length === 1 ? '' : 's' }}</p>
          }
        </div>
      </div>

      <!-- Filters -->
      <div class="flex flex-wrap items-center gap-3">
        <select id="ptt-filter-client" name="filterClient" [(ngModel)]="filterClient" (ngModelChange)="applyFilter()"
                class="text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-brand-500 focus:border-brand-500">
          <option value="">All Clients</option>
          @for (c of clientOptions; track c) {
<option [value]="c.id">{{ c.name }}</option>
}
        </select>

        <select id="ptt-filter-status" name="filterStatus" [(ngModel)]="filterStatus" (ngModelChange)="applyFilter()"
                class="text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-brand-500 focus:border-brand-500">
          <option value="">All Statuses</option>
          <option value="OPEN">Open</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="AWAITING_CLIENT">Awaiting Client</option>
          <option value="RESOLVED">Resolved</option>
          <option value="CLOSED">Closed</option>
        </select>

        <select id="ptt-filter-category" name="filterCategory" [(ngModel)]="filterCategory" (ngModelChange)="applyFilter()"
                class="text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-brand-500 focus:border-brand-500">
          <option value="">All Categories</option>
          <option value="PF">PF</option>
          <option value="ESI">ESI</option>
          <option value="PAYSLIP">Payslip</option>
        </select>

        <select id="ptt-filter-priority" name="filterPriority" [(ngModel)]="filterPriority" (ngModelChange)="applyFilter()"
                class="text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-brand-500 focus:border-brand-500">
          <option value="">All Priorities</option>
          <option value="CRITICAL">Critical</option>
          <option value="HIGH">High</option>
          <option value="NORMAL">Normal</option>
          <option value="LOW">Low</option>
        </select>
      </div>

      <!-- Table -->
      @if (loading) { <p role="status" class="text-sm text-gray-500">Loading tickets...</p> }
      @if (loadError) {
        <div role="alert" class="text-sm text-red-700">{{ loadError }}
          <button type="button" (click)="loadTickets()" class="compact-action underline ml-2" title="Retry tickets" aria-label="Retry tickets" data-action-label="Retry tickets" data-action-icon="refresh"><ui-icon name="refresh" [size]="20" /></button>
        </div>
      }
      <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200 text-sm">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Client</th>
                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Category</th>
                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Description</th>
                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Employee</th>
                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Priority</th>
                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">SLA Due</th>
                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Created</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              @for (t of pageTickets; track t.id) {
<tr
                  [routerLink]="['/pf-team/tickets', t.id]"
                  class="hover:bg-brand-50/40 cursor-pointer transition-colors">
                <td class="px-4 py-3 font-medium text-brand-700 whitespace-nowrap">{{ t.client?.clientName || '—' }}</td>
                <td class="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">
                  {{ t.category }}@if (t.subCategory) {
<span class="text-gray-400"> / {{ t.subCategory }}</span>
}
                </td>
                <td class="px-4 py-3 text-gray-700 max-w-xs truncate">{{ t.description }}</td>
                <td class="px-4 py-3 text-gray-600 whitespace-nowrap">{{ t.employeeRef || '—' }}</td>
                <td class="px-4 py-3">
                  <span class="text-xs px-2 py-0.5 rounded-full font-medium" [class]="priorityClass(t.priority)">{{ t.priority }}</span>
                </td>
                <td class="px-4 py-3">
                  <span class="text-xs px-2 py-0.5 rounded-full font-medium" [class]="statusClass(t.status)">{{ t.status.replace('_', ' ') }}</span>
                </td>
                <td class="px-4 py-3 whitespace-nowrap" [class.text-red-600]="isSlaBreach(t)">
                  {{ t.slaDueAt ? (t.slaDueAt | date:'dd MMM yyyy, HH:mm') : '—' }}
                </td>
                <td class="px-4 py-3 text-gray-500 whitespace-nowrap">{{ t.createdAt | date:'dd MMM yyyy' }}</td>
              </tr>
}
              @if (filtered.length === 0 && !loading && !loadError) {
<tr>
                <td colspan="8" class="px-4 py-12 text-center text-gray-400">No tickets found</td>
              </tr>
}
            </tbody>
          </table>
        </div>
        @if (totalPages > 1) {
          <nav aria-label="Ticket pages" class="flex flex-wrap items-center justify-between gap-3 p-3 border-t border-gray-200">
            <span class="text-sm">Page {{ currentPage }} of {{ totalPages }} ({{ filtered.length }} tickets)</span>
            <div class="flex gap-2">
              <button type="button" aria-label="Previous page" title="Previous page" (click)="goToPage(currentPage - 1)" [disabled]="currentPage === 1" class="p-2 disabled:opacity-40"><ui-icon name="chevron-right" class="rotate-180" /></button>
              <button type="button" aria-label="Next page" title="Next page" (click)="goToPage(currentPage + 1)" [disabled]="currentPage === totalPages" class="p-2 disabled:opacity-40"><ui-icon name="chevron-right" /></button>
            </div>
          </nav>
        }
      </div>
    </div>
  `,
})
export class PfTeamTicketsComponent implements OnInit, OnDestroy {
  all: HdTicket[] = [];
  filtered: HdTicket[] = [];
  clientOptions: { id: string; name: string }[] = [];
  filterClient = '';
  filterStatus = '';
  filterCategory = '';
  filterPriority = '';
  loading = false;
  loadError = '';
  currentPage = 1;
  readonly pageSize = 20;
  private request?: Subscription;
  get totalPages(): number { return Math.max(1, Math.ceil(this.filtered.length / this.pageSize)); }
  get pageTickets(): HdTicket[] { return this.filtered.slice((this.currentPage - 1) * this.pageSize, this.currentPage * this.pageSize); }
  goToPage(page: number): void { if (page >= 1 && page <= this.totalPages) this.currentPage = page; }

  constructor(private api: PfTeamApiService, private route: ActivatedRoute) {}

  ngOnInit(): void {
    // pick up ?clientId= from dashboard link
    const qp = this.route.snapshot.queryParamMap;
    if (qp.has('clientId')) this.filterClient = qp.get('clientId')!;

    this.loadTickets();
  }

  ngOnDestroy(): void { this.request?.unsubscribe(); }

  loadTickets(): void {
    this.request?.unsubscribe();
    this.loading = true;
    this.loadError = '';
    this.all = [];
    this.filtered = [];
    this.clientOptions = [];
    this.currentPage = 1;
    this.request = this.api.listTickets().subscribe({
      next: (tickets) => {
        this.loading = false;
        this.all = tickets;
        this.buildClientOptions(tickets);
        this.applyFilter();
      },
      error: () => { this.loading = false; this.loadError = 'Tickets could not be loaded.'; },
    });
  }

  private buildClientOptions(tickets: HdTicket[]): void {
    const map = new Map<string, string>();
    for (const t of tickets) {
      if (t.clientId && !map.has(t.clientId)) {
        map.set(t.clientId, t.client?.clientName || 'Client name unavailable');
      }
    }
    this.clientOptions = [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  applyFilter(): void {
    this.currentPage = 1;
    this.filtered = this.all.filter((t) => {
      if (this.filterClient && t.clientId !== this.filterClient) return false;
      if (this.filterStatus && t.status !== this.filterStatus) return false;
      if (this.filterCategory && t.category !== this.filterCategory) return false;
      if (this.filterPriority && t.priority !== this.filterPriority) return false;
      return true;
    });
  }

  isSlaBreach(t: HdTicket): boolean {
    return !!t.slaDueAt && new Date(t.slaDueAt).getTime() < Date.now() && !['RESOLVED', 'CLOSED'].includes(t.status);
  }

  priorityClass(p: string): string {
    return {
      CRITICAL: 'bg-red-100 text-red-700',
      HIGH: 'bg-orange-100 text-orange-700',
      NORMAL: 'bg-brand-100 text-brand-700',
      LOW: 'bg-gray-100 text-gray-600',
    }[p] || 'bg-gray-100 text-gray-600';
  }

  statusClass(s: string): string {
    return {
      OPEN: 'bg-amber-100 text-amber-700',
      IN_PROGRESS: 'bg-brand-100 text-brand-700',
      AWAITING_CLIENT: 'bg-purple-100 text-purple-700',
      RESOLVED: 'bg-green-100 text-green-700',
      CLOSED: 'bg-gray-100 text-gray-600',
    }[s] || 'bg-gray-100 text-gray-600';
  }
}
