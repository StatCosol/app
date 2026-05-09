import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'ui-due-date-badge',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span class="chip" [ngClass]="klass">
      {{ dueDate ? (dueDate | date:'d MMM y') : 'No Due Date' }}
    </span>
  `,
  styles: [
    `.chip { font-size: 11px; font-weight: 600; border-radius: 9999px; padding: 2px 8px; }`,
    `.ok { background:#dcfce7; color:#166534; }`,
    `.warn { background:#fef3c7; color:#92400e; }`,
    `.bad { background:#fee2e2; color:#991b1b; }`,
    `.neutral { background:#e5e7eb; color:#374151; }`,
  ],
})
export class DueDateBadgeComponent {
  @Input() dueDate: string | Date | null = null;

  get klass(): string {
    if (!this.dueDate) return 'neutral';
    const due = new Date(this.dueDate).getTime();
    if (Number.isNaN(due)) return 'neutral';
    const now = Date.now();
    const days = Math.floor((due - now) / (1000 * 60 * 60 * 24));
    if (days < 0) return 'bad';
    if (days <= 3) return 'warn';
    return 'ok';
  }
}
