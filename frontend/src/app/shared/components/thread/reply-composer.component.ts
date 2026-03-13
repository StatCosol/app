import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'reply-composer',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="border border-gray-200 rounded-lg bg-white p-3">
      <textarea
        [(ngModel)]="text"
        [placeholder]="placeholder"
        rows="3"
        class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
      ></textarea>
      <div class="flex justify-between items-center mt-2">
        <span class="text-xs text-gray-400">{{ text.length }}/{{ maxLength }}</span>
        <button type="button" class="px-3 py-2 rounded-lg bg-blue-700 text-white text-sm font-semibold disabled:opacity-60" [disabled]="busy || !text.trim()" (click)="submit()">
          {{ busy ? 'Sending...' : 'Send Reply' }}
        </button>
      </div>
    </div>
  `,
})
export class ReplyComposerComponent {
  @Input() placeholder = 'Type your reply...';
  @Input() maxLength = 2000;
  @Input() busy = false;
  @Output() send = new EventEmitter<string>();

  text = '';

  submit(): void {
    const value = this.text.trim();
    if (!value) return;
    this.send.emit(value);
    this.text = '';
  }
}
