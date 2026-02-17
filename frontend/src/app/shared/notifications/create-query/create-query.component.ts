import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NotificationsService, QueryType } from '../../../core/notifications.service';

@Component({
  selector: 'app-create-query',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './create-query.component.html',
  styleUrls: ['./create-query.component.scss'],
})
export class CreateQueryComponent {
  @Input() clientId?: string;
  @Input() branchId?: string;

  queryType: QueryType = 'TECHNICAL';
  subject = '';
  message = '';

  isSubmitting = false;
  resultText = '';

  constructor(private notifications: NotificationsService) {}

  submit(): void {
    this.resultText = '';
    if (!this.message.trim()) {
      this.resultText = 'Message is required';
      return;
    }

    this.isSubmitting = true;

    this.notifications
      .createQuery({
        clientId: this.clientId,
        branchId: this.branchId,
        queryType: this.queryType,
        subject: this.subject?.trim() || undefined,
        message: this.message.trim(),
      })
      .subscribe({
        next: (res: any) => {
          this.resultText = `Query submitted. Thread ID: ${res?.threadId}`;
          this.subject = '';
          this.message = '';
          this.isSubmitting = false;
        },
        error: (err) => {
          this.resultText = err?.error?.message || 'Failed to submit query';
          this.isSubmitting = false;
        },
      });
  }
}
