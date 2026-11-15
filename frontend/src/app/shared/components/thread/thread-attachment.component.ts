import { ChangeDetectorRef, Component, Input, OnChanges, OnDestroy } from '@angular/core';
import { finalize, Subscription, take } from 'rxjs';
import { ProtectedFileService } from '../../files/services/protected-file.service';

@Component({
  selector: 'ui-thread-attachment',
  standalone: true,
  host: { class: 'block min-w-0 max-w-full' },
  template: `
    <button
      type="button"
      class="standard-action min-w-0 max-w-full h-auto text-left whitespace-normal text-brand-700 disabled:opacity-60"
      [disabled]="!url || downloading"
      [attr.aria-busy]="downloading"
      (click)="download()"
    >
      <svg
        class="w-4 h-4 shrink-0"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        aria-hidden="true"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M12 3v12m-4-4 4 4 4-4M5 17v4h14v-4"
        />
      </svg>
      <span class="min-w-0 break-all"
        >{{ fileName || 'Attachment' }}{{ downloading ? ' — Downloading…' : '' }}</span
      >
    </button>
    @if (!url) {
      <p class="text-xs text-gray-500 mt-1">File unavailable</p>
    }
    @if (downloadError) {
      <p role="alert" class="text-sm text-red-700 mt-1 break-all">{{ downloadError }}</p>
    }
  `,
})
export class ThreadAttachmentComponent implements OnChanges, OnDestroy {
  @Input() url?: string | null;
  @Input() fileName?: string | null;
  @Input() contextId = '';
  downloading = false;
  downloadError = '';
  private request?: Subscription;
  private destroyed = false;

  constructor(
    private readonly files: ProtectedFileService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnChanges(): void {
    this.request?.unsubscribe();
    this.request = undefined;
    this.downloading = false;
    this.downloadError = '';
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.request?.unsubscribe();
  }

  download(): void {
    if (!this.url || this.downloading || this.destroyed) return;
    this.downloading = true;
    this.downloadError = '';
    this.request = this.files
      .download(this.url, this.fileName || 'attachment')
      .pipe(
        take(1),
        finalize(() => {
          this.downloading = false;
          if (!this.destroyed) this.cdr.markForCheck();
        }),
      )
      .subscribe({
        error: () => {
          this.downloadError =
            'Could not download ' + (this.fileName || 'the attachment') + '. Try again.';
        },
      });
  }
}
