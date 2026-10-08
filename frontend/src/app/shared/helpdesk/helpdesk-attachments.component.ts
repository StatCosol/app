import { ChangeDetectorRef, Component, Input, OnDestroy } from '@angular/core';
import { Subscription, finalize } from 'rxjs';
import { ProtectedFileService } from '../files/services/protected-file.service';
import { IconComponent } from '../ui/icon/icon.component';

@Component({
  selector: 'app-helpdesk-attachments',
  standalone: true,
  imports: [IconComponent],
  template: `
    @for (file of attachments; track file.url) {
      <button type="button" class="compact-action flex items-center gap-2 max-w-full text-left text-sm text-brand-700 py-2 disabled:opacity-50"
              [disabled]="disabled || !!downloading" (click)="download(file)"
              [attr.aria-label]="'Download ' + file.name" [title]="disabled ? 'Ticket assignment required' : 'Download ' + file.name" title="download" aria-label="download" data-action-label="download" data-action-icon="download"><ui-icon name="download" [size]="20" /><span class="compact-action-label">
        <ui-icon name="download" class="shrink-0" />
        <span class="min-w-0 break-all">{{ file.name }}</span>
      </span></button>
    }
    @if (downloading) { <p role="status" class="text-xs text-gray-500">Downloading...</p> }
    @if (error) { <p role="alert" class="text-sm text-red-700">{{ error }}</p> }
  `,
})
export class HelpdeskAttachmentsComponent implements OnDestroy {
  @Input() attachments: { name: string; url: string }[] = [];
  @Input() disabled = false;
  downloading = '';
  error = '';
  private request?: Subscription;

  constructor(private files: ProtectedFileService, private cdr: ChangeDetectorRef) {}

  download(file: { name: string; url: string }): void {
    if (this.disabled || this.downloading || !file.url) return;
    this.error = '';
    this.downloading = file.url;
    // Always use our authenticated endpoint, never navigate to a storage URL.
    const url = `/api/v1/files/download?p=${encodeURIComponent(file.url)}`;
    this.request = this.files.download(url, file.name).pipe(finalize(() => {
      this.downloading = '';
      this.cdr.markForCheck();
    })).subscribe({ error: (err) => {
      this.error = err?.status === 403
        ? 'You do not have permission to download this attachment.'
        : 'Attachment could not be downloaded. Please retry.';
    } });
  }

  ngOnDestroy(): void { this.request?.unsubscribe(); }
}
