import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ThreadLayoutComponent } from '../../shared/thread';
import { PageHeaderComponent } from '../../shared/ui';
import { CeoThreadApiService } from '../../core/ceo-thread-api.service';

@Component({
  selector: 'app-ceo-notifications',
  standalone: true,
  imports: [CommonModule, ThreadLayoutComponent, PageHeaderComponent],
  template: `
    <main class="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <ui-page-header
        title="CEO Notifications"
        subtitle="Executive message center for escalations, risk alerts, and cross-role threads">
      </ui-page-header>

      <app-thread-layout
        [api]="api"
        title="CEO Thread Inbox"
        [canClose]="true"
        [canResolve]="false"
        [canReopen]="true">
      </app-thread-layout>
    </main>
  `,
})
export class CeoNotificationsComponent {
  constructor(public readonly api: CeoThreadApiService) {}
}
