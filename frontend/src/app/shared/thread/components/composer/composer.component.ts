import { IconComponent } from '../../../ui/icon/icon.component';
import { Component, Input, Output, EventEmitter } from '@angular/core';

import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-composer',
  standalone: true,
  imports: [IconComponent, FormsModule],
  templateUrl: './composer.component.html',
})
export class ComposerComponent {
  @Input() disabled = false;
  @Input() clearOnSend = true;
  @Input() sending = false;
  @Input() placeholder = 'Type your reply...';
  @Output() send = new EventEmitter<{ message: string; files: File[] }>();

  message = '';
  files: File[] = [];

  get validationError(): string {
    if (this.files.length > 5) return 'Attach up to five files per reply. Remove extra files before sending.';
    const types: Record<string, string> = {
      pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
      xls: 'application/vnd.ms-excel',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
    for (const file of this.files) {
      if (file.size > 10 * 1024 * 1024) return `${file.name} exceeds 10 MB. Choose a smaller file.`;
      const dot = file.name.lastIndexOf('.');
      const extension = dot > 0 ? file.name.slice(dot + 1).toLowerCase() : '';
      if (!types[extension] || types[extension] !== file.type) {
        return `${file.name} is not a supported attachment. Choose a PDF, PNG, JPEG, XLS or XLSX file.`;
      }
    }
    return this.files.length && !this.message.trim() ? 'Enter a reply message before sending attachments.' : '';
  }

  onFiles(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.files = Array.from(input.files || []);
    input.value = '';
  }

  removeFile(index: number): void {
    this.files.splice(index, 1);
  }

  submit(): void {
    if (this.disabled || this.sending) return;
    const msg = this.message.trim();
    if (!msg || this.validationError) return;
    this.send.emit({ message: msg, files: [...this.files] });
    if (this.clearOnSend) { this.message = ''; this.files = []; }
  }
}
