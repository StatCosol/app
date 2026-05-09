import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AdminHelpdeskApiService, HdTicket, HdStats } from './admin-helpdesk-api.service';

@Component({
  selector: 'app-admin-helpdesk',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  template: `
    <div class="space-y-6">
      <!-- Header -->
      <div>
        <h1 class="text-2xl font-bold text-gray-900">Helpdesk Management</h1>
        <p class="mt-1 text-sm text-gray-500">Monitor and manage all helpdesk tickets across clients</p>
      </div>

      <!-- Stats Cards -->
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
        <div class="bg-white rounded-xl border border-gray-200 p-4 text-center cursor-pointer hover:border-indigo-300 transition-colors"
             [class.ring-2]="!filterStatus" [class.ring-indigo-500]="!filterStatus"
             (click)="filterStatus = ''; reload()">
          <p class="text-2xl font-bold text-gray-900">{{ stats.total }}</p>
          <p class="text-xs text-gray-500 mt-1">Total</p>
        </div>
        <div class="bg-white rounded-xl border border-gray-200 p-4 text-center cursor-pointer hover:border-amber-300 transition-colors"
             [class.ring-2]="filterStatus === 'OPEN'" [class.ring-amber-500]="filterStatus === 'OPEN'"
             (click)="filterStatus = 'OPEN'; reload()">
          <p class="text-2xl font-bold text-amber-600">{{ stats.open }}</p>
          <p class="text-xs text-gray-500 mt-1">Open</p>
        </div>
        <div class="bg-white rounded-xl border border-gray-200 p-4 text-center cursor-pointer hover:border-blue-300 transition-colors"
             [class.ring-2]="filterStatus === 'IN_PROGRESS'" [class.ring-blue-500]="filterStatus === 'IN_PROGRESS'"
             (click)="filterStatus = 'IN_PROGRESS'; reload()">
          <p class="text-2xl font-bold text-blue-600">{{ stats.inProgress }}</p>
          <p class="text-xs text-gray-500 mt-1">In Progress</p>
        </div>
        <div class="bg-white rounded-xl border border-gray-200 p-4 text-center cursor-pointer hover:border-purple-300 transition-colors"
             [class.ring-2]="filterStatus === 'AWAITING_CLIENT'" [class.ring-purple-500]="filterStatus === 'AWAITING_CLIENT'"
             (click)="filterStatus = 'AWAITING_CLIENT'; reload()">
          <p class="text-2xl font-bold text-purple-600">{{ stats.awaitingClient }}</p>
          <p class="text-xs text-gray-500 mt-1">Awaiting</p>
        </div>
        <div class="bg-white rounded-xl border border-gray-200 p-4 text-center cursor-pointer hover:border-green-300 transition-colors"
             [class.ring-2]="filterStatus === 'RESOLVED'" [class.ring-green-500]="filterStatus === 'RESOLVED'"
             (click)="filterStatus = 'RESOLVED'; reload()">
          <p class="text-2xl font-bold text-green-600">{{ stats.resolved }}</p>
          <p class="text-xs text-gray-500 mt-1">Resolved</p>
        </div>
        <div class="bg-white rounded-xl border border-gray-200 p-4 text-center cursor-pointer hover:border-gray-400 transition-colors"
             [class.ring-2]="filterStatus === 'CLOSED'" [class.ring-gray-500]="filterStatus === 'CLOSED'"
             (click)="filterStatus = 'CLOSED'; reload()">
          <p class="text-2xl font-bold text-gray-500">{{ stats.closed }}</p>
          <p class="text-xs text-gray-500 mt-1">Closed</p>
        </div>
        <div class="bg-white rounded-xl border border-red-200 p-4 text-center">
          <p class="text-2xl font-bold text-red-600">{{ stats.slaBreached }}</p>
          <p class="text-xs text-gray-500 mt-1">SLA Breached</p>
        </div>
      </div>

      <!-- Filters & Search -->
      <div class="flex flex-wrap items-center gap-3">
        <div class="relative flex-1 min-w-[200px] max-w-md">
          <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
          <input autocomplete="off" id="ah-search-term" name="searchTerm" type="text" [(ngModel)]="searchTerm" (input)="onSearchChange()"
                 placeholder="Search tickets…"
                 class="w-full pl-10 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" />
        </div>

        <select id="ah-filter-category" name="filterCategory" [(ngModel)]="filterCategory" (ngModelChange)="reload()"
                class="text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500">
          <option value="">All Categories</option>
          <option *ngFor="let c of stats.categories" [value]="c.label">{{ c.label }} ({{ c.count }})</option>
        </select>

        <select id="ah-filter-priority" name="filterPriority" [(ngModel)]="filterPriority" (ngModelChange)="reload()"
                class="text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500">
          <option value="">All Priorities</option>
          <option value="CRITICAL">Critical</option>
          <option value="HIGH">High</option>
          <option value="NORMAL">Normal</option>
          <option value="LOW">Low</option>
        </select>

        <button *ngIf="hasActiveFilters" (click)="clearFilters()"
                class="text-sm text-gray-500 hover:text-gray-700 underline">
          Clear filters
        </button>
      </div>

      <!-- Ticket Table -->
      <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200 text-sm">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Client</th>
                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Category</th>
                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Description</th>
                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Created By</th>
                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Assigned To</th>
                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Priority</th>
                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">SLA Due</th>
                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Created</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              <tr *ngFor="let t of tickets"
                  [routerLink]="['/admin/helpdesk', t.id]"
                  class="hover:bg-indigo-50/40 cursor-pointer transition-colors">
                <td class="px-4 py-3 font-medium text-indigo-700 whitespace-nowrap">{{ t.client?.clientName || '—' }}</td>
                <td class="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">
                  {{ t.category }}<span *ngIf="t.subCategory" class="text-gray-400"> / {{ t.subCategory }}</span>
                </td>
                <td class="px-4 py-3 text-gray-700 max-w-xs truncate">{{ t.description }}</td>
                <td class="px-4 py-3 text-gray-600 whitespace-nowrap">{{ t.creatorName || '—' }}</td>
                <td class="px-4 py-3 text-gray-600 whitespace-nowrap">{{ t.assigneeName || 'Unassigned' }}</td>
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
              <tr *ngIf="tickets.length === 0 && !loading">
                <td colspan="9" class="px-4 py-12 text-center text-gray-400">No tickets found</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Loading -->
        <div *ngIf="loading" class="flex items-center justify-center py-8">
          <div class="w-6 h-6 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
        </div>

        <!-- Pagination -->
        <div *ngIf="totalTickets > pageSize" class="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
          <p class="text-sm text-gray-600">
            Showing {{ (currentPage - 1) * pageSize + 1 }}–{{ currentPage * pageSize > totalTickets ? totalTickets : currentPage * pageSize }}
            of {{ totalTickets }}
          </p>
          <div class="flex gap-1">
            <button (click)="goToPage(currentPage - 1)" [disabled]="currentPage <= 1"
                    class="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed">
              ← Prev
            </button>
            <button *ngFor="let p of pageNumbers" (click)="goToPage(p)"
                    class="px-3 py-1.5 text-sm border rounded-lg transition-colors"
                    [class]="p === currentPage ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-300 hover:bg-gray-100'">
              {{ p }}
            </button>
            <button (click)="goToPage(currentPage + 1)" [disabled]="currentPage >= totalPages"
                    class="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed">
              Next →
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class AdminHelpdeskComponent implements OnInit {
  stats: HdStats = { total: 0, open: 0, inProgress: 0, awaitingClient: 0, resolved: 0, closed: 0, slaBreached: 0, categories: [] };
  tickets: HdTicket[] = [];
  loading = false;

  // Filters
  searchTerm = '';
  filterStatus = '';
  filterCategory = '';
  filterPriority = '';

  // Pagination
  currentPage = 1;
  pageSize = 20;
  totalTickets = 0;
  totalPages = 1;
  pageNumbers: number[] = [];

  private searchTimeout: any;

  constructor(private api: AdminHelpdeskApiService) {}

  ngOnInit(): void {
    this.loadStats();
    this.loadTickets();
  }

  get hasActiveFilters(): boolean {
    return !!(this.filterStatus || this.filterCategory || this.filterPriority || this.searchTerm);
  }

  clearFilters(): void {
    this.filterStatus = '';
    this.filterCategory = '';
    this.filterPriority = '';
    this.searchTerm = '';
    this.currentPage = 1;
    this.loadTickets();
  }

  onSearchChange(): void {
    clearTimeout(this.searchTimeout);
    this.searchTimeout = setTimeout(() => {
      this.currentPage = 1;
      this.loadTickets();
    }, 400);
  }

  reload(): void {
    this.currentPage = 1;
    this.loadTickets();
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages) return;
    this.currentPage = page;
    this.loadTickets();
  }

  private loadStats(): void {
    this.api.getStats().subscribe({
      next: (s) => (this.stats = s),
      error: () => {},
    });
  }

  private loadTickets(): void {
    this.loading = true;
    this.api
      .listTickets({
        page: this.currentPage,
        limit: this.pageSize,
        status: this.filterStatus || undefined,
        category: this.filterCategory || undefined,
        priority: this.filterPriority || undefined,
        search: this.searchTerm || undefined,
      })
      .subscribe({
        next: (res) => {
          this.tickets = res.data;
          this.totalTickets = res.total;
          this.totalPages = Math.ceil(res.total / this.pageSize) || 1;
          this.buildPageNumbers();
          this.loading = false;
        },
        error: () => (this.loading = false),
      });
  }

  private buildPageNumbers(): void {
    const pages: number[] = [];
    const start = Math.max(1, this.currentPage - 2);
    const end = Math.min(this.totalPages, this.currentPage + 2);
    for (let i = start; i <= end; i++) pages.push(i);
    this.pageNumbers = pages;
  }

  isSlaBreach(t: HdTicket): boolean {
    return !!t.slaDueAt && new Date(t.slaDueAt).getTime() < Date.now() && !['RESOLVED', 'CLOSED'].includes(t.status);
  }

  priorityClass(p: string): string {
    return { CRITICAL: 'bg-red-100 text-red-700', HIGH: 'bg-orange-100 text-orange-700', NORMAL: 'bg-blue-100 text-blue-700', LOW: 'bg-gray-100 text-gray-600' }[p] || 'bg-gray-100 text-gray-600';
  }

  statusClass(s: string): string {
    return { OPEN: 'bg-amber-100 text-amber-700', IN_PROGRESS: 'bg-blue-100 text-blue-700', AWAITING_CLIENT: 'bg-purple-100 text-purple-700', RESOLVED: 'bg-green-100 text-green-700', CLOSED: 'bg-gray-100 text-gray-600' }[s] || 'bg-gray-100 text-gray-600';
  }
}
