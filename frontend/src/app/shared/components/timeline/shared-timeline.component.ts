import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TimelineEvent } from './timeline.model';
import { TimelineEventCardComponent } from './timeline-event-card.component';

@Component({
  selector: 'shared-timeline',
  standalone: true,
  imports: [CommonModule, TimelineEventCardComponent],
  template: `
    <div class="space-y-2">
      <div *ngIf="!events.length" class="text-sm text-gray-500 border border-dashed border-gray-300 rounded-lg p-4 text-center">
        {{ emptyMessage }}
      </div>
      <timeline-event-card *ngFor="let e of displayEvents" [event]="e"></timeline-event-card>
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

