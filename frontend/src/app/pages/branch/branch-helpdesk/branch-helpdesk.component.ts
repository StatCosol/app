import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';
import { ThreadLayoutComponent } from '../../../shared/thread';
import { PageHeaderComponent } from '../../../shared/ui';
import { ToastService } from '../../../shared/toast/toast.service';
import { BranchThreadApiService } from '../../../core/branch-thread-api.service';

@Component({
  selector: 'app-branch-helpdesk',
  standalone: true,
  imports: [CommonModule, FormsModule, ThreadLayoutComponent, PageHeaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-4">
      <ui-page-header
        title="Branch Helpdesk"
        subtitle="Raise operational queries and track responses in one thread workspace">
      </ui-page-header>

      <section class="bg-white rounded-xl border border-gray-200 p-4">
        <div class="flex items-start justify-between gap-3">
          <div>
            <div class="text-sm font-semibold text-gray-900">Raise Query</div>
            <p class="text-xs text-gray-500 mt-1">Technical routes to Admin, Compliance routes to CRM, Audit routes to Auditor.</p>
          </div>
          <button
            type="button"
            class="px-3 py-2 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            (click)="showNewTicketForm = !showNewTicketForm">
            {{ showNewTicketForm ? 'Hide Form' : 'Raise Ticket' }}
          </button>
        </div>

        <form *ngIf="showNewTicketForm" class="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4" (ngSubmit)="submitTicket()">
          <div>
            <label class="block text-xs font-medium text-gray-600 mb-1" for="bh-query-type">Query Type</label>
            <select id="bh-query-type"
              class="w-full rounded-lg border-gray-300 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              [(ngModel)]="newTicket.queryType"
              name="queryType">
              <option value="COMPLIANCE">Compliance</option>
              <option value="AUDIT">Audit</option>
              <option value="TECHNICAL">Technical</option>
              <option value="GENERAL">General</option>
            </select>
          </div>

          <div>
            <label class="block text-xs font-medium text-gray-600 mb-1" for="bh-subject">Subject</label>
            <input autocomplete="off" id="bh-subject"
              type="text"
              class="w-full rounded-lg border-gray-300 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              [(ngModel)]="newTicket.subject"
              name="subject"
              placeholder="Brief query title" />
          </div>

          <div class="md:col-span-2">
            <label class="block text-xs font-medium text-gray-600 mb-1" for="bh-message">Message</label>
            <textarea autocomplete="off" id="bh-message"
              rows="3"
              class="w-full rounded-lg border-gray-300 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              [(ngModel)]="newTicket.message"
              name="message"
              placeholder="Describe the issue or request clearly"></textarea>
          </div>

          <div class="md:col-span-2 flex items-center gap-2 justify-end">
            <button
              type="button"
              class="px-3 py-2 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              (click)="showNewTicketForm = false"
              [disabled]="submitting">
              Cancel
            </button>
            <button
              type="submit"
              class="px-3 py-2 rounded-lg bg-blue-700 text-white text-sm font-semibold disabled:opacity-60"
              [disabled]="submitting || !canSubmitTicket">
              {{ submitting ? 'Submitting...' : 'Submit Ticket' }}
            </button>
          </div>
        </form>
      </section>

      <app-thread-layout
        [api]="api"
        title="Branch Threads"
        [canClose]="true"
        [canResolve]="false"
        [canReopen]="true"
        (replySent)="refreshThreads()">
      </app-thread-layout>
    </main>
  `,
})
export class BranchHelpdeskComponent implements OnDestroy {
  @ViewChild(ThreadLayoutComponent) threadLayout?: ThreadLayoutComponent;

  private readonly destroy$ = new Subject<void>();

  showNewTicketForm = false;
  submitting = false;
  newTicket: {
    queryType: 'TECHNICAL' | 'COMPLIANCE' | 'AUDIT' | 'GENERAL';
    subject: string;
    message: string;
  } = {
    queryType: 'COMPLIANCE',
    subject: '',
    message: '',
  };

  constructor(
    public readonly api: BranchThreadApiService,
    private readonly toast: ToastService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  get canSubmitTicket(): boolean {
    return !!this.newTicket.subject.trim() && !!this.newTicket.message.trim();
  }

  submitTicket(): void {
    if (!this.canSubmitTicket || this.submitting) return;

    this.submitting = true;
    this.api
      .createTicket({
        queryType: this.newTicket.queryType,
        subject: this.newTicket.subject,
        message: this.newTicket.message,
      })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.submitting = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.toast.success('Ticket raised', 'Query created successfully.');
          this.newTicket = {
            queryType: 'COMPLIANCE',
            subject: '',
            message: '',
          };
          this.showNewTicketForm = false;
          this.refreshThreads();
          this.cdr.markForCheck();
        },
        error: (err: any) => {
          this.toast.error(
            'Submit failed',
            err?.error?.message || 'Could not raise the helpdesk query.',
          );
        },
      });
  }

  refreshThreads(): void {
    this.threadLayout?.loadList();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
