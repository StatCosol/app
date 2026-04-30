import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'ui-detail-drawer-layout',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div *ngIf="open" class="fixed inset-0 z-[1100] bg-slate-900/40" (click)="close.emit()">
      <aside class="absolute right-0 top-0 h-full w-full max-w-xl bg-white shadow-2xl border-l border-gray-200 flex flex-col" (click)="$event.stopPropagation()">
        <header class="p-4 border-b border-gray-200 flex items-start justify-between gap-2">
          <div>
            <h3 class="text-base font-semibold text-gray-900">{{ title }}</h3>
            <p *ngIf="subtitle" class="text-xs text-gray-500 mt-1">{{ subtitle }}</p>
          </div>
          <button type="button" class="text-sm font-semibold text-gray-600 hover:text-gray-900" (click)="close.emit()">Close</button>
        </header>

        <div class="flex-1 overflow-auto p-4">
          <ng-content></ng-content>
        </div>

        <footer class="border-t border-gray-200 p-3">
          <ng-content select="ui-action-footer-bar"></ng-content>
        </footer>
      </aside>
    </div>
  `,
})
export class DetailDrawerLayoutComponent {
  @Input() open = false;
  @Input() title = 'Details';
  @Input() subtitle = '';
  // eslint-disable-next-line @angular-eslint/no-output-native
  @Output() close = new EventEmitter<void>();
}
