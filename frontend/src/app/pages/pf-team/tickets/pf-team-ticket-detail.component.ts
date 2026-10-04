import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { PfTeamApiService, HdTicket, HdMessage } from '../pf-team-api.service';
import { AuthService } from '../../../core/auth.service';
import { Subscription } from 'rxjs';
import { HelpdeskAttachmentsComponent } from '../../../shared/helpdesk/helpdesk-attachments.component';

@Component({
  selector: 'app-pf-team-ticket-detail',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, HelpdeskAttachmentsComponent],
  template: `
    @if (ticket) {
<div class="space-y-6">
      <!-- Back + Header -->
      <div class="flex items-center gap-3">
        <a routerLink="/pf-team/tickets" class="text-gray-400 hover:text-gray-600 transition-colors">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5"/></svg>
        </a>
        <h1 class="text-xl font-bold text-gray-900">Ticket Detail</h1>
      </div>

      <!-- Ticket Info -->
      <div class="bg-white rounded-xl border border-gray-200 p-6">
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <div>
            <span class="text-xs text-gray-500 uppercase tracking-wider">Client</span>
            <p class="text-sm font-semibold text-brand-700 mt-0.5">{{ ticket.client?.clientName || '—' }}</p>
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
            <span class="text-xs text-gray-500 uppercase tracking-wider">Status</span>
            <p class="mt-0.5"><span class="text-xs px-2 py-0.5 rounded-full font-medium" [class]="statusClass(ticket.status)">{{ ticket.status.replace('_', ' ') }}</span></p>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
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

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-gray-500">
          <div><span class="uppercase tracking-wider">Employee Ref</span><br><span class="text-sm text-gray-700">{{ ticket.employeeRef || '—' }}</span></div>
          <div><span class="uppercase tracking-wider">Created</span><br><span class="text-sm text-gray-700">{{ ticket.createdAt | date:'dd MMM yyyy, HH:mm' }}</span></div>
        </div>
      </div>

      <!-- Status Update -->
      <div class="bg-white rounded-xl border border-gray-200 p-6">
        <h2 class="text-sm font-semibold text-gray-900 mb-3">Update Status</h2>
        @if (!canManage) {
          <p class="text-sm text-amber-700 mb-3">Awaiting administrator assignment.</p>
        }
        @if (actionError) {
          <p role="alert" class="text-sm text-red-700 mb-3">{{ actionError }}</p>
        }
        <div class="flex flex-wrap items-center gap-2">
          @for (s of statuses; track s) {
<button
                  (click)="changeStatus(s)"
                  [disabled]="!canChangeStatus(s) || updatingStatus"
                  class="px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  [class]="ticket.status === s ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-300 text-gray-700 hover:bg-gray-50'">
            {{ s.replace('_', ' ') }}
          </button>
}
        </div>
      </div>

      <!-- Messages -->
      <div class="bg-white rounded-xl border border-gray-200 p-6">
        <h2 class="text-sm font-semibold text-gray-900 mb-4">Messages ({{ messages.length }})</h2>

        @if (messagesLoading) { <p role="status" class="text-sm text-gray-500">Loading messages...</p> }
        @if (messagesError) {
          <div role="alert" class="text-sm text-red-700 mb-3">{{ messagesError }}
            <button type="button" (click)="loadMessages()" class="underline ml-2">Retry messages</button>
          </div>
        }
        @if (messages.length === 0 && !messagesLoading && !messagesError) {
<div class="text-sm text-gray-400 text-center py-4">No messages yet</div>
}

        <div class="space-y-3 max-h-96 overflow-y-auto mb-4">
          @for (m of messages; track m) {
<div class="p-3 rounded-lg bg-gray-50 border border-gray-100">
            <p class="text-sm text-gray-800 whitespace-pre-wrap">{{ m.message }}</p>
            <app-helpdesk-attachments [attachments]="m.attachments || []" [disabled]="!canManage" />
            <p class="text-xs text-gray-400 mt-1">{{ m.createdAt | date:'dd MMM yyyy, HH:mm' }}</p>
          </div>
}
        </div>

        <!-- Post Message -->
        <div class="flex gap-2">
          <input autocomplete="off" id="pttd-new-message" name="newMessage"
            [(ngModel)]="newMessage"
            [disabled]="!canManage || sendingMessage"
            (keydown.enter)="postMessage()"
            placeholder="Type a message…"
            class="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
          />
          <button
            (click)="postMessage()"
            [disabled]="!canManage || !newMessage.trim() || sendingMessage"
            class="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
            Send
          </button>
        </div>
      </div>
    </div>
}

    <!-- Loading -->
    @if (!ticket && !error) {
<div class="flex items-center justify-center py-20">
      <div class="w-8 h-8 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin"></div>
    </div>
}

    <!-- Error -->
    @if (error) {
<div class="text-center py-20">
      <p class="text-red-500 text-sm">{{ error }}</p>
      <button type="button" (click)="loadTicket()" class="text-sm underline mt-2">Retry ticket</button>
      <a routerLink="/pf-team/tickets" class="text-sm text-brand-600 hover:underline mt-2 inline-block">← Back to tickets</a>
    </div>
}
  `,
})
export class PfTeamTicketDetailComponent implements OnInit, OnDestroy {
  ticket: HdTicket | null = null;
  messages: HdMessage[] = [];
  messagesLoading = false;
  messagesError = '';
  private ticketId = '';
  private paramSub?: Subscription;
  private contextRequests = new Subscription();
  private messageRequest?: Subscription;
  newMessage = '';
  sendingMessage = false;
  updatingStatus = false;
  error = '';
  actionError = '';
  statuses = ['OPEN', 'IN_PROGRESS', 'AWAITING_CLIENT', 'RESOLVED'];

  constructor(private route: ActivatedRoute, private api: PfTeamApiService, private auth: AuthService) {}

  get canManage(): boolean {
    return !!this.ticket?.assignedToUserId && this.ticket.assignedToUserId === this.auth.getUser()?.id;
  }

  canChangeStatus(status: string): boolean {
    return this.canManage && this.statuses.includes(status) && this.ticket?.status !== status &&
      !(this.ticket?.status === 'OPEN' && status === 'RESOLVED');
  }

  ngOnInit(): void {
    this.paramSub = this.route.paramMap.subscribe(params => {
      this.ticketId = params.get('id') || '';
      this.loadTicket();
    });
  }

  loadTicket(): void {
    this.contextRequests.unsubscribe();
    this.contextRequests = new Subscription();
    this.messageRequest?.unsubscribe();
    this.ticket = null;
    this.messages = [];
    this.messagesError = '';
    this.messagesLoading = false;
    this.error = '';
    this.actionError = '';
    this.newMessage = '';
    this.sendingMessage = this.updatingStatus = false;
    if (!this.ticketId) { this.error = 'Ticket id missing'; return; }
    this.contextRequests.add(this.api.getTicket(this.ticketId).subscribe({
      next: (t) => {
        this.ticket = t;
        this.loadMessages();
      },
      error: () => (this.error = 'Ticket could not be loaded or access was denied.'),
    }));
  }

  ngOnDestroy(): void {
    this.paramSub?.unsubscribe();
    this.contextRequests.unsubscribe();
    this.messageRequest?.unsubscribe();
  }

  loadMessages(): void {
    if (!this.ticket) return;
    this.messageRequest?.unsubscribe();
    this.messages = [];
    this.messagesLoading = true;
    this.messagesError = '';
    this.messageRequest = this.api.getMessages(this.ticket.id).subscribe({
      next: (msgs) => { this.messages = msgs; this.messagesLoading = false; },
      error: () => { this.messagesLoading = false; this.messagesError = 'Messages could not be loaded.'; },
    });
  }

  postMessage(): void {
    if (!this.ticket || !this.canManage || !this.newMessage.trim() || this.sendingMessage) return;
    this.actionError = '';
    this.sendingMessage = true;
    this.contextRequests.add(this.api.postMessage(this.ticket.id, this.newMessage.trim()).subscribe({
      next: () => {
        this.newMessage = '';
        this.sendingMessage = false;
        this.loadMessages();
      },
      error: (err) => {
        this.sendingMessage = false;
        this.actionError = typeof err?.error?.message === 'string' ? err.error.message : 'Message could not be sent. Please retry.';
      },
    }));
  }

  changeStatus(status: string): void {
    if (!this.ticket || !this.canChangeStatus(status) || this.updatingStatus) return;
    this.actionError = '';
    this.updatingStatus = true;
    this.contextRequests.add(this.api.updateStatus(this.ticket.id, status).subscribe({
      next: (updated) => {
        this.ticket!.status = updated.status ?? status;
        this.updatingStatus = false;
      },
      error: (err) => {
        this.updatingStatus = false;
        this.actionError = typeof err?.error?.message === 'string' ? err.error.message : 'Status could not be updated. Please retry.';
      },
    }));
  }

  isSlaBreach(): boolean {
    return !!this.ticket?.slaDueAt &&
      new Date(this.ticket.slaDueAt).getTime() < Date.now() &&
      !['RESOLVED', 'CLOSED'].includes(this.ticket.status);
  }

  priorityClass(p: string): string {
    return { CRITICAL: 'bg-red-100 text-red-700', HIGH: 'bg-orange-100 text-orange-700', NORMAL: 'bg-brand-100 text-brand-700', LOW: 'bg-gray-100 text-gray-600' }[p] || 'bg-gray-100 text-gray-600';
  }

  statusClass(s: string): string {
    return { OPEN: 'bg-amber-100 text-amber-700', IN_PROGRESS: 'bg-brand-100 text-brand-700', AWAITING_CLIENT: 'bg-purple-100 text-purple-700', RESOLVED: 'bg-green-100 text-green-700', CLOSED: 'bg-gray-100 text-gray-600' }[s] || 'bg-gray-100 text-gray-600';
  }
}
