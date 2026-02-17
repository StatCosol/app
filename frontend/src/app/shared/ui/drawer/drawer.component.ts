import { Component, Input, Output, EventEmitter, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';

export type DrawerPosition = 'left' | 'right';
export type DrawerSize = 'sm' | 'md' | 'lg' | 'xl';

@Component({
  selector: 'ui-drawer',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div *ngIf="isOpen" class="fixed inset-0 z-50 overflow-hidden" role="dialog" aria-modal="true">
      <!-- Backdrop -->
      <div
        class="fixed inset-0 bg-gray-900/50 backdrop-blur-sm transition-opacity"
        (click)="closeOnBackdrop && close()">
      </div>

      <!-- Drawer Panel -->
      <div class="fixed inset-y-0 flex" [ngClass]="positionClasses">
        <div [ngClass]="drawerClasses" class="relative flex flex-col bg-white shadow-xl">
          <!-- Header -->
          <div class="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <h2 *ngIf="title" class="text-lg font-semibold text-gray-900">{{ title }}</h2>
            <button
              type="button"
              class="rounded-lg p-1.5 text-gray-400 hover:text-gray-500 hover:bg-gray-100 transition-colors"
              (click)="close()">
              <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>

          <!-- Body -->
          <div class="flex-1 overflow-y-auto px-6 py-4">
            <ng-content></ng-content>
          </div>

          <!-- Footer -->
          <div *ngIf="showFooter" class="px-6 py-4 border-t border-gray-200 bg-gray-50">
            <ng-content select="[slot=footer]"></ng-content>
          </div>
        </div>
      </div>
    </div>
  `
})
export class DrawerComponent {
  @Input() isOpen = false;
  @Input() title = '';
  @Input() position: DrawerPosition = 'right';
  @Input() size: DrawerSize = 'md';
  @Input() showFooter = false;
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

  get positionClasses(): string {
    return this.position === 'left' ? 'left-0' : 'right-0';
  }

  get drawerClasses(): string {
    const sizeClasses: Record<DrawerSize, string> = {
      sm: 'w-80',
      md: 'w-96',
      lg: 'w-[32rem]',
      xl: 'w-[40rem]',
    };
    return sizeClasses[this.size];
  }
}
