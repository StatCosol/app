import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'ui-rejection-reason-box',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div *ngIf="reason" class="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
      <div class="font-semibold mb-1">Rejection Reason</div>
      <div>{{ reason }}</div>
    </div>
  `,
})
export class RejectionReasonBoxComponent {
  @Input() reason = '';
}
