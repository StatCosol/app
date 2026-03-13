import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'sla-age-badge',
  standalone: true,
  imports: [CommonModule],
  template: `<span class="chip" [ngClass]="isBreached ? 'bad' : 'ok'">{{ ageLabel }}</span>`,
  styles: [
    `.chip { font-size: 11px; font-weight: 700; border-radius: 9999px; padding: 2px 8px; }`,
    `.ok { background:#dcfce7; color:#166534; }`,
    `.bad { background:#fee2e2; color:#991b1b; }`,
  ],
})
export class SlaAgeBadgeComponent {
  @Input() openedAt: string | Date | null = null;
  @Input() slaHours = 24;

  get ageHours(): number {
    if (!this.openedAt) return 0;
    const start = new Date(this.openedAt).getTime();
    if (Number.isNaN(start)) return 0;
    return Math.max(0, Math.floor((Date.now() - start) / (1000 * 60 * 60)));
  }

  get isBreached(): boolean {
    return this.ageHours > (this.slaHours || 0);
  }

  get ageLabel(): string {
    return `SLA ${this.ageHours}h`;
  }
}
