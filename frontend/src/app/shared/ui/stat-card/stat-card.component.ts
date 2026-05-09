import { Component, Input , ChangeDetectionStrategy} from '@angular/core';
import { CommonModule } from '@angular/common';

export type StatCardColor = 'primary' | 'success' | 'warning' | 'error' | 'info' | 'gray';

@Component({
  selector: 'ui-stat-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  template: `
    <div class="rounded-xl border p-6 shadow-sm hover:shadow-md transition-shadow duration-200 h-full min-h-[120px]"
         [ngClass]="cardBgClass">
      <div class="flex items-start justify-between">
        <div class="flex-1">
          <p class="text-xs font-semibold uppercase tracking-wider" [ngClass]="labelClass">{{ label }}</p>
          <p class="mt-2 text-3xl font-bold" [ngClass]="valueClass">{{ value }}</p>
          <div *ngIf="trend !== undefined" class="mt-2 flex items-center text-sm font-medium" [ngClass]="trendColorClass">
            <svg *ngIf="trend > 0" class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 10l7-7m0 0l7 7m-7-7v18"></path>
            </svg>
            <svg *ngIf="trend < 0" class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3"></path>
            </svg>
            <span>{{ trendText }}</span>
          </div>
          <p *ngIf="description" class="mt-2 text-sm" [ngClass]="descClass">{{ description }}</p>
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
      primary: 'bg-blue-50 border-blue-200',
      success: 'bg-emerald-50 border-emerald-200',
      warning: 'bg-amber-50 border-amber-200',
      error: 'bg-red-50 border-red-200',
      info: 'bg-sky-50 border-sky-200',
      gray: 'bg-gray-50 border-gray-200',
    };
    return colors[this.color] || colors.primary;
  }

  get labelClass(): string {
    const colors: Record<StatCardColor, string> = {
      primary: 'text-blue-600',
      success: 'text-emerald-600',
      warning: 'text-amber-600',
      error: 'text-red-600',
      info: 'text-sky-600',
      gray: 'text-gray-500',
    };
    return colors[this.color] || colors.primary;
  }

  get valueClass(): string {
    const colors: Record<StatCardColor, string> = {
      primary: 'text-blue-900',
      success: 'text-emerald-900',
      warning: 'text-amber-900',
      error: 'text-red-900',
      info: 'text-sky-900',
      gray: 'text-gray-800',
    };
    return colors[this.color] || colors.primary;
  }

  get descClass(): string {
    const colors: Record<StatCardColor, string> = {
      primary: 'text-blue-600/80',
      success: 'text-emerald-600/80',
      warning: 'text-amber-600/80',
      error: 'text-red-600/80',
      info: 'text-sky-600/80',
      gray: 'text-gray-500',
    };
    return colors[this.color] || colors.primary;
  }

  get iconBgClass(): string {
    const colors: Record<StatCardColor, string> = {
      primary: 'bg-blue-100 text-blue-600',
      success: 'bg-emerald-100 text-emerald-600',
      warning: 'bg-amber-100 text-amber-600',
      error: 'bg-red-100 text-red-600',
      info: 'bg-sky-100 text-sky-600',
      gray: 'bg-gray-100 text-gray-600',
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
