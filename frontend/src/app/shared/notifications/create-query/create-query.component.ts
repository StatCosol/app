import { Component, Input, OnDestroy } from '@angular/core';
import { Subject, finalize, takeUntil } from 'rxjs';

import { FormsModule } from '@angular/forms';
import { NotificationsService, QueryType } from '../../../core/notifications.service';
import { ActionButtonComponent } from '../../ui';

@Component({
  selector: 'app-create-query',
  standalone: true,
  imports: [FormsModule, ActionButtonComponent],
  templateUrl: './create-query.component.html',
  styleUrls: ['./create-query.component.scss'],
})
export class CreateQueryComponent implements OnDestroy {
  @Input() clientId?: string;
  @Input() branchId?: string;

  queryType: QueryType = 'TECHNICAL';
  subject = '';
  message = '';

  isSubmitting = false;
  resultText = '';
  resultIsError = false;
  private readonly destroy$ = new Subject<void>();
  private destroyed = false;

  constructor(private notifications: NotificationsService) {}

  submit(): void {
    if (this.isSubmitting || this.destroyed) return;
    this.resultText = '';
    this.resultIsError = false;
    if (!this.message.trim()) {
      this.resultIsError = true;
      this.resultText = 'Message is required';
      return;
    }

    const draft = { subject: this.subject, message: this.message, queryType: this.queryType };
    const clientId = this.clientId;
    const branchId = this.branchId;
    const currentScope = () => this.clientId === clientId && this.branchId === branchId;
    this.isSubmitting = true;

    this.notifications
      .createQuery({
        clientId, branchId,
        queryType: draft.queryType,
        subject: draft.subject.trim() || undefined,
        message: draft.message.trim(),
      })
      .pipe(takeUntil(this.destroy$), finalize(() => { this.isSubmitting = false; }))
      .subscribe({
        next: () => {
          if (!currentScope()) return;
          const unchanged = this.subject === draft.subject && this.message === draft.message && this.queryType === draft.queryType;
          this.resultText = unchanged ? 'Query submitted.' : 'Query submitted. Your newer form edits have been kept.';
          if (unchanged) { this.subject = ''; this.message = ''; }
        },
        error: (err) => {
          if (!currentScope()) return;
          this.resultIsError = true;
          this.resultText = typeof err?.error?.message === 'string' ? err.error.message : 'Failed to submit query. Your entries have been kept; retry when ready.';
        },
      });
  }
  ngOnDestroy(): void {
    this.destroyed = true;
    this.destroy$.next();
    this.destroy$.complete();
  }
}
