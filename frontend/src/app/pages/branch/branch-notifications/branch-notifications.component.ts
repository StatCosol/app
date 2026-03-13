import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ThreadLayoutComponent } from '../../../shared/thread';
import { PageHeaderComponent } from '../../../shared/ui';
import { BranchThreadApiService } from '../../../core/branch-thread-api.service';

@Component({
  selector: 'app-branch-notifications',
  standalone: true,
  imports: [CommonModule, ThreadLayoutComponent, PageHeaderComponent],
  template: `
    <main class="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <ui-page-header
        title="Branch Notifications"
        subtitle="System alerts and routed queries in a unified thread inbox">
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
export class BranchNotificationsComponent {
  constructor(public readonly api: BranchThreadApiService) {}
}
