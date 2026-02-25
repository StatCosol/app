import { Component, Input, forwardRef, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR, FormsModule } from '@angular/forms';

export interface SelectOption {
  value: any;
  label: string;
  disabled?: boolean;
}

@Component({
  selector: 'ui-form-select',
  standalone: true,
  imports: [CommonModule, FormsModule],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => FormSelectComponent),
      multi: true,
    },
  ],
  template: `
    <div class="w-full">
      <label *ngIf="label" [for]="selectId" class="block text-sm font-medium text-gray-700 mb-1.5">
        {{ label }}
        <span *ngIf="required" class="text-error-500">*</span>
      </label>
      <div class="relative">
        <select
          [id]="selectId"
          [disabled]="disabled"
          [ngClass]="selectClassStr"
          [ngModel]="value"
          (ngModelChange)="onInternalChange($event)"
          (blur)="onTouched()"
        >
          <option *ngIf="placeholder" [ngValue]="null" disabled>{{ placeholder }}</option>
          <option *ngFor="let opt of options" [ngValue]="opt.value" [disabled]="opt.disabled">
            {{ opt.label }}
          </option>
        </select>
        <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
          <svg class="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd" />
          </svg>
        </div>
      </div>
      <p *ngIf="hint && !error" class="mt-1.5 text-sm text-gray-500">{{ hint }}</p>
      <p *ngIf="error" class="mt-1.5 text-sm text-error-600">{{ error }}</p>
    </div>
  `
})
export class FormSelectComponent implements ControlValueAccessor, OnChanges {
  @Input() label = '';
  @Input() placeholder = '';
  @Input() options: SelectOption[] = [];
  @Input() hint = '';
  @Input() error = '';
  @Input() required = false;
  @Input() disabled = false;
  @Input() selectId = `select-${Math.random().toString(36).substr(2, 9)}`;

  // Pre-compute CSS classes to avoid new string refs on every CD cycle
  selectClassStr = '';

  value: any = null;
  onChange: (value: any) => void = () => {};
  onTouched: () => void = () => {};

  writeValue(value: any): void {
    this.value = value;
  }

  registerOnChange(fn: (value: any) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
    this.updateSelectClasses();
  }

  onInternalChange(val: any): void {
    this.value = val;
    this.onChange(this.value);
  }

  ngOnChanges(): void {
    this.updateSelectClasses();
  }

  private updateSelectClasses(): void {
    const base = 'block w-full rounded-lg border text-sm transition-all duration-200 appearance-none bg-white focus:outline-none focus:ring-2 focus:ring-offset-0 pr-10 py-2.5 pl-3';

    const stateClasses = this.error
      ? 'border-error-300 text-error-900 focus:ring-error-500 focus:border-error-500'
      : this.disabled
        ? 'border-gray-200 bg-gray-50 text-gray-500 cursor-not-allowed'
        : 'border-gray-300 text-gray-900 focus:ring-accent-400 focus:border-accent-400';

    this.selectClassStr = `${base} ${stateClasses}`;
  }
}
