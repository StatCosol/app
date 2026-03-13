import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ThreadLayoutComponent } from '../../shared/thread';
import { PageHeaderComponent } from '../../shared/ui';
import { CcoThreadApiService } from '../../core/cco-thread-api.service';

@Component({
  selector: 'app-cco-notifications',
  standalone: true,
  imports: [CommonModule, ThreadLayoutComponent, PageHeaderComponent],
  template: `
    <main class="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <ui-page-header
        title="CCO Notifications"
        subtitle="Exception threads, escalations, and governance communication in one workbench">
      </ui-page-header>

      <app-thread-layout
        [api]="api"
        title="CCO Thread Inbox"
        [canClose]="true"
        [canResolve]="false"
        [canReopen]="true">
      </app-thread-layout>
    </main>
  `,
})
export class CcoNotificationsComponent {
  constructor(public readonly api: CcoThreadApiService) {}
}
