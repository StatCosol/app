import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FileVersionItem } from './file-preview.model';

@Component({
  selector: 'ui-version-history-panel',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="border border-gray-200 rounded-lg p-3">
      <div class="text-sm font-semibold text-gray-800 mb-2">Version History</div>
      @if (!versions.length) {
<div class="text-xs text-gray-500">No historical versions.</div>
}
      @for (v of versions; track v) {
<div class="flex items-center justify-between gap-2 py-1.5 border-t border-gray-100 first:border-t-0">
        <div>
          <div class="text-xs font-medium text-gray-800">{{ v.label }}</div>
          <div class="text-[11px] text-gray-500">{{ v.createdAt ? (v.createdAt | date:'d MMM y, h:mm a') : '-' }} @if (v.uploaderName) {
<span>• {{ v.uploaderName }}</span>
}</div>
        </div>
        <button
          type="button"
          class="text-xs font-semibold text-blue-700 hover:underline"
          (click)="open.emit(v)"
          [disabled]="!v.url"
        >Open</button>
      </div>
}
    </div>
  `,
})
export class VersionHistoryPanelComponent {
  @Input() versions: FileVersionItem[] = [];
  @Output() open = new EventEmitter<FileVersionItem>();
}

