import { DialogFocusDirective } from '../../directives/dialog-focus.directive';
import { IconComponent } from '../../ui/icon/icon.component';
import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';

import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { SharedFilePreviewData, FileVersionItem } from './file-preview.model';
import { FileMetadataHeaderComponent } from './file-metadata-header.component';
import { VersionHistoryPanelComponent } from './version-history-panel.component';
import { RejectionReasonBoxComponent } from './rejection-reason-box.component';

@Component({
  selector: 'ui-file-preview-modal',
  standalone: true,
  imports: [DialogFocusDirective, IconComponent,
    FileMetadataHeaderComponent,
    VersionHistoryPanelComponent,
    RejectionReasonBoxComponent
],
  template: `
    @if (open) {
<div class="fixed inset-0 z-[1200] bg-slate-900/60 flex items-center justify-center p-4" (click)="closed.emit()">
      <div role="dialog" aria-modal="true" aria-label="File preview" uiDialogFocus (uiDialogEscape)="closed.emit()" class="file-preview-panel w-full max-w-5xl rounded-xl bg-white border border-gray-200 shadow-2xl overflow-hidden" (click)="$event.stopPropagation()">
        <ui-file-metadata-header [file]="file"></ui-file-metadata-header>

        <div class="file-preview-body grid grid-cols-1 lg:grid-cols-4 gap-4 p-4">
          <div class="lg:col-span-3 border border-gray-200 rounded-lg bg-gray-50 min-h-[420px] flex items-center justify-center overflow-hidden">
            @if (loading) {
<div class="text-sm text-gray-500">Loading preview...</div>
}
            @if (!loading && error) {
<div class="text-sm text-red-600 px-4">{{ error }}</div>
}

            @if (!loading && !error && mode === 'image' && file?.url) {
<img [src]="file?.url || ''" alt="Preview" class="max-h-[70vh] max-w-full object-contain" />
}
            @if (!loading && !error && mode === 'pdf' && safeUrl) {
<iframe title="Document preview" [src]="safeUrl" class="w-full h-[70vh]"></iframe>
}
            @if (!loading && !error && mode === 'none') {
<div class="text-sm text-gray-500 p-6 text-center">
              Preview is not available for this file type.
            </div>
}
          </div>

          <div class="space-y-3">
            <ui-rejection-reason-box [reason]="file?.rejectionReason || ''"></ui-rejection-reason-box>
            <ui-version-history-panel [versions]="file?.versions || []" (open)="openVersion.emit($event)"></ui-version-history-panel>
          </div>
        </div>

        <div class="file-preview-footer border-t border-gray-200 p-3 flex justify-end gap-2">
          <button type="button" class="standard-action px-3 py-2 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 bg-white" (click)="closed.emit()">Close</button>
          <button type="button" class="compact-action px-3 py-2 rounded-lg text-sm font-semibold text-white bg-brand-700" (click)="download.emit()" [disabled]="!file" title="Download" aria-label="Download" data-action-label="Download" data-action-icon="download"><ui-icon name="download" [size]="20" /></button>
        </div>
      </div>
    </div>
}
  `,
  styles: [`
    .file-preview-panel { max-height:calc(100dvh - 2rem); display:flex; flex-direction:column; min-width:0; }
    .file-preview-body { overflow:auto; min-height:0; }
    .file-preview-footer, ui-file-metadata-header { flex-shrink:0; }
    ui-file-metadata-header { max-height:24dvh; overflow:auto; }
    .file-preview-footer { flex-wrap:wrap; }
    iframe { border:0; }
    @media(max-width:640px) { .file-preview-body { padding:10px; } .file-preview-body > div { min-height:0; } }
  `],
})
export class SharedFilePreviewModalComponent implements OnChanges {
  @Input() open = false;
  @Input() file: SharedFilePreviewData | null = null;
  @Input() loading = false;
  @Input() error = '';

  @Output() closed = new EventEmitter<void>();
  @Output() download = new EventEmitter<void>();
  @Output() openVersion = new EventEmitter<FileVersionItem>();

  safeUrl: SafeResourceUrl | null = null;
  mode: 'image' | 'pdf' | 'none' = 'none';

  constructor(private readonly sanitizer: DomSanitizer) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['file']) {
      this.resolveMode();
    }
  }

  private resolveMode(): void {
    this.safeUrl = null;
    this.mode = 'none';

    const url = this.file?.url || '';
    if (!url) return;

    const mime = String(this.file?.mimeType || '').toLowerCase();
    if (mime.includes('pdf') || url.toLowerCase().endsWith('.pdf')) {
      this.mode = 'pdf';
      this.safeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(url);
      return;
    }

    if (mime.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(url)) {
      this.mode = 'image';
      return;
    }

    this.mode = 'none';
  }
}
