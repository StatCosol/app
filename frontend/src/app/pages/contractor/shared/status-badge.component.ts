import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  standalone: true,
  selector: 'app-status-badge',
  imports: [CommonModule],
  template: `
    <span class="badge" [ngClass]="cssClass(status)">
      {{ status }}
    </span>
  `,
  styles: [`
    .badge{padding:4px 10px;border-radius:999px;font-size:12px;font-weight:600;display:inline-block}
    .PENDING{background:#eef2ff;color:#3730a3}
    .IN_PROGRESS{background:#dbeafe;color:#1e40af}
    .SUBMITTED{background:#ffedd5;color:#9a3412}
    .APPROVED{background:#dcfce7;color:#166534}
    .REJECTED{background:#fee2e2;color:#991b1b}
    .OVERDUE{background:#fee2e2;color:#991b1b}
  `]
})
export class StatusBadgeComponent {
  @Input() status: string = 'PENDING';
  cssClass(s: string) { return (s || 'PENDING').toUpperCase(); }
}
