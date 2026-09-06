import { Component, Input } from '@angular/core';


@Component({
  selector: 'ui-status-change-row',
  standalone: true,
  imports: [],
  template: `
    @if (from || to) {
<div class="text-[11px] text-gray-600 flex items-center gap-1">
      <span class="font-medium">Status:</span>
      @if (from) {
<span class="px-1.5 py-0.5 rounded bg-gray-100">{{ from }}</span>
}
      @if (from && to) {
<span>?</span>
}
      @if (to) {
<span class="px-1.5 py-0.5 rounded bg-brand-100 text-brand-700">{{ to }}</span>
}
    </div>
}
  `,
})
export class StatusChangeRowComponent {
  @Input() from: string | null = null;
  @Input() to: string | null = null;
}
