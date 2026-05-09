import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { PfTeamApiService, HdTicket } from '../pf-team-api.service';

@Component({
  selector: 'app-pf-team-tickets',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  template: `
    <div class="space-y-5">
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 class="text-xl font-bold text-gray-900">Helpdesk Tickets</h1>
          <p class="text-sm text-gray-500">{{ filtered.length }} ticket{{ filtered.length === 1 ? '' : 's' }}</p>
        </div>
      </div>

      <!-- Filters -->
      <div class="flex flex-wrap items-center gap-3">
        <select id="ptt-filter-client" name="filterClient" [(ngModel)]="filterClient" (ngModelChange)="applyFilter()"
                class="text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500">
          <option value="">All Clients</option>
          <option *ngFor="let c of clientOptions" [value]="c.id">{{ c.name }}</option>
        </select>

        <select id="ptt-filter-status" name="filterStatus" [(ngModel)]="filterStatus" (ngModelChange)="applyFilter()"
                class="text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500">
          <option value="">All Statuses</option>
          <option value="OPEN">Open</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="AWAITING_CLIENT">Awaiting Client</option>
          <option value="RESOLVED">Resolved</option>
          <option value="CLOSED">Closed</option>
        </select>

        <select id="ptt-filter-category" name="filterCategory" [(ngModel)]="filterCategory" (ngModelChange)="applyFilter()"
                class="text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500">
          <option value="">All Categories</option>
          <option value="PF">PF</option>
          <option value="ESI">ESI</option>
          <option value="PAYSLIP">Payslip</option>
        </select>

        <select id="ptt-filter-priority" name="filterPriority" [(ngModel)]="filterPriority" (ngModelChange)="applyFilter()"
                class="text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500">
          <option value="">All Priorities</option>
          <option value="CRITICAL">Critical</option>
          <option value="HIGH">High</option>
          <option value="NORMAL">Normal</option>
          <option value="LOW">Low</option>
        </select>
      </div>

      <!-- Table -->
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
              <tr *ngFor="let t of filtered"
                  [routerLink]="['/pf-team/tickets', t.id]"
                  class="hover:bg-indigo-50/40 cursor-pointer transition-colors">
                <td class="px-4 py-3 font-medium text-indigo-700 whitespace-nowrap">{{ t.client?.clientName || '—' }}</td>
                <td class="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">
                  {{ t.category }}<span *ngIf="t.subCategory" class="text-gray-400"> / {{ t.subCategory }}</span>
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
              <tr *ngIf="filtered.length === 0">
                <td colspan="8" class="px-4 py-12 text-center text-gray-400">No tickets found</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `,
})
export class PfTeamTicketsComponent implements OnInit {
  all: HdTicket[] = [];
  filtered: HdTicket[] = [];
  clientOptions: { id: string; name: string }[] = [];
  filterClient = '';
  filterStatus = '';
  filterCategory = '';
  filterPriority = '';

  constructor(private api: PfTeamApiService, private route: ActivatedRoute) {}

  ngOnInit(): void {
    // pick up ?clientId= from dashboard link
    const qp = this.route.snapshot.queryParamMap;
    if (qp.has('clientId')) this.filterClient = qp.get('clientId')!;

    this.api.listTickets().subscribe({
      next: (tickets) => {
        this.all = tickets;
        this.buildClientOptions(tickets);
        this.applyFilter();
      },
      error: () => {},
    });
  }

  private buildClientOptions(tickets: HdTicket[]): void {
    const map = new Map<string, string>();
    for (const t of tickets) {
      if (t.clientId && !map.has(t.clientId)) {
        map.set(t.clientId, t.client?.clientName || t.clientId.substring(0, 8));
      }
    }
    this.clientOptions = [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  applyFilter(): void {
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
      NORMAL: 'bg-blue-100 text-blue-700',
      LOW: 'bg-gray-100 text-gray-600',
    }[p] || 'bg-gray-100 text-gray-600';
  }

  statusClass(s: string): string {
    return {
      OPEN: 'bg-amber-100 text-amber-700',
      IN_PROGRESS: 'bg-blue-100 text-blue-700',
      AWAITING_CLIENT: 'bg-purple-100 text-purple-700',
      RESOLVED: 'bg-green-100 text-green-700',
      CLOSED: 'bg-gray-100 text-gray-600',
    }[s] || 'bg-gray-100 text-gray-600';
  }
}
