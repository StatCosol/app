import { Component, Input , ChangeDetectionStrategy} from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl } from '@angular/forms';

@Component({
  selector: 'ui-validation-messages',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  template: `
    <div *ngIf="control?.invalid && (control?.dirty || control?.touched)" class="mt-1.5 text-sm text-error-600">
      <span *ngFor="let msg of errorMessages">{{ msg }}</span>
    </div>
  `,
})
export class ValidationMessagesComponent {
  @Input() control: AbstractControl | null = null;

  get errorMessages(): string[] {
    if (!this.control?.errors) return [];
    return Object.values(this.control.errors)
      .filter((v): v is string => typeof v === 'string')
      .slice(0, 1); // Show first error only
  }
}
