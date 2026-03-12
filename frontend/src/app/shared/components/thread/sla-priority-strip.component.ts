import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PriorityChipComponent } from '../status/priority-chip.component';
import { SlaAgeBadgeComponent } from '../status/sla-age-badge.component';
import { StatusChipComponent } from '../status/status-chip.component';

@Component({
  selector: 'sla-priority-strip',
  standalone: true,
  imports: [CommonModule, PriorityChipComponent, SlaAgeBadgeComponent, StatusChipComponent],
  template: `
    <div class="flex items-center gap-2 p-2 rounded-lg bg-gray-50 border border-gray-200">
      <priority-chip [priority]="priority"></priority-chip>
      <status-chip [status]="status"></status-chip>
      <sla-age-badge [openedAt]="openedAt" [slaHours]="slaHours"></sla-age-badge>
    </div>
  `,
})
export class SlaPriorityStripComponent {
  @Input() priority = 'MEDIUM';
  @Input() status = 'OPEN';
  @Input() openedAt: string | Date | null = null;
  @Input() slaHours = 24;
}
