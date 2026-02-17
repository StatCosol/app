import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  standalone: true,
  selector: 'app-kpi-card',
  imports: [CommonModule],
  template: `
    <div class="stat-card group hover:shadow-lg transition-all duration-300 cursor-default">
      <div class="stat-label">{{label}}</div>
      <div class="stat-value">{{value}}</div>
      <div class="text-xs text-gray-500 mt-2" *ngIf="sub">{{sub}}</div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
    }
  `]
})
export class KpiCardComponent {
  @Input() label = '';
  @Input() value: any = 0;
  @Input() sub?: string;
}
