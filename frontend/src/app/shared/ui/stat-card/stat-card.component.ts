import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

export type StatCardColor = 'primary' | 'success' | 'warning' | 'error' | 'info' | 'gray';

@Component({
  selector: 'ui-stat-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="rounded-xl border border-gray-200 p-6 shadow-card hover:shadow-card-hover transition-shadow duration-200 h-full min-h-[120px]"
         [ngClass]="cardBgClass">
      <div class="flex items-start justify-between">
        <div class="flex-1">
          <p class="text-sm font-medium text-white uppercase tracking-wide">{{ label }}</p>
          <p class="mt-2 text-3xl font-bold text-white">{{ value }}</p>
          <div *ngIf="trend !== undefined" class="mt-2 flex items-center text-sm font-medium text-white" [ngClass]="trendColorClass">
            <svg *ngIf="trend > 0" class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 10l7-7m0 0l7 7m-7-7v18"></path>
            </svg>
            <svg *ngIf="trend < 0" class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3"></path>
            </svg>
            <span>{{ trendText }}</span>
          </div>
          <p *ngIf="description" class="mt-2 text-sm text-white/90">{{ description }}</p>
        </div>
        <div *ngIf="icon" class="ml-4 p-3 rounded-lg" [ngClass]="iconBgClass">
          <ng-content select="[slot=icon]"></ng-content>
        </div>
      </div>
    </div>
  `
})
export class StatCardComponent {
  @Input() label = '';
  @Input() value: string | number = '';
  @Input() trend?: number;
  @Input() trendLabel = 'vs last period';
  @Input() description = '';
  @Input() color: StatCardColor = 'primary';
  @Input() icon = false;

  get cardBgClass(): string {
    const colors: Record<StatCardColor, string> = {
      primary: 'bg-statco-blue text-white',
      success: 'bg-success-600 text-white',
      warning: 'bg-warning-600 text-white',
      error: 'bg-error-600 text-white',
      info: 'bg-info-600 text-white',
      gray: 'bg-gray-700 text-white',
    };
    return colors[this.color] || colors.primary;
  }
  readonly valueColorClass = 'text-white';

  get iconBgClass(): string {
    const colors: Record<StatCardColor, string> = {
      primary: 'bg-statco-blue text-white',
      success: 'bg-success-600 text-white',
      warning: 'bg-warning-600 text-white',
      error: 'bg-error-600 text-white',
      info: 'bg-info-600 text-white',
      gray: 'bg-gray-600 text-white',
    };
    return colors[this.color];
  }

  get trendColorClass(): string {
    if (this.trend === undefined) return '';
    return this.trend >= 0 ? 'text-success-600' : 'text-error-600';
  }

  get trendText(): string {
    if (this.trend === undefined) return '';
    const sign = this.trend >= 0 ? '+' : '';
    return `${sign}${this.trend}% ${this.trendLabel}`;
  }
}
