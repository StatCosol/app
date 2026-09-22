import { CrmOperationalApiService } from '../../../core/crm-operational-api.service';
import { Component } from '@angular/core';

import { ThreadLayoutComponent } from '../../../shared/thread';
import { CrmThreadApiService } from '../../../core/crm-thread-api.service';
import { PageHeaderComponent } from '../../../shared/ui';

@Component({
  standalone: true,
  providers: [CrmOperationalApiService],
  selector: 'app-crm-requests',
  imports: [ThreadLayoutComponent, PageHeaderComponent],
  template: `
    <main class="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <ui-page-header
        title="CRM Helpdesk"
        subtitle="Client conversations and branch operational requests"
      >
      </ui-page-header>

      <div class="flex gap-2 mb-4" role="tablist" aria-label="Helpdesk queues">
        <button
          class="px-4 py-2 rounded border"
          role="tab"
          [attr.aria-selected]="queue === 'requests'"
          (click)="queue = 'requests'"
        >
          Branch requests
        </button>
        <button
          class="px-4 py-2 rounded border"
          role="tab"
          [attr.aria-selected]="queue === 'messages'"
          (click)="queue = 'messages'"
        >
          Conversations
        </button>
      </div>
      <p *ngIf="queue === 'requests'" class="text-sm text-slate-600 mb-3">
        License and audit-response requests from your assigned clients. Closing a request records
        completion of the conversation; update the related license or audit record separately.
      </p>
      <app-thread-layout
        *ngIf="queue === 'requests'"
        [api]="operationalApi"
        title="Branch requests"
        [canClose]="true"
        [canResolve]="true"
        [canReopen]="true"
      ></app-thread-layout>
      <app-thread-layout
        *ngIf="queue === 'messages'"
        [api]="api"
        title="Conversations"
        [canClose]="true"
        [canResolve]="false"
        [canReopen]="true"
      >
      </app-thread-layout>
    </main>
  `,
})
export class CrmRequestsComponent {
  queue: 'requests' | 'messages' = 'requests';
  constructor(
    public readonly api: CrmThreadApiService,
    public readonly operationalApi: CrmOperationalApiService,
  ) {}
}
