import { Component, Input, forwardRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR, FormsModule } from '@angular/forms';

@Component({
  selector: 'ui-form-input',
  standalone: true,
  imports: [CommonModule, FormsModule],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => FormInputComponent),
      multi: true,
    },
  ],
  template: `
    <div class="w-full">
      <label *ngIf="label" [for]="inputId" class="block text-sm font-medium text-gray-700 mb-1.5">
        {{ label }}
        <span *ngIf="required" class="text-error-500">*</span>
      </label>
      <div class="relative">
        <div *ngIf="prefixIcon" class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <ng-content select="[slot=prefix]"></ng-content>
        </div>
        <input
          [id]="inputId"
          [type]="type"
          [placeholder]="placeholder"
          [disabled]="disabled"
          [readonly]="readonly"
          [ngClass]="inputClasses"
          [value]="value"
          (input)="onInput($event)"
          (blur)="onTouched()"
        />
        <div *ngIf="suffixIcon" class="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
          <ng-content select="[slot=suffix]"></ng-content>
        </div>
      </div>
      <p *ngIf="hint && !error" class="mt-1.5 text-sm text-gray-500">{{ hint }}</p>
      <p *ngIf="error" class="mt-1.5 text-sm text-error-600">{{ error }}</p>
    </div>
  `
})
export class FormInputComponent implements ControlValueAccessor {
  @Input() label = '';
  @Input() placeholder = '';
  @Input() type: 'text' | 'email' | 'password' | 'number' | 'tel' | 'url' | 'search' = 'text';
  @Input() hint = '';
  @Input() error = '';
  @Input() required = false;
  @Input() disabled = false;
  @Input() readonly = false;
  @Input() prefixIcon = false;
  @Input() suffixIcon = false;
  @Input() inputId = `input-${Math.random().toString(36).substr(2, 9)}`;

  value = '';
  onChange: (value: string) => void = () => {};
  onTouched: () => void = () => {};

  writeValue(value: string): void {
    this.value = value || '';
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  onInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.value = target.value;
    this.onChange(this.value);
  }

  get inputClasses(): string {
    const base = 'block w-full rounded-lg border text-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-0';
    const padding = this.prefixIcon ? 'pl-10 pr-3 py-2.5' : this.suffixIcon ? 'pl-3 pr-10 py-2.5' : 'px-3 py-2.5';

    const stateClasses = this.error
      ? 'border-error-300 text-error-900 placeholder-error-300 focus:ring-error-500 focus:border-error-500'
      : this.disabled
        ? 'border-gray-200 bg-gray-50 text-gray-500 cursor-not-allowed'
        : 'border-gray-300 text-gray-900 placeholder-gray-400 focus:ring-accent-400 focus:border-accent-400';

    return `${base} ${padding} ${stateClasses}`;
  }
}
