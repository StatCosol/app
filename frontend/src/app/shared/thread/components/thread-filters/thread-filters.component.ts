import { Component, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ThreadFilters } from '../../models/thread.model';

@Component({
  selector: 'app-thread-filters',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './thread-filters.component.html',
})
export class ThreadFiltersComponent {
  @Output() changed = new EventEmitter<Partial<ThreadFilters>>();

  q = '';
  type = '';
  status = '';
  unread = false;

  emit(): void {
    this.changed.emit({
      q: this.q || undefined,
      type: (this.type as any) || undefined,
      status: (this.status as any) || undefined,
      unread: this.unread || undefined,
    });
  }
}
