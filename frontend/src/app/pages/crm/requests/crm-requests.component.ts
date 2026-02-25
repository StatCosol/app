import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Subject } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';
import {
  PageHeaderComponent,
  EmptyStateComponent,
  LoadingSpinnerComponent,
  StatusBadgeComponent,
  FormSelectComponent,
} from '../../../shared/ui';

type TicketTab = 'all' | 'open' | 'resolved';

@Component({
  standalone: true,
  selector: 'app-crm-requests',
  imports: [
    CommonModule,
    FormsModule,
    PageHeaderComponent,
    EmptyStateComponent,
    LoadingSpinnerComponent,
    StatusBadgeComponent,
    FormSelectComponent,
  ],
  template: `
    <ui-page-header
      title="Helpdesk"
      subtitle="View and respond to helpdesk tickets from your clients">
    </ui-page-header>

    <!-- KPI Strip -->
    <div class="kpi-strip">
      <div class="kpi-card">
        <span class="kpi-value">{{ allTickets.length }}</span>
        <span class="kpi-label">Total Tickets</span>
      </div>
      <div class="kpi-card kpi-open">
        <span class="kpi-value">{{ openCount }}</span>
        <span class="kpi-label">Open</span>
      </div>
      <div class="kpi-card kpi-progress">
        <span class="kpi-value">{{ inProgressCount }}</span>
        <span class="kpi-label">In Progress</span>
      </div>
      <div class="kpi-card kpi-resolved">
        <span class="kpi-value">{{ resolvedCount }}</span>
        <span class="kpi-label">Resolved</span>
      </div>
    </div>

    <!-- Tabs + Filters -->
    <div class="controls-bar">
      <div class="tab-bar">
        <button *ngFor="let tab of tabs" class="tab-btn" [class.active]="activeTab === tab.key"
                (click)="switchTab(tab.key)">
          {{ tab.label }}
          <span *ngIf="tab.count > 0" class="tab-count">{{ tab.count }}</span>
        </button>
      </div>
      <div class="filter-row">
        <div class="search-wrapper">
          <svg class="search-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
          </svg>
          <input type="text" [(ngModel)]="searchTerm" (ngModelChange)="applyFilters()"
                 placeholder="Search tickets..." class="search-input" />
        </div>
        <ui-form-select label="" [options]="categoryOptions" [(ngModel)]="filterCategory"
                        (ngModelChange)="applyFilters()"></ui-form-select>
        <ui-form-select label="" [options]="priorityOptions" [(ngModel)]="filterPriority"
                        (ngModelChange)="applyFilters()"></ui-form-select>
      </div>
    </div>

    <ui-loading-spinner *ngIf="loading" text="Loading tickets..."></ui-loading-spinner>

    <ui-empty-state
      *ngIf="!loading && filtered.length === 0"
      title="No tickets found"
      [description]="searchTerm || filterCategory || filterPriority ? 'Try adjusting your filters.' : 'Client helpdesk tickets will appear here.'"
      icon="clipboard-list">
    </ui-empty-state>

    <!-- Tickets Table -->
    <div *ngIf="!loading && filtered.length > 0" class="table-card">
      <table class="data-table">
        <thead>
          <tr>
            <th>Ticket #</th>
            <th>Client</th>
            <th>Subject</th>
            <th>Category</th>
            <th>Priority</th>
            <th>Status</th>
            <th>Created</th>
            <th class="text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr *ngFor="let t of filtered" (click)="selectTicket(t)" class="cursor-pointer">
            <td class="font-mono text-xs text-gray-500">{{ t.ticketNumber || t.id?.slice(0, 8) || '-' }}</td>
            <td class="font-medium">{{ t.clientName || t.companyName || '-' }}</td>
            <td>
              <div class="ticket-subject">{{ t.subject || t.title || '-' }}</div>
            </td>
            <td>
              <span class="category-badge">{{ t.category || t.type || '-' }}</span>
            </td>
            <td>
              <span class="priority-badge" [attr.data-priority]="(t.priority || 'MEDIUM').toLowerCase()">
                {{ t.priority || 'Medium' }}
              </span>
            </td>
            <td><ui-status-badge [status]="t.status || 'OPEN'"></ui-status-badge></td>
            <td class="text-sm text-gray-500">{{ t.createdAt | date:'mediumDate' }}</td>
            <td class="text-right">
              <button (click)="selectTicket(t); $event.stopPropagation()" class="btn-sm btn-outline">View</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Ticket Detail Panel -->
    <div *ngIf="selectedTicket" class="modal-overlay" (click)="selectedTicket = null">
      <div class="detail-panel" (click)="$event.stopPropagation()">
        <div class="detail-header">
          <div>
            <h3 class="detail-title">{{ selectedTicket.subject || selectedTicket.title }}</h3>
            <div class="detail-meta">
              <span>{{ selectedTicket.clientName || selectedTicket.companyName || '-' }}</span>
              <span>&middot;</span>
              <span>{{ selectedTicket.category || '-' }}</span>
              <span>&middot;</span>
              <ui-status-badge [status]="selectedTicket.status || 'OPEN'"></ui-status-badge>
            </div>
          </div>
          <button (click)="selectedTicket = null" class="close-btn">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div class="detail-body">
          <div class="detail-section">
            <h4 class="detail-section-title">Description</h4>
            <p class="text-sm text-gray-700">{{ selectedTicket.description || selectedTicket.message || 'No description provided.' }}</p>
          </div>

          <div *ngIf="selectedTicket.branchName" class="detail-section">
            <h4 class="detail-section-title">Branch</h4>
            <p class="text-sm text-gray-700">{{ selectedTicket.branchName }}</p>
          </div>

          <!-- Messages -->
          <div class="detail-section">
            <h4 class="detail-section-title">Messages</h4>
            <div *ngIf="loadingMessages" class="text-sm text-gray-400">Loading messages...</div>
            <div *ngIf="!loadingMessages && messages.length === 0" class="text-sm text-gray-400">No messages yet.</div>
            <div *ngFor="let msg of messages" class="message-bubble"
                 [class.message-crm]="msg.senderRole === 'CRM' || msg.isCrm">
              <div class="message-sender text-xs font-medium">{{ msg.senderName || msg.senderRole || 'User' }}</div>
              <div class="message-text">{{ msg.message || msg.body }}</div>
              <div class="message-time">{{ msg.createdAt | date:'short' }}</div>
            </div>
          </div>

          <!-- Reply -->
          <div class="reply-section">
            <textarea [(ngModel)]="replyText" rows="3" class="field-input" placeholder="Type your reply..."></textarea>
            <div class="reply-actions">
              <button (click)="sendReply()" class="btn-sm btn-primary" [disabled]="!replyText.trim() || sendingReply">
                {{ sendingReply ? 'Sending...' : 'Send Reply' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .kpi-strip { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 16px; }
    .kpi-card {
      background: white; border: 1px solid #e5e7eb; border-radius: 10px;
      padding: 14px 18px; text-align: center;
    }
    .kpi-value { display: block; font-size: 1.5rem; font-weight: 700; color: #111827; }
    .kpi-label { font-size: 12px; color: #6b7280; }
    .kpi-open .kpi-value { color: #2563eb; }
    .kpi-progress .kpi-value { color: #d97706; }
    .kpi-resolved .kpi-value { color: #059669; }

    .controls-bar { margin-bottom: 16px; }
    .tab-bar { display: flex; gap: 0; border-bottom: 2px solid #e5e7eb; margin-bottom: 12px; }
    .tab-btn {
      padding: 8px 16px; font-size: 13px; font-weight: 500; color: #6b7280;
      border: none; background: none; cursor: pointer; border-bottom: 2px solid transparent;
      margin-bottom: -2px; transition: all 0.2s;
    }
    .tab-btn:hover { color: #374151; }
    .tab-btn.active { color: #4f46e5; border-bottom-color: #4f46e5; }
    .tab-count {
      display: inline-flex; align-items: center; justify-content: center;
      min-width: 18px; height: 18px; padding: 0 5px; border-radius: 999px;
      font-size: 10px; font-weight: 700; background: #e5e7eb; color: #374151; margin-left: 4px;
    }
    .tab-btn.active .tab-count { background: #4f46e5; color: white; }

    .filter-row { display: flex; gap: 10px; align-items: center; }
    .search-wrapper { position: relative; flex: 1; }
    .search-icon { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); width: 18px; height: 18px; color: #9ca3af; }
    .search-input {
      width: 100%; padding: 8px 12px 8px 36px; border: 1px solid #d1d5db; border-radius: 8px;
      font-size: 14px; color: #111827; background: white;
    }
    .search-input:focus { outline: none; border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,0.1); }

    .table-card { background: white; border: 1px solid #e5e7eb; border-radius: 12px; overflow-x: auto; }
    .data-table { width: 100%; border-collapse: collapse; font-size: 14px; }
    .data-table th {
      text-align: left; padding: 10px 14px; font-weight: 600; color: #6b7280;
      font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 2px solid #e5e7eb;
    }
    .data-table td { padding: 12px 14px; border-bottom: 1px solid #f3f4f6; color: #111827; vertical-align: middle; }
    .data-table tbody tr:hover { background: #f9fafb; }
    .ticket-subject { max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }

    .category-badge {
      font-size: 11px; font-weight: 600; text-transform: uppercase;
      background: #f3f4f6; color: #374151; padding: 3px 8px; border-radius: 999px;
    }
    .priority-badge {
      font-size: 11px; font-weight: 600; text-transform: uppercase;
      padding: 3px 8px; border-radius: 999px;
    }
    .priority-badge[data-priority="high"], .priority-badge[data-priority="critical"] {
      background: #fef2f2; color: #dc2626;
    }
    .priority-badge[data-priority="medium"] { background: #fffbeb; color: #d97706; }
    .priority-badge[data-priority="low"] { background: #f0fdf4; color: #16a34a; }

    .btn-sm {
      padding: 5px 12px; border-radius: 6px; font-size: 12px; font-weight: 600;
      border: none; cursor: pointer; white-space: nowrap;
    }
    .btn-outline { background: white; border: 1px solid #d1d5db; color: #374151; }
    .btn-outline:hover { background: #f3f4f6; }
    .btn-primary { background: #4f46e5; color: white; }
    .btn-primary:hover { opacity: 0.9; }
    .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

    .modal-overlay {
      position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 50;
      display: flex; justify-content: flex-end;
    }
    .detail-panel {
      background: white; width: 520px; max-width: 90vw; height: 100vh;
      overflow-y: auto; box-shadow: -4px 0 20px rgba(0,0,0,0.1);
      display: flex; flex-direction: column;
    }
    .detail-header {
      display: flex; justify-content: space-between; align-items: flex-start;
      padding: 20px 24px; border-bottom: 1px solid #e5e7eb;
    }
    .detail-title { font-size: 1.1rem; font-weight: 700; color: #111827; margin: 0 0 4px; }
    .detail-meta { display: flex; align-items: center; gap: 6px; font-size: 13px; color: #6b7280; flex-wrap: wrap; }
    .close-btn { background: none; border: none; color: #9ca3af; cursor: pointer; padding: 4px; border-radius: 6px; }
    .close-btn:hover { background: #f3f4f6; color: #374151; }

    .detail-body { flex: 1; padding: 20px 24px; display: flex; flex-direction: column; gap: 20px; }
    .detail-section-title { font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 8px; }

    .message-bubble {
      background: #f3f4f6; border-radius: 10px; padding: 10px 14px; margin-bottom: 8px;
    }
    .message-crm { background: #eef2ff; }
    .message-text { font-size: 14px; color: #111827; margin: 4px 0; }
    .message-time { font-size: 11px; color: #9ca3af; }

    .reply-section { margin-top: auto; border-top: 1px solid #e5e7eb; padding-top: 16px; }
    .reply-actions { display: flex; justify-content: flex-end; margin-top: 8px; }
    .field-input {
      width: 100%; padding: 8px 10px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px;
    }
    .field-input:focus { outline: none; border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,0.1); }

    .cursor-pointer { cursor: pointer; }

    @media (max-width: 640px) {
      .kpi-strip { grid-template-columns: repeat(2, 1fr); }
      .filter-row { flex-direction: column; }
    }
  `],
})
export class CrmRequestsComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  allTickets: any[] = [];
  filtered: any[] = [];
  loading = true;

  activeTab: TicketTab = 'all';
  searchTerm = '';
  filterCategory = '';
  filterPriority = '';

  tabs: { key: TicketTab; label: string; count: number }[] = [
    { key: 'all', label: 'All Tickets', count: 0 },
    { key: 'open', label: 'Open / In Progress', count: 0 },
    { key: 'resolved', label: 'Resolved / Closed', count: 0 },
  ];

  categoryOptions = [
    { label: 'All Categories', value: '' },
    { label: 'Compliance', value: 'Compliance' },
    { label: 'Audit', value: 'Audit' },
    { label: 'Technical', value: 'Technical' },
    { label: 'Payroll', value: 'Payroll' },
    { label: 'General', value: 'General' },
  ];

  priorityOptions = [
    { label: 'All Priorities', value: '' },
    { label: 'Critical', value: 'CRITICAL' },
    { label: 'High', value: 'HIGH' },
    { label: 'Medium', value: 'MEDIUM' },
    { label: 'Low', value: 'LOW' },
  ];

  selectedTicket: any = null;
  messages: any[] = [];
  loadingMessages = false;
  replyText = '';
  sendingReply = false;

  get openCount(): number {
    return this.allTickets.filter(t => ['OPEN', 'IN_PROGRESS', 'PENDING'].includes(t.status)).length;
  }
  get inProgressCount(): number {
    return this.allTickets.filter(t => t.status === 'IN_PROGRESS').length;
  }
  get resolvedCount(): number {
    return this.allTickets.filter(t => ['RESOLVED', 'CLOSED'].includes(t.status)).length;
  }

  constructor(private http: HttpClient, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.loadTickets();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadTickets(): void {
    this.loading = true;
    this.http.get<any[]>('/api/v1/crm/helpdesk/tickets').pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.loading = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (data) => {
        this.loading = false;
        this.allTickets = Array.isArray(data) ? data : [];
        this.updateTabCounts();
        this.applyFilters();
      },
      error: () => { this.loading = false; this.allTickets = []; this.filtered = []; },
    });
  }

  private updateTabCounts(): void {
    this.tabs[0].count = this.allTickets.length;
    this.tabs[1].count = this.openCount;
    this.tabs[2].count = this.resolvedCount;
  }

  switchTab(tab: TicketTab): void {
    this.activeTab = tab;
    this.applyFilters();
  }

  applyFilters(): void {
    let result = [...this.allTickets];

    if (this.activeTab === 'open') {
      result = result.filter(t => ['OPEN', 'IN_PROGRESS', 'PENDING'].includes(t.status));
    } else if (this.activeTab === 'resolved') {
      result = result.filter(t => ['RESOLVED', 'CLOSED'].includes(t.status));
    }

    if (this.filterCategory) {
      result = result.filter(t => (t.category || t.type || '') === this.filterCategory);
    }

    if (this.filterPriority) {
      result = result.filter(t => (t.priority || 'MEDIUM').toUpperCase() === this.filterPriority);
    }

    if (this.searchTerm.trim()) {
      const term = this.searchTerm.toLowerCase();
      result = result.filter(t =>
        (t.subject || t.title || '').toLowerCase().includes(term) ||
        (t.clientName || t.companyName || '').toLowerCase().includes(term) ||
        (t.ticketNumber || '').toLowerCase().includes(term),
      );
    }

    this.filtered = result;
  }

  selectTicket(ticket: any): void {
    this.selectedTicket = ticket;
    this.messages = [];
    this.replyText = '';
    this.loadMessages(ticket.id);
  }

  private loadMessages(ticketId: string): void {
    this.loadingMessages = true;
    this.http.get<any[]>(`/api/v1/helpdesk/tickets/${ticketId}/messages`).pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.loadingMessages = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (msgs) => { this.loadingMessages = false; this.messages = msgs || []; },
      error: () => { this.loadingMessages = false; this.messages = []; },
    });
  }

  sendReply(): void {
    if (!this.replyText.trim() || !this.selectedTicket) return;
    this.sendingReply = true;
    this.http.post(`/api/v1/helpdesk/tickets/${this.selectedTicket.id}/messages`, { message: this.replyText.trim() })
      .pipe(takeUntil(this.destroy$), finalize(() => { this.sendingReply = false; this.cdr.detectChanges(); }))
      .subscribe({
        next: () => {
          this.sendingReply = false;
          this.replyText = '';
          this.loadMessages(this.selectedTicket.id);
        },
        error: () => { this.sendingReply = false; alert('Failed to send reply.'); },
      });
  }
}
