import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'priority-chip',
  standalone: true,
  imports: [CommonModule],
  template: `<span class="chip" [ngClass]="klass">{{ priority || 'MEDIUM' }}</span>`,
  styles: [
    `.chip { font-size: 11px; font-weight: 700; border-radius: 9999px; padding: 2px 8px; text-transform: uppercase; }`,
    `.high { background:#fee2e2; color:#b91c1c; }`,
    `.medium { background:#fef3c7; color:#b45309; }`,
    `.low { background:#dcfce7; color:#15803d; }`,
  ],
})
export class PriorityChipComponent {
  @Input() priority = 'MEDIUM';

  get klass(): string {
    const p = String(this.priority || 'MEDIUM').toUpperCase();
    if (p === 'HIGH' || p === 'CRITICAL') return 'high';
    if (p === 'LOW') return 'low';
    return 'medium';
  }
}
