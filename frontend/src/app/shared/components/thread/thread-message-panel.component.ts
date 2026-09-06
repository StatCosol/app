import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ThreadMessage } from './thread.model';
import { ProtectedFileService } from '../../files/services/protected-file.service';

@Component({
  selector: 'ui-thread-message-panel',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="border border-gray-200 rounded-lg bg-white p-3 space-y-2">
      @for (m of messages; track m) {
<div class="rounded-lg p-2" [ngClass]="m.isInternal ? 'bg-amber-50 border border-amber-200' : 'bg-gray-50 border border-gray-200'">
        <div class="text-xs font-semibold text-gray-800">{{ m.senderName }} @if (m.senderRole) {
<span class="text-gray-500">({{ m.senderRole }})</span>
}</div>
        <div class="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{{ m.body }}</div>
        @if (m.attachments?.length) {
<div class="mt-2 flex flex-wrap gap-2">
          @for (attachment of m.attachments; track attachment) {
<button
            type="button"
           
            (click)="downloadAttachment(attachment)"
            class="text-xs font-medium text-brand-700 hover:underline"
            [class.pointer-events-none]="!attachment.url"
            [class.opacity-60]="!attachment.url"
          >
            {{ attachment.name || 'Attachment' }}
          </button>
}
        </div>
}
        <div class="text-[11px] text-gray-500 mt-1">{{ m.createdAt | date:'d MMM y, h:mm a' }}</div>
      </div>
}
      @if (!messages.length) {
<div class="text-sm text-gray-500">No messages yet.</div>
}
    </div>
  `,
})
export class ThreadMessagePanelComponent {
  @Input() messages: ThreadMessage[] = [];

  constructor(private readonly files: ProtectedFileService) {}

  downloadAttachment(attachment: { name?: string | null; url?: string | null }): void {
    if (!attachment.url) return;
    this.files.download(attachment.url, attachment.name || 'attachment').subscribe();
  }
}
