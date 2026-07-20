import { Component, Input } from '@angular/core';

import { TimelineEvent } from './timeline.model';
import { TimelineEventCardComponent } from './timeline-event-card.component';

@Component({
  selector: 'ui-shared-timeline',
  standalone: true,
  imports: [TimelineEventCardComponent],
  template: `
    <div class="space-y-2">
      @if (!events.length) {
<div class="text-sm text-gray-500 border border-dashed border-gray-300 rounded-lg p-4 text-center">
        {{ emptyMessage }}
      </div>
}
      @for (e of displayEvents; track e) {
<ui-timeline-event-card [event]="e"></ui-timeline-event-card>
}
    </div>
  `,
})
export class SharedTimelineComponent {
  @Input() events: TimelineEvent[] = [];
  @Input() emptyMessage = 'No history available.';
  @Input() reverseChronological = true;

  get displayEvents(): TimelineEvent[] {
    const copy = [...(this.events || [])];
    if (!this.reverseChronological) return copy;
    return copy.sort(
      (a, b) =>
        new Date(b.createdAt || '').getTime() - new Date(a.createdAt || '').getTime(),
    );
  }
}

