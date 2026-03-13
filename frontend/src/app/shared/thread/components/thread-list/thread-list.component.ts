import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ThreadListItem } from '../../models/thread.model';

@Component({
  selector: 'app-thread-list',
  standalone: true,
  imports: [CommonModule, DatePipe],
  templateUrl: './thread-list.component.html',
})
export class ThreadListComponent {
  @Input() loading = false;
  @Input() items: ThreadListItem[] = [];
  @Input() selectedId?: string;
  @Output() selected = new EventEmitter<ThreadListItem>();

  statusColor(s: string): string {
    switch (s) {
      case 'OPEN': return 'bg-blue-100 text-blue-700';
      case 'IN_PROGRESS': return 'bg-amber-100 text-amber-700';
      case 'RESPONDED': return 'bg-purple-100 text-purple-700';
      case 'RESOLVED': return 'bg-green-100 text-green-700';
      case 'CLOSED': return 'bg-gray-100 text-gray-600';
      default: return 'bg-gray-100 text-gray-600';
    }
  }

  typeColor(t: string): string {
    switch (t) {
      case 'TECHNICAL': return 'bg-indigo-100 text-indigo-700';
      case 'COMPLIANCE': return 'bg-teal-100 text-teal-700';
      case 'AUDIT': return 'bg-orange-100 text-orange-700';
      default: return 'bg-gray-100 text-gray-600';
    }
  }
}
