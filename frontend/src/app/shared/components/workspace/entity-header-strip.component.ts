import { Component, Input } from '@angular/core';


@Component({
  selector: 'ui-entity-header-strip',
  standalone: true,
  imports: [],
  template: `
    <div class="rounded-lg border border-gray-200 bg-gray-50 p-3">
      <div class="text-sm font-semibold text-gray-900">{{ title }}</div>
      @if (subtitle) {
<div class="text-xs text-gray-500 mt-0.5">{{ subtitle }}</div>
}
      @if (meta.length) {
<div class="grid grid-cols-2 gap-2 mt-3 text-xs">
        @for (m of meta; track m) {
<div class="rounded border border-gray-200 bg-white p-2">
          <div class="text-gray-500">{{ m.label }}</div>
          <div class="text-gray-900 font-semibold">{{ m.value }}</div>
        </div>
}
      </div>
}
    </div>
  `,
})
export class EntityHeaderStripComponent {
  @Input() title = '';
  @Input() subtitle = '';
  @Input() meta: Array<{ label: string; value: string | number | null | undefined }> = [];
}

