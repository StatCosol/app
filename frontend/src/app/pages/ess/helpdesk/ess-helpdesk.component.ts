import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { EssApiService } from '../ess-api.service';

interface EssTicket {
  id: string;
  category: string;
  subCategory: string | null;
  priority: string;
  status: string;
  description: string;
  slaDueAt: string | null;
  createdAt: string;
}

interface EssMessage {
  id: string;
  ticketId: string;
  senderUserId: string;
  message: string;
  createdAt: string;
}

@Component({
  selector: 'app-ess-helpdesk',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="space-y-6">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">Helpdesk</h1>
        <p class="mt-1 text-sm text-gray-500">Raise and track your PF, ESI, and Payslip queries</p>
      </div>

      <!-- New Ticket Form -->
      <div class="bg-white rounded-xl border border-gray-200 p-6">
        <h2 class="text-base font-semibold text-gray-900 mb-4">Raise a Query</h2>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <div>
            <label class="block text-xs font-medium text-gray-600 mb-1" for="eh-new-category">Category *</label>
            <select id="eh-new-category" name="newCategory" [(ngModel)]="newCategory"
                    class="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500">
              <option value="">Select…</option>
              <option value="PF">PF (Provident Fund)</option>
              <option value="ESI">ESI (Employee State Insurance)</option>
              <option value="PAYSLIP">Payslip</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-600 mb-1" for="eh-new-sub-category">Sub-category</label>
            <input autocomplete="off" id="eh-new-sub-category" name="newSubCategory" [(ngModel)]="newSubCategory" placeholder="e.g. UAN Issue, Claim Delay"
                   class="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500">
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-600 mb-1" for="eh-new-priority">Priority</label>
            <select id="eh-new-priority" name="newPriority" [(ngModel)]="newPriority"
                    class="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500">
              <option value="NORMAL">Normal</option>
              <option value="LOW">Low</option>
              <option value="HIGH">High</option>
              <option value="CRITICAL">Critical</option>
            </select>
          </div>
        </div>
        <div class="mb-4">
          <label class="block text-xs font-medium text-gray-600 mb-1" for="eh-new-description">Description *</label>
          <textarea autocomplete="off" id="eh-new-description" name="newDescription" [(ngModel)]="newDescription" rows="3" placeholder="Describe your query in detail…"
                    class="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"></textarea>
        </div>
        <button (click)="submitTicket()"
                [disabled]="!newCategory || !newDescription.trim() || submitting"
                class="px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
          {{ submitting ? 'Submitting…' : 'Submit Query' }}
        </button>
        <span *ngIf="submitSuccess" class="ml-3 text-sm text-green-600">✓ Ticket created</span>
      </div>

      <!-- My Tickets -->
      <div class="bg-white rounded-xl border border-gray-200 p-6">
        <h2 class="text-base font-semibold text-gray-900 mb-4">My Tickets ({{ tickets.length }})</h2>

        <!-- Filter -->
        <div class="flex flex-wrap gap-2 mb-4">
          <button *ngFor="let f of filterOptions"
                  (click)="filterStatus = f.value; applyFilter()"
                  class="px-3 py-1 text-xs font-medium rounded-full border transition-colors"
                  [class]="filterStatus === f.value ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-300 text-gray-600 hover:bg-gray-50'">
            {{ f.label }}
          </button>
        </div>

        <div *ngIf="filtered.length === 0" class="text-sm text-gray-400 text-center py-8">No tickets found</div>

        <div class="space-y-3">
          <div *ngFor="let t of filtered"
               class="rounded-lg border transition-all"
               [class]="selectedTicket?.id === t.id ? 'border-indigo-300 bg-indigo-50/30' : 'border-gray-100 hover:border-gray-200'">
            <!-- Ticket row -->
            <div class="p-4 cursor-pointer" (click)="selectTicket(t)">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <span class="text-sm font-semibold text-gray-900">{{ t.category }}</span>
                  <span *ngIf="t.subCategory" class="text-xs text-gray-400">/ {{ t.subCategory }}</span>
                </div>
                <div class="flex items-center gap-2">
                  <span class="text-xs px-2 py-0.5 rounded-full font-medium" [class]="priorityClass(t.priority)">{{ t.priority }}</span>
                  <span class="text-xs px-2 py-0.5 rounded-full font-medium" [class]="statusClass(t.status)">{{ t.status.replace('_', ' ') }}</span>
                </div>
              </div>
              <p class="text-sm text-gray-600 mt-1 line-clamp-2">{{ t.description }}</p>
              <p class="text-xs text-gray-400 mt-1">{{ t.createdAt | date:'dd MMM yyyy, HH:mm' }}</p>
            </div>

            <!-- Expanded: messages -->
            <div *ngIf="selectedTicket?.id === t.id" class="border-t border-gray-100 p-4 bg-gray-50/50">
              <h3 class="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-3">Messages</h3>
              <div *ngIf="messages.length === 0" class="text-xs text-gray-400 mb-3">No messages yet</div>
              <div class="space-y-2 max-h-60 overflow-y-auto mb-3">
                <div *ngFor="let m of messages" class="p-2.5 rounded-lg bg-white border border-gray-100">
                  <p class="text-sm text-gray-800">{{ m.message }}</p>
                  <p class="text-xs text-gray-400 mt-1">{{ m.createdAt | date:'dd MMM, HH:mm' }}</p>
                </div>
              </div>
              <div class="flex gap-2">
                <input autocomplete="off" id="eh-reply-message" name="replyMessage" [(ngModel)]="replyMessage" (keydown.enter)="sendReply()"
                       placeholder="Type a reply…"
                       class="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500">
                <button (click)="sendReply()"
                        [disabled]="!replyMessage.trim() || sendingReply"
                        class="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                  Send
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class EssHelpdeskComponent implements OnInit {
  tickets: EssTicket[] = [];
  filtered: EssTicket[] = [];
  messages: EssMessage[] = [];
  selectedTicket: EssTicket | null = null;

  // New ticket form
  newCategory = '';
  newSubCategory = '';
  newPriority = 'NORMAL';
  newDescription = '';
  submitting = false;
  submitSuccess = false;

  // Filters
  filterStatus = '';
  filterOptions = [
    { label: 'All', value: '' },
    { label: 'Open', value: 'OPEN' },
    { label: 'In Progress', value: 'IN_PROGRESS' },
    { label: 'Resolved', value: 'RESOLVED' },
    { label: 'Closed', value: 'CLOSED' },
  ];

  // Reply
  replyMessage = '';
  sendingReply = false;

  constructor(private api: EssApiService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.loadTickets();
  }

  private loadTickets(): void {
    this.api.helpdeskListTickets(this.filterStatus || undefined).subscribe({
      next: (data) => {
        this.tickets = data;
        this.applyFilter();
        this.cdr.markForCheck();
      },
      error: () => { this.cdr.markForCheck(); },
    });
  }

  applyFilter(): void {
    this.filtered = this.filterStatus
      ? this.tickets.filter((t) => t.status === this.filterStatus)
      : [...this.tickets];
  }

  submitTicket(): void {
    if (!this.newCategory || !this.newDescription.trim() || this.submitting) return;
    this.submitting = true;
    this.submitSuccess = false;
    this.api
      .helpdeskCreateTicket({
        category: this.newCategory,
        subCategory: this.newSubCategory || null,
        priority: this.newPriority,
        description: this.newDescription.trim(),
      })
      .subscribe({
        next: () => {
          this.submitting = false;
          this.submitSuccess = true;
          this.newCategory = '';
          this.newSubCategory = '';
          this.newPriority = 'NORMAL';
          this.newDescription = '';
          this.loadTickets();
          setTimeout(() => (this.submitSuccess = false), 3000);
        },
        error: () => (this.submitting = false),
      });
  }

  selectTicket(t: EssTicket): void {
    if (this.selectedTicket?.id === t.id) {
      this.selectedTicket = null;
      this.messages = [];
      return;
    }
    this.selectedTicket = t;
    this.replyMessage = '';
    this.api.helpdeskGetMessages(t.id).subscribe({
      next: (msgs) => (this.messages = msgs),
      error: () => (this.messages = []),
    });
  }

  sendReply(): void {
    if (!this.selectedTicket || !this.replyMessage.trim() || this.sendingReply) return;
    this.sendingReply = true;
    this.api.helpdeskPostMessage(this.selectedTicket.id, this.replyMessage.trim()).subscribe({
      next: () => {
        this.replyMessage = '';
        this.sendingReply = false;
        this.api.helpdeskGetMessages(this.selectedTicket!.id).subscribe({
          next: (msgs) => (this.messages = msgs),
          error: () => {},
        });
      },
      error: () => (this.sendingReply = false),
    });
  }

  priorityClass(p: string): string {
    return { CRITICAL: 'bg-red-100 text-red-700', HIGH: 'bg-orange-100 text-orange-700', NORMAL: 'bg-blue-100 text-blue-700', LOW: 'bg-gray-100 text-gray-600' }[p] || 'bg-gray-100 text-gray-600';
  }

  statusClass(s: string): string {
    return { OPEN: 'bg-amber-100 text-amber-700', IN_PROGRESS: 'bg-blue-100 text-blue-700', AWAITING_CLIENT: 'bg-purple-100 text-purple-700', RESOLVED: 'bg-green-100 text-green-700', CLOSED: 'bg-gray-100 text-gray-600' }[s] || 'bg-gray-100 text-gray-600';
  }
}
