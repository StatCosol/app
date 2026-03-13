import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'actor-badge',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span class="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
      <span>{{ actorName || 'System' }}</span>
      <span *ngIf="actorRole" class="text-slate-500">({{ actorRole }})</span>
    </span>
  `,
})
export class ActorBadgeComponent {
  @Input() actorName: string | null = null;
  @Input() actorRole: string | null = null;
}
