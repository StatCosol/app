import {
  Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HelpdeskService } from '../../../core/helpdesk.service';
import { AuthService } from '../../../core/auth.service';

interface HelpdeskTicket {
  id: string;
  ticketRef: string;
  subject: string;
  category: 'Compliance' | 'Audit' | 'Technical' | 'General';
  priority: 'High' | 'Medium' | 'Low';
  status: 'Open' | 'In Progress' | 'Resolved' | 'Closed';
  createdDate: string;
  lastUpdate: string;
}

@Component({
  selector: 'app-branch-helpdesk',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-container">
      <div class="page-header">
        <div>
          <h1 class="page-title">Helpdesk</h1>
          <p class="page-subtitle">Raise queries and track support tickets</p>
        </div>
        <button (click)="showNewTicketForm = !showNewTicketForm" class="btn-primary">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
          </svg>
          Raise Ticket
        </button>
      </div>

      <!-- New ticket form -->
      <div *ngIf="showNewTicketForm" class="form-card">
        <h3 class="form-title">Raise a New Query</h3>
        <div class="form-grid">
          <div class="form-group">
            <label class="form-label">Category</label>
            <select [(ngModel)]="newTicket.category" class="form-input">
              <option value="Compliance">Compliance (→ CRM)</option>
              <option value="Audit">Audit (→ Auditor)</option>
              <option value="Technical">Technical (→ Admin)</option>
              <option value="General">General</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Priority</label>
            <select [(ngModel)]="newTicket.priority" class="form-input">
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
          </div>
          <div class="form-group col-span-2">
            <label class="form-label">Subject</label>
            <input type="text" [(ngModel)]="newTicket.subject" class="form-input" placeholder="Brief description of your query" />
          </div>
          <div class="form-group col-span-2">
            <label class="form-label">Description</label>
            <textarea [(ngModel)]="newTicket.description" class="form-input" rows="3" placeholder="Provide details about your issue or query..."></textarea>
          </div>
        </div>
        <div class="flex items-center gap-3 mt-4">
          <button (click)="submitTicket()" class="btn-primary">Submit</button>
          <button (click)="showNewTicketForm = false" class="btn-secondary">Cancel</button>
        </div>
      </div>

      <!-- Routing info -->
      <div class="routing-info">
        <p class="text-xs font-semibold text-slate-500 mb-2">Query routing:</p>
        <div class="flex flex-wrap gap-3">
          <span class="route-pill bg-blue-50 text-blue-700">Compliance → CRM Team</span>
          <span class="route-pill bg-purple-50 text-purple-700">Audit → Auditor</span>
          <span class="route-pill bg-amber-50 text-amber-700">Technical → Admin</span>
        </div>
      </div>

      <!-- Tickets table -->
      <div class="table-card">
        <div class="overflow-x-auto">
          <table class="data-table">
            <thead>
              <tr>
                <th>Ticket #</th>
                <th>Subject</th>
                <th>Category</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Created</th>
                <th>Last Update</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let t of tickets; trackBy: trackById" class="data-row">
                <td class="font-mono text-xs text-blue-600 font-medium">{{ t.ticketRef }}</td>
                <td class="font-medium text-slate-800">{{ t.subject }}</td>
                <td class="text-slate-600">{{ t.category }}</td>
                <td>
                  <span class="badge"
                    [class.bg-red-100]="t.priority === 'High'" [class.text-red-700]="t.priority === 'High'"
                    [class.bg-amber-100]="t.priority === 'Medium'" [class.text-amber-700]="t.priority === 'Medium'"
                    [class.bg-blue-100]="t.priority === 'Low'" [class.text-blue-700]="t.priority === 'Low'">
                    {{ t.priority }}
                  </span>
                </td>
                <td>
                  <span class="badge"
                    [class.bg-red-100]="t.status === 'Open'" [class.text-red-700]="t.status === 'Open'"
                    [class.bg-amber-100]="t.status === 'In Progress'" [class.text-amber-700]="t.status === 'In Progress'"
                    [class.bg-emerald-100]="t.status === 'Resolved' || t.status === 'Closed'" [class.text-emerald-700]="t.status === 'Resolved' || t.status === 'Closed'">
                    {{ t.status }}
                  </span>
                </td>
                <td class="text-slate-500 text-xs">{{ t.createdDate }}</td>
                <td class="text-slate-500 text-xs">{{ t.lastUpdate }}</td>
              </tr>
              <tr *ngIf="tickets.length === 0">
                <td colspan="7" class="text-center text-slate-400 py-12">No helpdesk tickets yet. Raise a ticket above.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .page-container { max-width: 1280px; margin: 0 auto; }
    .page-header { display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 1rem; margin-bottom: 1.25rem; }
    .page-title { font-size: 1.25rem; font-weight: 700; color: #1e293b; }
    .page-subtitle { font-size: 0.8125rem; color: #64748b; margin-top: 0.25rem; }
    .btn-primary {
      display: inline-flex; align-items: center; gap: 0.375rem; padding: 0.5rem 1rem;
      background: linear-gradient(135deg, #0a2656, #1a3a6e); color: white; border: none; border-radius: 0.5rem;
      font-size: 0.8125rem; font-weight: 600; cursor: pointer; transition: opacity 0.15s;
      &:hover { opacity: 0.9; }
    }
    .btn-secondary {
      padding: 0.5rem 1rem; border: 1px solid #e2e8f0; border-radius: 0.5rem; font-size: 0.8125rem;
      font-weight: 500; color: #334155; background: white; cursor: pointer;
      &:hover { border-color: #94a3b8; }
    }
    .form-card { background: white; border-radius: 1rem; padding: 1.5rem; border: 1px solid #dbeafe; box-shadow: 0 2px 8px rgba(59,130,246,0.08); margin-bottom: 1.25rem; }
    .form-title { font-size: 0.9375rem; font-weight: 700; color: #1e293b; margin-bottom: 1rem; }
    .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
    .col-span-2 { grid-column: span 2; }
    @media (max-width: 640px) { .form-grid { grid-template-columns: 1fr; } .col-span-2 { grid-column: span 1; } }
    .form-group { display: flex; flex-direction: column; }
    .form-label { font-size: 0.75rem; font-weight: 600; color: #64748b; margin-bottom: 0.375rem; }
    .form-input {
      padding: 0.5rem 0.75rem; border: 1px solid #e2e8f0; border-radius: 0.5rem; font-size: 0.8125rem; width: 100%;
      &:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59,130,246,0.15); }
    }
    textarea.form-input { resize: vertical; }
    .routing-info { margin-bottom: 1rem; }
    .route-pill { display: inline-flex; padding: 0.25rem 0.625rem; border-radius: 999px; font-size: 0.6875rem; font-weight: 600; }
    .table-card { background: white; border-radius: 1rem; border: 1px solid #f1f5f9; box-shadow: 0 1px 4px rgba(0,0,0,0.04); overflow: hidden; }
    .data-table { width: 100%; border-collapse: collapse; }
    .data-table th { text-align: left; padding: 0.75rem 1rem; font-size: 0.6875rem; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; background: #f8fafc; border-bottom: 2px solid #f1f5f9; }
    .data-table td { padding: 0.75rem 1rem; font-size: 0.8125rem; border-bottom: 1px solid #f8fafc; }
    .data-row:hover { background: #f8fafc; }
    .badge { display: inline-flex; padding: 0.125rem 0.5rem; border-radius: 999px; font-size: 0.6875rem; font-weight: 600; }
  `]
})
export class BranchHelpdeskComponent implements OnInit {
  showNewTicketForm = false;
  newTicket = { subject: '', description: '', category: 'Compliance', priority: 'Medium' };
  tickets: HelpdeskTicket[] = [];
  loading = true;
  private branchId: string | undefined;

  constructor(
    private cdr: ChangeDetectorRef,
    private helpdeskSvc: HelpdeskService,
    private auth: AuthService,
  ) {}

  ngOnInit(): void {
    const branchIds = this.auth.getBranchIds();
    this.branchId = branchIds.length ? branchIds[0] : undefined;
    this.loadTickets();
  }

  private loadTickets(): void {
    this.helpdeskSvc.listTickets({ branchId: this.branchId }).subscribe({
      next: (rows) => {
        this.tickets = (rows || []).map((r: any) => this.mapTicket(r));
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => { this.loading = false; this.cdr.markForCheck(); },
    });
  }

  private mapTicket(r: any): HelpdeskTicket {
    const fmt = (d: any) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
    const statusMap: Record<string, string> = {
      OPEN: 'Open', IN_PROGRESS: 'In Progress', AWAITING_CLIENT: 'In Progress',
      RESOLVED: 'Resolved', CLOSED: 'Closed',
    };
    const priorityMap: Record<string, string> = {
      CRITICAL: 'High', HIGH: 'High', NORMAL: 'Medium', LOW: 'Low',
    };
    return {
      id: r.id,
      ticketRef: `HD-${r.id?.substring(0, 8) || ''}`,
      subject: r.description || r.subCategory || r.category || '—',
      category: (r.category || 'General') as any,
      priority: (priorityMap[r.priority] || 'Medium') as any,
      status: (statusMap[r.status] || 'Open') as any,
      createdDate: fmt(r.createdAt || r.created_at),
      lastUpdate: fmt(r.updatedAt || r.updated_at),
    };
  }

  submitTicket(): void {
    if (!this.newTicket.subject.trim()) return;
    const priorityMap: Record<string, string> = { High: 'HIGH', Medium: 'NORMAL', Low: 'LOW' };
    this.helpdeskSvc.createTicket({
      category: this.newTicket.category.toUpperCase(),
      branchId: this.branchId,
      priority: priorityMap[this.newTicket.priority] || 'NORMAL',
      description: `${this.newTicket.subject}\n\n${this.newTicket.description}`.trim(),
    }).subscribe({
      next: (ticket) => {
        this.tickets.unshift(this.mapTicket(ticket));
        this.newTicket = { subject: '', description: '', category: 'Compliance', priority: 'Medium' };
        this.showNewTicketForm = false;
        this.cdr.markForCheck();
      },
      error: () => this.cdr.markForCheck(),
    });
  }

  trackById(_: number, item: HelpdeskTicket): string { return item.id; }

}
