import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ThreadLayoutComponent } from '../../../shared/thread';
import { ContractorThreadApiService } from '../../../core/contractor-thread-api.service';
import { PageHeaderComponent } from '../../../shared/ui';

@Component({
  selector: 'app-contractor-notifications',
  standalone: true,
  imports: [CommonModule, ThreadLayoutComponent, PageHeaderComponent],
  template: `
    <main class="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <ui-page-header
        title="Contractor · Notifications"
        description="System alerts about submissions, approvals, rejections, escalations, and queries"
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
export class ContractorNotificationsComponent {
  constructor(public api: ContractorThreadApiService) {}
}
