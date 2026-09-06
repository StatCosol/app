import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { AdminHelpdeskApiService, HdTicket, HdMessage } from './admin-helpdesk-api.service';
import { AdminUsersApi, UserDto } from '../../../core/api/admin-users.api';
import { PageHeaderComponent } from '../../../shared/ui';

@Component({
  selector: 'app-admin-helpdesk-detail',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, PageHeaderComponent],
  template: `
    @if (ticket) {
<div class="space-y-6">
      <ui-page-header
        title="Ticket Detail"
        [breadcrumbs]="[{ label: 'Helpdesk', route: '/admin/helpdesk' }, { label: 'Ticket Detail' }]">
        <span class="text-xs px-2 py-0.5 rounded-full font-medium" [class]="statusClass(ticket.status)">{{ ticket.status.replace('_', ' ') }}</span>
      </ui-page-header>

      <!-- Ticket Info -->
      <div class="bg-white rounded-xl border border-gray-200 p-6">
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <div>
            <span class="text-xs text-gray-500 uppercase tracking-wider">Client</span>
            <p class="text-sm font-semibold text-indigo-700 mt-0.5">{{ ticket.client?.clientName || '—' }}</p>
          </div>
          <div>
            <span class="text-xs text-gray-500 uppercase tracking-wider">Category</span>
            <p class="text-sm font-semibold text-gray-900 mt-0.5">{{ ticket.category }}@if (ticket.subCategory) {
<span> / {{ ticket.subCategory }}</span>
}</p>
          </div>
          <div>
            <span class="text-xs text-gray-500 uppercase tracking-wider">Priority</span>
            <p class="mt-0.5"><span class="text-xs px-2 py-0.5 rounded-full font-medium" [class]="priorityClass(ticket.priority)">{{ ticket.priority }}</span></p>
          </div>
          <div>
            <span class="text-xs text-gray-500 uppercase tracking-wider">SLA Due</span>
            <p class="text-sm font-medium mt-0.5" [class.text-red-600]="isSlaBreach()">
              {{ ticket.slaDueAt ? (ticket.slaDueAt | date:'dd MMM yyyy, HH:mm') : '—' }}
            </p>
          </div>
        </div>

        <div class="mb-4">
          <span class="text-xs text-gray-500 uppercase tracking-wider">Description</span>
          <p class="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{{ ticket.description }}</p>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs text-gray-500">
          <div><span class="uppercase tracking-wider">Employee Ref</span><br><span class="text-sm text-gray-700">{{ ticket.employeeRef || '—' }}</span></div>
          <div><span class="uppercase tracking-wider">Created By</span><br><span class="text-sm text-gray-700">{{ ticket.creatorName || (ticket.createdByUserId ? ticket.createdByUserId.substring(0, 8) : '—') }}</span></div>
          <div><span class="uppercase tracking-wider">Created</span><br><span class="text-sm text-gray-700">{{ ticket.createdAt | date:'dd MMM yyyy, HH:mm' }}</span></div>
          <div><span class="uppercase tracking-wider">Ticket ID</span><br><span class="text-sm text-gray-700 font-mono">{{ ticket.id | slice:0:8 }}…</span></div>
        </div>
      </div>

      <!-- Status Update -->
      <div class="bg-white rounded-xl border border-gray-200 p-6">
        <h2 class="text-sm font-semibold text-gray-900 mb-3">Update Status</h2>
        <div class="flex flex-wrap items-center gap-2">
          @for (s of statuses; track s) {
<button
                  (click)="changeStatus(s)"
                  [disabled]="ticket.status === s || updatingStatus"
                  class="px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  [class]="ticket.status === s ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-300 text-gray-700 hover:bg-gray-50'">
            {{ s.replace('_', ' ') }}
          </button>
}
        </div>
      </div>

      <!-- Assignment -->
      <div class="bg-white rounded-xl border border-gray-200 p-6">
        <h2 class="text-sm font-semibold text-gray-900 mb-3">Assignment</h2>
        <div class="flex items-center gap-3">
          <div class="flex-1">
            <p class="text-sm text-gray-600">
              <span class="font-medium">Currently assigned to:</span>
              <span class="ml-1" [class.text-amber-600]="!ticket.assignedToUserId">
                {{ ticket.assigneeName || (ticket.assignedToUserId ? ticket.assignedToUserId.substring(0, 8) + '…' : 'Unassigned') }}
              </span>
            </p>
          </div>
          <div class="flex items-center gap-2">
            <select id="ahd-assign-user-id" name="assignUserId" [(ngModel)]="assignUserId"
                   class="text-sm border border-gray-300 rounded-lg px-3 py-2 w-72 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500">
              <option value="">Select a user…</option>
              @for (u of assignableUsers; track u) {
<option [value]="u.id">{{ u.name }} ({{ u.roleCode }}{{ u.email ? ' – ' + u.email : '' }})</option>
}
            </select>
            <button (click)="assignTicket()"
                    [disabled]="!assignUserId.trim() || assigning"
                    class="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              Assign
            </button>
            @if (ticket.assignedToUserId) {
<button (click)="unassignTicket()"
                    [disabled]="assigning"
                    class="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              Unassign
            </button>
}
          </div>
        </div>
      </div>

      <!-- Messages -->
      <div class="bg-white rounded-xl border border-gray-200 p-6">
        <h2 class="text-sm font-semibold text-gray-900 mb-4">Messages ({{ messages.length }})</h2>

        @if (messages.length === 0) {
<div class="text-sm text-gray-400 text-center py-4">No messages yet</div>
}

        <div class="space-y-3 max-h-[500px] overflow-y-auto mb-4">
          @for (m of messages; track m) {
<div class="p-3 rounded-lg bg-gray-50 border border-gray-100">
            <div class="flex items-center justify-between mb-1">
              <span class="text-xs font-semibold text-indigo-700">{{ m.senderName || 'Unknown' }}</span>
              <span class="text-xs text-gray-400">{{ m.createdAt | date:'dd MMM yyyy, HH:mm' }}</span>
            </div>
            <p class="text-sm text-gray-800 whitespace-pre-wrap">{{ m.message }}</p>
          </div>
}
        </div>

        <!-- Post Message -->
        <div class="flex gap-2">
          <input autocomplete="off" id="ahd-new-message" name="newMessage"
            [(ngModel)]="newMessage"
            (keydown.enter)="postMessage()"
            placeholder="Type a reply…"
            class="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
          <button
            (click)="postMessage()"
            [disabled]="!newMessage.trim() || sendingMessage"
            class="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
            Send
          </button>
        </div>
      </div>
    </div>
}

    <!-- Loading -->
    @if (!ticket && !error) {
<div class="flex items-center justify-center py-20">
      <div class="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
    </div>
}

    <!-- Error -->
    @if (error) {
<div class="text-center py-20">
      <p class="text-red-500 text-sm">{{ error }}</p>
      <a routerLink="/admin/helpdesk" class="text-sm text-indigo-600 hover:underline mt-2 inline-block">← Back to tickets</a>
    </div>
}
  `,
})
export class AdminHelpdeskDetailComponent implements OnInit, OnDestroy {
  ticket: HdTicket | null = null;
  messages: HdMessage[] = [];
  newMessage = '';
  sendingMessage = false;
  updatingStatus = false;
  assigning = false;
  assignUserId = '';
  users: UserDto[] = [];
  assignableUsers: UserDto[] = [];
  // External roles must NOT be able to receive helpdesk ticket assignments
  // External / self-service roles must NOT be able to receive helpdesk ticket assignments
  private readonly externalRoles = new Set(['CLIENT', 'CONTRACTOR', 'EMPLOYEE', 'ESS']);
  error = '';
  statuses = ['OPEN', 'IN_PROGRESS', 'AWAITING_CLIENT', 'RESOLVED', 'CLOSED'];

  constructor(
    private route: ActivatedRoute,
    private api: AdminHelpdeskApiService,
    private usersApi: AdminUsersApi,
    private cdr: ChangeDetectorRef,
  ) {}

  private paramSub?: Subscription;

  ngOnInit(): void {
    // React to paramMap changes (in case the component is reused across detail routes)
    this.paramSub = this.route.paramMap.subscribe((pm) => {
      const id = pm.get('id');
      if (!id) {
        this.error = 'Ticket id missing';
        this.cdr.detectChanges();
        return;
      }
      this.error = '';
      this.ticket = null;
      this.api.getTicket(id).subscribe({
        next: (t) => {
          this.ticket = t;
          this.loadMessages();
          this.cdr.markForCheck();
          this.cdr.detectChanges();
        },
        error: (err) => {
          if (err?.status === 0) {
            this.error = 'Network error — unable to reach server. Please retry.';
          } else if (err?.status === 401 || err?.status === 403) {
            this.error = 'Session expired or access denied. Please refresh and sign in again.';
          } else if (err?.status === 404) {
            this.error = 'Ticket not found';
          } else {
            this.error = `Failed to load ticket${err?.error?.message ? ': ' + err.error.message : '.'}`;
          }
          this.cdr.markForCheck();
          this.cdr.detectChanges();
        },
      });
    });
    this.usersApi.listUsersSimple().subscribe({
      next: (list) => {
        this.users = list || [];
        this.assignableUsers = this.users.filter(u => !this.externalRoles.has((u.roleCode || '').toUpperCase()));
        this.cdr.markForCheck();
        this.cdr.detectChanges();
      },
      error: () => {},
    });
  }

  ngOnDestroy(): void {
    this.paramSub?.unsubscribe();
  }

  private loadMessages(): void {
    if (!this.ticket) return;
    this.api.getMessages(this.ticket.id).subscribe({
      next: (msgs) => {
        this.messages = msgs;
        this.cdr.markForCheck();
        this.cdr.detectChanges();
      },
      error: () => {},
    });
  }

  postMessage(): void {
    if (!this.ticket || !this.newMessage.trim() || this.sendingMessage) return;
    this.sendingMessage = true;
    this.api.postMessage(this.ticket.id, this.newMessage.trim()).subscribe({
      next: () => {
        this.newMessage = '';
        this.sendingMessage = false;
        this.loadMessages();
      },
      error: () => (this.sendingMessage = false),
    });
  }

  changeStatus(status: string): void {
    if (!this.ticket || this.updatingStatus) return;
    this.updatingStatus = true;
    this.api.updateStatus(this.ticket.id, status).subscribe({
      next: (updated) => {
        this.ticket!.status = updated.status ?? status;
        this.updatingStatus = false;
      },
      error: () => (this.updatingStatus = false),
    });
  }

  assignTicket(): void {
    if (!this.ticket || !this.assignUserId.trim() || this.assigning) return;
    this.assigning = true;
    this.api.assignTicket(this.ticket.id, this.assignUserId.trim()).subscribe({
      next: (updated) => {
        this.ticket!.assignedToUserId = updated.assignedToUserId;
        this.ticket!.status = updated.status;
        this.assignUserId = '';
        this.assigning = false;
      },
      error: () => (this.assigning = false),
    });
  }

  unassignTicket(): void {
    if (!this.ticket || this.assigning) return;
    this.assigning = true;
    this.api.assignTicket(this.ticket.id, null).subscribe({
      next: () => {
        this.ticket!.assignedToUserId = null;
        this.assigning = false;
      },
      error: () => (this.assigning = false),
    });
  }

  isSlaBreach(): boolean {
    return !!this.ticket?.slaDueAt &&
      new Date(this.ticket.slaDueAt).getTime() < Date.now() &&
      !['RESOLVED', 'CLOSED'].includes(this.ticket.status);
  }

  priorityClass(p: string): string {
    return { CRITICAL: 'bg-red-100 text-red-700', HIGH: 'bg-orange-100 text-orange-700', NORMAL: 'bg-blue-100 text-blue-700', LOW: 'bg-gray-100 text-gray-600' }[p] || 'bg-gray-100 text-gray-600';
  }

  statusClass(s: string): string {
    return { OPEN: 'bg-amber-100 text-amber-700', IN_PROGRESS: 'bg-blue-100 text-blue-700', AWAITING_CLIENT: 'bg-purple-100 text-purple-700', RESOLVED: 'bg-green-100 text-green-700', CLOSED: 'bg-gray-100 text-gray-600' }[s] || 'bg-gray-100 text-gray-600';
  }
}
