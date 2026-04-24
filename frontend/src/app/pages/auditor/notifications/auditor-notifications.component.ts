import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PageHeaderComponent } from '../../../shared/ui';
import { ThreadLayoutComponent } from '../../../shared/thread';
import { AuditorThreadApiService } from '../../../core/auditor-thread-api.service';

@Component({
  selector: 'app-auditor-notifications',
  standalone: true,
  imports: [CommonModule, PageHeaderComponent, ThreadLayoutComponent],
  template: `
    <main class="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <ui-page-header
        title="AuditXpert Notifications"
        description="Audit reminders, correction updates, routed queries, and daily non-compliance follow-ups"
        icon="bell">
      </ui-page-header>

      <app-thread-layout
        [api]="api"
        title="Notifications"
        [canClose]="false"
        [canResolve]="false"
        [canReopen]="false">
      </app-thread-layout>
    </main>
  `,
})
export class AuditorNotificationsComponent {
  constructor(public readonly api: AuditorThreadApiService) {}
}
