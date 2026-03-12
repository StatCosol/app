import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'status-change-row',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div *ngIf="from || to" class="text-[11px] text-gray-600 flex items-center gap-1">
      <span class="font-medium">Status:</span>
      <span *ngIf="from" class="px-1.5 py-0.5 rounded bg-gray-100">{{ from }}</span>
      <span *ngIf="from && to">?</span>
      <span *ngIf="to" class="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">{{ to }}</span>
    </div>
  `,
})
export class StatusChangeRowComponent {
  @Input() from: string | null = null;
  @Input() to: string | null = null;
}
