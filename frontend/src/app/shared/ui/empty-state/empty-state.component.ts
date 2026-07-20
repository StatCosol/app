import { Component, Input , ChangeDetectionStrategy} from '@angular/core';


@Component({
  selector: 'ui-empty-state',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  template: `
    <div class="text-center py-16 px-4" style="animation: fadeUp 0.4s ease-out both">
      <!-- Icon -->
      <div class="mx-auto w-16 h-16 flex items-center justify-center rounded-2xl bg-gray-100 mb-5">
        <ng-content select="[slot=icon]"></ng-content>
        @if (!hasCustomIcon) {
<svg class="h-8 w-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path>
        </svg>
}
      </div>

      <!-- Title -->
      <h3 class="text-lg font-semibold text-gray-900 mb-1.5">{{ title }}</h3>

      <!-- Description -->
      @if (description) {
<p class="text-sm text-gray-500 max-w-sm mx-auto mb-6 leading-relaxed">{{ description }}</p>
}

      <!-- Action -->
      @if (showAction) {
<div>
        <ng-content select="[slot=action]"></ng-content>
      </div>
}
    </div>
  `
})
export class EmptyStateComponent {
  @Input() title = 'No data found';
  @Input() description = '';
  @Input() showAction = false;
  @Input() hasCustomIcon = false;
}
