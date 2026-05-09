import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'ui-action-footer-bar',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="flex justify-end gap-2">
      <button type="button" class="px-3 py-2 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700" (click)="cancel.emit()">
        {{ cancelLabel }}
      </button>
      <button type="button" class="px-3 py-2 rounded-lg text-sm font-semibold text-white bg-blue-700 disabled:opacity-60" [disabled]="saveDisabled" (click)="save.emit()">
        {{ saveLabel }}
      </button>
    </div>
  `,
})
export class ActionFooterBarComponent {
  @Input() cancelLabel = 'Cancel';
  @Input() saveLabel = 'Save';
  @Input() saveDisabled = false;

  // eslint-disable-next-line @angular-eslint/no-output-native
  @Output() cancel = new EventEmitter<void>();
  @Output() save = new EventEmitter<void>();
}
