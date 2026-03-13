import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ThreadInboxItem } from './thread.model';
import { PriorityChipComponent } from '../status/priority-chip.component';
import { StatusChipComponent } from '../status/status-chip.component';

@Component({
  selector: 'thread-inbox-list',
  standalone: true,
  imports: [CommonModule, PriorityChipComponent, StatusChipComponent],
  template: `
    <div class="border border-gray-200 rounded-lg divide-y divide-gray-100 bg-white">
      <button
        *ngFor="let t of items"
        type="button"
        class="w-full text-left px-3 py-2 hover:bg-gray-50"
        [class.bg-blue-50]="t.id === selectedId"
        (click)="selected.emit(t)">
        <div class="flex items-start justify-between gap-2">
          <div>
            <div class="text-sm font-semibold text-gray-900">{{ t.title }}</div>
            <div class="text-xs text-gray-500">{{ t.subtitle || '-' }}</div>
            <div class="text-[11px] text-gray-400 mt-1" *ngIf="t.updatedAt">{{ t.updatedAt | date:'d MMM y, h:mm a' }}</div>
          </div>
          <div class="flex flex-col items-end gap-1">
            <priority-chip [priority]="t.priority || 'MEDIUM'"></priority-chip>
            <status-chip [status]="t.status || 'OPEN'"></status-chip>
            <span *ngIf="t.unreadCount" class="text-[11px] font-semibold text-blue-700">{{ t.unreadCount }} unread</span>
          </div>
        </div>
      </button>
      <div *ngIf="!items.length" class="p-4 text-sm text-gray-500">No threads found.</div>
    </div>
  `,
})
export class ThreadInboxListComponent {
  @Input() items: ThreadInboxItem[] = [];
  @Input() selectedId = '';
  @Output() selected = new EventEmitter<ThreadInboxItem>();
}
