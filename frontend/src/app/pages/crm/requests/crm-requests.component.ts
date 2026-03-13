import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ThreadLayoutComponent } from '../../../shared/thread';
import { CrmThreadApiService } from '../../../core/crm-thread-api.service';
import { PageHeaderComponent } from '../../../shared/ui';

@Component({
  standalone: true,
  selector: 'app-crm-requests',
  imports: [CommonModule, ThreadLayoutComponent, PageHeaderComponent],
  template: `
    <main class="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <ui-page-header
        title="CRM Helpdesk"
        subtitle="Unified queue for client, branch, and contractor queries requiring CRM action">
      </ui-page-header>

      <app-thread-layout
        [api]="api"
        title="Helpdesk Threads"
        [canClose]="true"
        [canResolve]="true"
        [canReopen]="true">
      </app-thread-layout>
    </main>
  `,
})
export class CrmRequestsComponent {
  constructor(public readonly api: CrmThreadApiService) {}
}
