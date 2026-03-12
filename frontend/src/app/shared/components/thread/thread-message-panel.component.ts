import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ThreadMessage } from './thread.model';

@Component({
  selector: 'thread-message-panel',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="border border-gray-200 rounded-lg bg-white p-3 space-y-2">
      <div *ngFor="let m of messages" class="rounded-lg p-2" [ngClass]="m.isInternal ? 'bg-amber-50 border border-amber-200' : 'bg-gray-50 border border-gray-200'">
        <div class="text-xs font-semibold text-gray-800">{{ m.senderName }} <span class="text-gray-500" *ngIf="m.senderRole">({{ m.senderRole }})</span></div>
        <div class="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{{ m.body }}</div>
        <div *ngIf="m.attachments?.length" class="mt-2 flex flex-wrap gap-2">
          <a
            *ngFor="let attachment of m.attachments"
            [href]="attachment.url || '#'"
            target="_blank"
            rel="noopener noreferrer"
            class="text-xs font-medium text-blue-700 hover:underline"
            [class.pointer-events-none]="!attachment.url"
            [class.opacity-60]="!attachment.url"
          >
            {{ attachment.name || 'Attachment' }}
          </a>
        </div>
        <div class="text-[11px] text-gray-500 mt-1">{{ m.createdAt | date:'d MMM y, h:mm a' }}</div>
      </div>
      <div *ngIf="!messages.length" class="text-sm text-gray-500">No messages yet.</div>
    </div>
  `,
})
export class ThreadMessagePanelComponent {
  @Input() messages: ThreadMessage[] = [];
}
