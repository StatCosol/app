import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'ui-status-chip',
  standalone: true,
  imports: [CommonModule],
  template: `<span class="chip" [ngClass]="klass">{{ label }}</span>`,
  styles: [
    `.chip { font-size: 11px; font-weight: 700; border-radius: 9999px; padding: 2px 8px; text-transform: uppercase; }`,
    `.ok { background:#dcfce7; color:#166534; }`,
    `.warn { background:#fef3c7; color:#92400e; }`,
    `.bad { background:#fee2e2; color:#991b1b; }`,
    `.neutral { background:#e5e7eb; color:#374151; }`,
  ],
})
export class StatusChipComponent {
  @Input() status = '';

  get label(): string {
    return String(this.status || 'UNKNOWN').replace(/_/g, ' ');
  }

  get klass(): string {
    const s = String(this.status || '').toUpperCase();
    if (['APPROVED', 'COMPLETED', 'CLOSED', 'RESOLVED', 'ACTIVE', 'COMPLIANT'].includes(s)) return 'ok';
    if (['PENDING', 'IN_PROGRESS', 'DUE_SOON', 'UNDER_REVIEW'].includes(s)) return 'warn';
    if (['REJECTED', 'FAILED', 'OVERDUE', 'INACTIVE', 'CANCELLED'].includes(s)) return 'bad';
    return 'neutral';
  }
}
