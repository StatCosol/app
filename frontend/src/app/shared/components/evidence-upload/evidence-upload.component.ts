import { Component, EventEmitter, Input, Output } from '@angular/core';

import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-evidence-upload',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="p-4 border border-gray-200 rounded-lg bg-white">
      <div class="text-sm font-semibold text-gray-800 mb-3">{{ title }}</div>

      <!-- File input -->
      <label class="block" for="evidence-file">
        <span class="sr-only">Choose evidence file</span>
        <input
          id="evidence-file"
          name="evidenceFile"
          type="file"
          [accept]="accept"
          (change)="onFileSelected($event)"
          class="block w-full text-sm text-gray-500
            file:mr-3 file:py-2 file:px-4
            file:rounded file:border-0
            file:text-sm file:font-medium
            file:bg-gray-100 file:text-gray-700
            hover:file:bg-gray-200
            cursor-pointer"
        />
      </label>

      <!-- File info -->
      @if (selectedFile) {
<div class="mt-2 text-xs text-gray-600">
        {{ selectedFile.name }} ({{ formatFileSize(selectedFile.size) }})
      </div>
}

      <!-- Note textarea -->
      <textarea autocomplete="off"
        id="evidence-note"
        name="evidenceNote"
        class="mt-3 w-full border border-gray-300 rounded-md p-2 text-sm focus:ring-1 focus:ring-brand-500 focus:border-brand-500"
        rows="2"
        [placeholder]="notePlaceholder"
        [(ngModel)]="note"
      ></textarea>

      <!-- Actions -->
      <div class="mt-3 flex items-center gap-3">
        <button
          class="px-4 py-2 rounded-md text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed"
          [disabled]="!selectedFile || uploading"
          (click)="onUpload()"
        >
          @if (!uploading) {
<span>{{ uploadLabel }}</span>
}
          @if (uploading) {
<span>Uploading…</span>
}
        </button>

        @if (selectedFile && !uploading) {
<button
         
          class="px-3 py-2 rounded-md text-sm text-gray-600 hover:text-gray-800"
          (click)="clear()"
        >
          Clear
        </button>
}
      </div>

      <!-- Error -->
      @if (error) {
<div class="mt-2 text-xs text-red-600">{{ error }}</div>
}
    </div>
  `,
})
export class EvidenceUploadComponent {
  @Input() title = 'Upload Evidence';
  @Input() uploadLabel = 'Upload';
  @Input() notePlaceholder = 'Note (optional)';
  @Input() accept = '.pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx,.zip';
  @Input() maxSizeMb = 10;
  @Input() uploading = false;

  @Output() uploaded = new EventEmitter<{ file: File; note?: string }>();

  selectedFile?: File;
  note = '';
  error = '';

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input?.files?.[0];
    this.error = '';

    if (!file) {
      this.selectedFile = undefined;
      return;
    }

    if (file.size > this.maxSizeMb * 1024 * 1024) {
      this.error = `File exceeds ${this.maxSizeMb} MB limit.`;
      this.selectedFile = undefined;
      return;
    }

    this.selectedFile = file;
  }

  onUpload(): void {
    if (!this.selectedFile) return;
    this.uploaded.emit({
      file: this.selectedFile,
      note: this.note?.trim() || undefined,
    });
  }

  clear(): void {
    this.selectedFile = undefined;
    this.note = '';
    this.error = '';
  }

  formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}
