import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ThreadLayoutComponent } from '../../shared/thread';
import { PaydekThreadApiService } from '../../core/paydek-thread-api.service';
import { PageHeaderComponent } from '../../shared/ui';

@Component({
  selector: 'app-payroll-queries',
  standalone: true,
  imports: [CommonModule, ThreadLayoutComponent, PageHeaderComponent],
  template: `
    <div class="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <ui-page-header
        title="Queries & Tickets"
        subtitle="Manage payroll queries, clarifications, and support tickets">
      </ui-page-header>
      <app-thread-layout
        [api]="api"
        title="Tickets"
        [canClose]="true"
        [canResolve]="true"
        [canReopen]="true">
      </app-thread-layout>
    </div>
  `,
})
export class PayrollQueriesComponent {
  constructor(public api: PaydekThreadApiService) {}
}
