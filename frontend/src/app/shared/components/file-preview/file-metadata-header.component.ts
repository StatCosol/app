import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SharedFilePreviewData } from './file-preview.model';

@Component({
  selector: 'ui-file-metadata-header',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="border-b border-gray-200 p-4">
      <div class="flex items-start justify-between gap-4">
        <div>
          <h3 class="text-base font-semibold text-gray-900">{{ file?.name || file?.fileName || 'File Preview' }}</h3>
          <div class="mt-1 text-xs text-gray-500 flex flex-wrap gap-x-3 gap-y-1">
            <span *ngIf="file?.queryType">Type: {{ file?.queryType }}</span>
            <span *ngIf="file?.status">Status: {{ file?.status }}</span>
            <span *ngIf="file?.uploadedAt">Uploaded: {{ file?.uploadedAt | date:'d MMM y, h:mm a' }}</span>
            <span *ngIf="file?.uploaderName">By: {{ file?.uploaderName }}</span>
            <span *ngIf="file?.fileSize !== null && file?.fileSize !== undefined">Size: {{ formatSize(file?.fileSize) }}</span>
            <span *ngIf="file?.dueDate">Due: {{ file?.dueDate | date:'d MMM y' }}</span>
          </div>
        </div>
        <span *ngIf="file?.mimeType" class="rounded-full bg-gray-100 text-gray-700 text-[10px] font-semibold px-2 py-1 uppercase">
          {{ file?.mimeType }}
        </span>
      </div>
    </div>
  `,
})
export class FileMetadataHeaderComponent {
  @Input() file: SharedFilePreviewData | null = null;

  formatSize(size: number | null | undefined): string {
    if (!size || size <= 0) return '-';
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }
}
