import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ThreadInboxItem } from './thread.model';
import { PriorityChipComponent } from '../status/priority-chip.component';
import { StatusChipComponent } from '../status/status-chip.component';

@Component({
  selector: 'ui-thread-inbox-list',
  standalone: true,
  imports: [CommonModule, PriorityChipComponent, StatusChipComponent],
  template: `
    <div class="border border-gray-200 rounded-lg divide-y divide-gray-100 bg-white">
      @for (t of items; track t) {
<button
       
        type="button"
        class="w-full text-left px-3 py-2 hover:bg-gray-50"
        [class.bg-brand-50]="t.id === selectedId"
        (click)="selected.emit(t)">
        <div class="flex items-start justify-between gap-2">
          <div>
            <div class="text-sm font-semibold text-gray-900">{{ t.title }}</div>
            <div class="text-xs text-gray-500">{{ t.subtitle || '-' }}</div>
            @if (t.updatedAt) {
<div class="text-[11px] text-gray-400 mt-1">{{ t.updatedAt | date:'d MMM y, h:mm a' }}</div>
}
          </div>
          <div class="flex flex-col items-end gap-1">
            <ui-priority-chip [priority]="t.priority || 'MEDIUM'"></ui-priority-chip>
            <ui-status-chip [status]="t.status || 'OPEN'"></ui-status-chip>
            @if (t.unreadCount) {
<span class="text-[11px] font-semibold text-brand-700">{{ t.unreadCount }} unread</span>
}
          </div>
        </div>
      </button>
}
      @if (!items.length) {
<div class="p-4 text-sm text-gray-500">No threads found.</div>
}
    </div>
  `,
})
export class ThreadInboxListComponent {
  @Input() items: ThreadInboxItem[] = [];
  @Input() selectedId = '';
  @Output() selected = new EventEmitter<ThreadInboxItem>();
}
