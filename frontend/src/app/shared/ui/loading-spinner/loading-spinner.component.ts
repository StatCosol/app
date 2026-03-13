import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

export type SpinnerSize = 'sm' | 'md' | 'lg' | 'xl';
export type SpinnerColor = 'primary' | 'white' | 'gray';

@Component({
  selector: 'ui-loading-spinner',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div [ngClass]="containerClasses">
      <svg [ngClass]="spinnerClasses" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      <span *ngIf="text" [ngClass]="textClasses">{{ text }}</span>
    </div>
  `
})
export class LoadingSpinnerComponent {
  @Input() size: SpinnerSize = 'md';
  @Input() color: SpinnerColor = 'primary';
  @Input() text = '';
  @Input() fullScreen = false;
  @Input() overlay = false;

  get containerClasses(): string {
    const base = 'flex items-center justify-center';

    if (this.fullScreen) {
      return `${base} fixed inset-0 z-50 bg-white`;
    }

    if (this.overlay) {
      return `${base} absolute inset-0 z-10 bg-white/85 backdrop-blur-[4px]`;
    }

    return base;
  }

  get spinnerClasses(): string {
    const sizeClasses: Record<SpinnerSize, string> = {
      sm: 'h-4 w-4',
      md: 'h-6 w-6',
      lg: 'h-8 w-8',
      xl: 'h-12 w-12',
    };

    const colorClasses: Record<SpinnerColor, string> = {
      primary: 'text-accent-400',
      white: 'text-white',
      gray: 'text-gray-400',
    };

    return `animate-spin ${sizeClasses[this.size]} ${colorClasses[this.color]}`;
  }

  get textClasses(): string {
    const colorClasses: Record<SpinnerColor, string> = {
      primary: 'text-gray-600',
      white: 'text-white',
      gray: 'text-gray-500',
    };

    return `ml-3 text-sm font-medium ${colorClasses[this.color]}`;
  }
}
