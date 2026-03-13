import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-composer',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './composer.component.html',
})
export class ComposerComponent {
  @Input() disabled = false;
  @Input() sending = false;
  @Input() placeholder = 'Type your reply...';
  @Output() send = new EventEmitter<{ message: string; files: File[] }>();

  message = '';
  files: File[] = [];

  onFiles(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.files = Array.from(input.files || []);
  }

  removeFile(index: number): void {
    this.files.splice(index, 1);
  }

  submit(): void {
    if (this.disabled || this.sending) return;
    const msg = this.message.trim();
    if (!msg && this.files.length === 0) return;
    this.send.emit({ message: msg, files: [...this.files] });
    this.message = '';
    this.files = [];
  }
}
