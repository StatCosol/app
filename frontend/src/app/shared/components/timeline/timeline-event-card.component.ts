import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TimelineEvent } from './timeline.model';
import { ActorBadgeComponent } from './actor-badge.component';
import { StatusChangeRowComponent } from './status-change-row.component';

@Component({
  selector: 'ui-timeline-event-card',
  standalone: true,
  imports: [CommonModule, ActorBadgeComponent, StatusChangeRowComponent],
  template: `
    <div class="border border-gray-200 rounded-lg p-3 bg-white">
      <div class="flex items-start justify-between gap-2">
        <div>
          <div class="text-sm font-semibold text-gray-900">{{ event.title }}</div>
          <div class="mt-1 flex flex-wrap gap-2 items-center">
            <ui-actor-badge [actorName]="event.actorName || null" [actorRole]="event.actorRole || null"></ui-actor-badge>
            <span class="text-[11px] text-gray-500">{{ event.createdAt | date:'d MMM y, h:mm a' }}</span>
          </div>
        </div>
        <span *ngIf="event.attachmentsCount" class="text-[11px] text-gray-500">Attachments: {{ event.attachmentsCount }}</span>
      </div>

      <div class="mt-2">
        <ui-status-change-row [from]="event.statusFrom || null" [to]="event.statusTo || null"></ui-status-change-row>
      </div>

      <div *ngIf="event.comment" class="mt-2 text-sm text-gray-700 whitespace-pre-wrap">{{ event.comment }}</div>
    </div>
  `,
})
export class TimelineEventCardComponent {
  @Input() event!: TimelineEvent;
}
