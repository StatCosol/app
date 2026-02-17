import { Component, Input, Output, EventEmitter, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

@Component({
  selector: 'ui-modal',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div *ngIf="isOpen" class="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true">
      <!-- Backdrop -->
      <div
        class="fixed inset-0 bg-gray-900/50 backdrop-blur-sm transition-opacity"
        (click)="closeOnBackdrop && close()">
      </div>

      <!-- Modal Panel -->
      <div class="flex min-h-full items-center justify-center p-4">
        <div
          [ngClass]="modalClasses"
          class="relative transform overflow-hidden rounded-xl bg-white shadow-xl transition-all"
          (click)="$event.stopPropagation()">

          <!-- Header -->
          <div *ngIf="title || showCloseButton" class="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <h3 *ngIf="title" class="text-lg font-semibold text-gray-900">{{ title }}</h3>
            <button
              *ngIf="showCloseButton"
              type="button"
              class="rounded-lg p-1.5 text-gray-400 hover:text-gray-500 hover:bg-gray-100 transition-colors"
              (click)="close()">
              <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>

          <!-- Body -->
          <div class="px-6 py-4">
            <ng-content></ng-content>
          </div>

          <!-- Footer -->
          <div *ngIf="showFooter" class="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-end gap-3">
            <ng-content select="[slot=footer]"></ng-content>
          </div>
        </div>
      </div>
    </div>
  `
})
export class ModalComponent {
  @Input() isOpen = false;
  @Input() title = '';
  @Input() size: ModalSize = 'md';
  @Input() showCloseButton = true;
  @Input() showFooter = true;
  @Input() closeOnBackdrop = true;
  @Input() closeOnEscape = true;

  @Output() closed = new EventEmitter<void>();

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.isOpen && this.closeOnEscape) {
      this.close();
    }
  }

  close(): void {
    this.closed.emit();
  }

  get modalClasses(): string {
    const sizeClasses: Record<ModalSize, string> = {
      sm: 'w-full max-w-sm',
      md: 'w-full max-w-md',
      lg: 'w-full max-w-lg',
      xl: 'w-full max-w-xl',
      full: 'w-full max-w-4xl',
    };
    return sizeClasses[this.size];
  }
}
