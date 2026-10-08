import { Component, HostBinding, Input, Output, EventEmitter , ChangeDetectionStrategy} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Params, RouterModule } from '@angular/router';
import { IconComponent, IconName } from '../icon/icon.component';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'success' | 'warning' | 'outline' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

@Component({
  selector: 'ui-button',
  host: { class: 'bs-surface' },
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterModule, IconComponent],
  template: `
    @if (routerLink) {

      <a [routerLink]="disabled || loading ? null : routerLink"
         [queryParams]="queryParams"
         [attr.aria-disabled]="disabled || loading"
         [attr.aria-busy]="loading"
         [attr.aria-label]="iconOnly ? label : null"
         [attr.title]="iconOnly ? label : null"
         [attr.data-action-icon]="iconOnly ? icon : null"
         [class.ui-icon-action]="iconOnly"
         [attr.tabindex]="disabled || loading ? -1 : null"
         [ngClass]="buttonClasses"
         [style]="buttonStyle"
         [class.pointer-events-none]="disabled || loading"
         [class.opacity-50]="disabled">
        <ng-container *ngTemplateOutlet="contentTemplate"></ng-container>
      </a>

} @else {

      <button [type]="type"
              [attr.aria-label]="iconOnly ? label : null"
              [attr.title]="iconOnly ? label : null"
              [attr.data-action-icon]="iconOnly ? icon : null"
              [class.ui-icon-action]="iconOnly"
              [disabled]="disabled || loading"
              [attr.aria-busy]="loading"
              [ngClass]="buttonClasses"
              [style]="buttonStyle"
              (click)="handleClick($event)">
        <ng-container *ngTemplateOutlet="contentTemplate"></ng-container>
      </button>

}



    @if (iconOnly && label) {
      <span class="action-tooltip" role="tooltip">{{ loading ? label + " (processing)" : label }}</span>
    }
    <ng-template #contentTemplate>
      @if (loading) {
<svg aria-hidden="true" class="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
}
      @if (icon && !loading) { <ui-icon [name]="icon" [size]="20" /> }
      <span [class.action-label-hidden]="iconOnly"><ng-content></ng-content></span>
    </ng-template>
  `,
  styles: [
    /* The host has no display by default (inline), which adds baseline/line-
       height space and makes the button sit slightly high next to inputs in
       flex/grid toolbars. inline-flex makes it a tight box that aligns cleanly
       everywhere the button is used. */
    ':host { display: inline-flex; vertical-align: middle; position: relative; }',
    /* fullWidth must still span the parent — an inline-flex host would shrink
       to content and defeat the inner w-full. */
    ':host(.ui-button--full) { display: flex; width: 100%; }',
    '.ui-icon-action { width: 40px !important; min-width: 40px !important; max-width: 40px !important; height: 40px !important; min-height: 40px !important; max-height: 40px !important; box-sizing: border-box; padding: 0 !important; gap: 0; border-radius: 10px; background: #fff !important; color: #334155 !important; border: 1px solid #dbe3ed !important; box-shadow: none !important; }',
    '.ui-icon-action[data-action-icon="check-circle"] { color: #15803d !important; }',
    '.ui-icon-action[data-action-icon="x-circle"], .ui-icon-action[data-action-icon="trash"], .ui-icon-action[data-action-icon="user-minus"] { color: #dc2626 !important; }',
    '.ui-icon-action:hover:not(:disabled) { background: #eff6ff !important; border-color: #93c5fd !important; }',
    '.btn:not(.ui-icon-action) { height: 40px !important; min-height: 40px !important; max-height: 40px !important; min-width: 80px; padding: 0 12px !important; box-sizing: border-box; white-space: nowrap; }',
    '@media (pointer: coarse) { .btn:not(.ui-icon-action) { height: 44px !important; min-height: 44px !important; max-height: 44px !important; } }',
    '.action-label-hidden { display: none; }',
    '.action-tooltip { display: none; position: absolute; bottom: calc(100% + 8px); left: 50%; transform: translateX(-50%); z-index: 1000; padding: 6px 10px; border-radius: 6px; background: #172033; color: white; font-size: 12px; font-weight: 500; line-height: 1.4; width: max-content; max-width: 240px; pointer-events: none; visibility: hidden; opacity: 0; }',
    ':host(:hover) .action-tooltip, :host(:focus-within) .action-tooltip { display: block; visibility: visible; opacity: 1; }',
    '@media (pointer: coarse) { .ui-icon-action { width: 44px !important; min-width: 44px !important; max-width: 44px !important; height: 44px !important; min-height: 44px !important; max-height: 44px !important; } }',
  ],
})
export class ActionButtonComponent {
  @HostBinding('class.ui-button--full') get hostFullWidth(): boolean {
    return this.fullWidth && !this.iconOnly;
  }

  @Input() icon?: IconName;
  @Input() iconOnly = false;
  @Input() label = '';

  @Input() variant: ButtonVariant = 'primary';
  @Input() size: ButtonSize = 'md';
  @Input() type: 'button' | 'submit' | 'reset' = 'button';
  @Input() disabled = false;
  @Input() loading = false;
  @Input() fullWidth = false;
  @Input() routerLink?: string | any[];
  @Input() queryParams: Params | null = null;

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
      primary: 'text-white focus:ring-brand-800 shadow-sm hover:shadow-md hover:-translate-y-px active:translate-y-0',
      secondary: 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 focus:ring-gray-500 shadow-sm hover:-translate-y-px active:translate-y-0',
      danger: 'text-white focus:ring-error-500 shadow-sm hover:shadow-md hover:-translate-y-px active:translate-y-0',
      success: 'text-white focus:ring-emerald-500 shadow-sm hover:shadow-md hover:-translate-y-px active:translate-y-0',
      warning: 'text-white focus:ring-amber-500 shadow-sm hover:shadow-md hover:-translate-y-px active:translate-y-0',
      outline: 'bg-transparent border-2 border-brand-800 text-brand-800 hover:bg-brand-800 hover:text-white focus:ring-brand-800',
      ghost: 'bg-transparent text-gray-700 hover:bg-gray-100 focus:ring-gray-500',
    };

    const widthClass = this.fullWidth ? 'w-full' : '';

    const bootstrapVariants: Record<ButtonVariant, string> = {
      primary: 'btn-primary', secondary: 'btn-outline-secondary', danger: 'btn-danger',
      success: 'btn-success', warning: 'btn-warning', outline: 'btn-outline-primary', ghost: 'btn-light',
    };
    const bootstrapSize = this.iconOnly ? '' : this.size === 'sm' ? 'btn-sm' : this.size === 'lg' ? 'btn-lg' : '';
    return `btn ${bootstrapSize} ${bootstrapVariants[this.variant]} ${base} ${sizeClasses[this.size]} ${variantClasses[this.variant]} ${widthClass}`;
  }

  readonly buttonStyle = '';
}
