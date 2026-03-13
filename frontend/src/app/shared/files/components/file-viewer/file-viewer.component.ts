import { Component, Input } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FileMeta } from '../../models/file.model';

@Component({
  selector: 'app-file-viewer',
  standalone: true,
  imports: [CommonModule, DatePipe],
  templateUrl: './file-viewer.component.html',
})
export class FileViewerComponent {
  @Input() file?: FileMeta;

  open(): void {
    if (!this.file?.url) return;
    window.open(this.file.url, '_blank');
  }

  get sizeLabel(): string {
    if (!this.file?.sizeBytes) return '';
    const kb = this.file.sizeBytes / 1024;
    if (kb < 1024) return `${kb.toFixed(0)} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
  }
}
