import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'outline' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

@Component({
  selector: 'ui-button',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <ng-container *ngIf="routerLink; else buttonTemplate">
      <a [routerLink]="routerLink"
         [ngClass]="buttonClasses"
         [style]="buttonStyle"
         [class.pointer-events-none]="disabled"
         [class.opacity-50]="disabled">
        <ng-container *ngTemplateOutlet="contentTemplate"></ng-container>
      </a>
    </ng-container>

    <ng-template #buttonTemplate>
      <button [type]="type"
              [disabled]="disabled || loading"
              [ngClass]="buttonClasses"
              [style]="buttonStyle"
              (click)="handleClick($event)">
        <ng-container *ngTemplateOutlet="contentTemplate"></ng-container>
      </button>
    </ng-template>

    <ng-template #contentTemplate>
      <svg *ngIf="loading" class="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      <ng-content></ng-content>
    </ng-template>
  `
})
export class ActionButtonComponent {
  @Input() variant: ButtonVariant = 'primary';
  @Input() size: ButtonSize = 'md';
  @Input() type: 'button' | 'submit' | 'reset' = 'button';
  @Input() disabled = false;
  @Input() loading = false;
  @Input() fullWidth = false;
  @Input() routerLink?: string | any[];

  @Output() clicked = new EventEmitter<MouseEvent>();

  handleClick(event: MouseEvent): void {
    if (!this.disabled && !this.loading) {
      this.clicked.emit(event);
    }
  }

  get buttonClasses(): string {
    const base = 'inline-flex items-center justify-center font-semibold rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed';

    const sizeClasses: Record<ButtonSize, string> = {
      sm: 'px-3 py-1.5 text-xs',
      md: 'px-4 py-2.5 text-sm',
      lg: 'px-6 py-3 text-base',
    };

    const variantClasses: Record<ButtonVariant, string> = {
      primary: 'text-white focus:ring-statco-blue shadow-sm hover:shadow-md hover:-translate-y-px',
      secondary: 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 focus:ring-gray-500 shadow-sm hover:-translate-y-px',
      danger: 'text-white focus:ring-error-500 shadow-sm hover:shadow-md hover:-translate-y-px',
      outline: 'bg-transparent border-2 border-statco-blue text-statco-blue hover:bg-statco-blue hover:text-white focus:ring-statco-blue',
      ghost: 'bg-transparent text-gray-700 hover:bg-gray-100 focus:ring-gray-500',
    };

    const widthClass = this.fullWidth ? 'w-full' : '';

    return `${base} ${sizeClasses[this.size]} ${variantClasses[this.variant]} ${widthClass}`;
  }

  get buttonStyle(): string {
    if (this.variant === 'primary') {
      return 'background: linear-gradient(135deg, #0a2656 0%, #0f3470 100%)';
    }
    if (this.variant === 'danger') {
      return 'background: linear-gradient(135deg, #dc2626 0%, #ef4444 100%)';
    }
    return '';
  }
}
