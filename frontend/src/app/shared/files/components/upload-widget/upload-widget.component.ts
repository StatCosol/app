import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FileUploadService } from '../../services/file-upload.service';
import { UploadConfig, UploadResult } from '../../models/file.model';

@Component({
  selector: 'app-upload-widget',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './upload-widget.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UploadWidgetComponent {
  @Input() config: UploadConfig = {
    label: 'Upload',
    accept: '.pdf,.jpg,.jpeg,.png',
    maxSizeMB: 10,
    multiple: false,
    disabled: false,
    showDropzone: true,
  };

  /** Endpoint URL to POST FormData to */
  @Input() uploadUrl!: string;

  /** Extra fields appended to the FormData (month, itemId, etc.) */
  @Input() extraFields: Record<string, string> = {};

  @Output() uploaded = new EventEmitter<UploadResult>();
  @Output() uploadError = new EventEmitter<string>();

  progress = 0;
  uploading = false;
  dragOver = false;

  constructor(private uploader: FileUploadService, private cdr: ChangeDetectorRef) {}

  onPick(files: FileList | null): void {
    if (!files || files.length === 0) return;
    if (this.config.disabled || this.uploading) return;

    const file = files[0];
    const err = this.validate(file);
    if (err) {
      this.uploadError.emit(err);
      return;
    }

    const fd = new FormData();
    Object.entries(this.extraFields || {}).forEach(([k, v]) => fd.append(k, v));
    fd.append('file', file);

    this.uploading = true;
    this.progress = 0;
    this.cdr.markForCheck();

    this.uploader.upload(this.uploadUrl, fd).subscribe({
      next: e => {
        this.progress = e.progress;
        if (e.result) {
          this.uploaded.emit(e.result as UploadResult);
        }
        this.cdr.markForCheck();
      },
      error: () => {
        this.uploading = false;
        this.uploadError.emit('Upload failed. Please try again.');
        this.cdr.markForCheck();
      },
      complete: () => {
        this.uploading = false;
        this.cdr.markForCheck();
      },
    });
  }

  onDrop(ev: DragEvent): void {
    ev.preventDefault();
    ev.stopPropagation();
    this.dragOver = false;
    this.onPick(ev.dataTransfer?.files || null);
  }

  onDragOver(ev: DragEvent): void {
    ev.preventDefault();
    ev.stopPropagation();
    this.dragOver = true;
  }

  onDragLeave(ev: DragEvent): void {
    ev.preventDefault();
    this.dragOver = false;
  }

  private validate(file: File): string | null {
    const maxMB = this.config.maxSizeMB ?? 10;
    const sizeMB = file.size / (1024 * 1024);
    if (sizeMB > maxMB) return `File too large. Max allowed is ${maxMB} MB.`;

    if (this.config.accept) {
      const allowed = this.config.accept.split(',').map(s => s.trim().toLowerCase());
      const ext = '.' + (file.name.split('.').pop() || '').toLowerCase();
      if (!allowed.includes(ext)) return `Invalid file type. Allowed: ${this.config.accept}`;
    }
    return null;
  }
}
