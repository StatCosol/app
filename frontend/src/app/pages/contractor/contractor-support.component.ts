import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ThreadLayoutComponent } from '../../shared/thread';
import { ContractorThreadApiService } from '../../core/contractor-thread-api.service';
import { CreateQueryComponent } from '../../shared/notifications/create-query/create-query.component';
import { AuthService } from '../../core/auth.service';
import { PageHeaderComponent } from '../../shared/ui';

@Component({
  selector: 'app-contractor-support',
  standalone: true,
  imports: [CommonModule, ThreadLayoutComponent, CreateQueryComponent, PageHeaderComponent],
  template: `
    <div class="max-w-5xl mx-auto px-4 sm:px-6 py-6">
      <ui-page-header
        title="Support & Queries"
        subtitle="Raise compliance, audit, or technical queries and track responses">
      </ui-page-header>

      <!-- Tabs -->
      <div class="flex items-center gap-1 mb-6 bg-gray-100 rounded-xl p-1 w-fit">
        <button (click)="tab='raise'"
          class="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm transition-all"
          [class]="tab === 'raise' ? 'bg-white shadow-sm text-gray-900 font-semibold' : 'text-gray-500 hover:text-gray-700'">
          Raise Query
        </button>
        <button (click)="tab='threads'"
          class="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm transition-all"
          [class]="tab === 'threads' ? 'bg-white shadow-sm text-gray-900 font-semibold' : 'text-gray-500 hover:text-gray-700'">
          My Threads
        </button>
      </div>

      <!-- Raise Query Tab -->
      <div *ngIf="tab === 'raise'" class="card p-6">
        <div class="flex items-center gap-3 mb-6">
          <div class="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
            <svg class="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
          </div>
          <div>
            <h3 class="text-lg font-semibold text-gray-900">Submit a New Query</h3>
            <p class="text-sm text-gray-500">Your query will be routed to the appropriate team based on type</p>
          </div>
        </div>
        <app-create-query [clientId]="clientId"></app-create-query>
        <div class="flex items-start gap-2 p-3 mt-4 bg-amber-50 rounded-xl border border-amber-200 text-sm text-amber-800">
          <svg class="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <span>Query routing: <b>Technical</b> &rarr; Admin &middot; <b>Compliance</b> &rarr; CRM &middot; <b>Audit</b> &rarr; Auditor. Unresolved queries auto-escalate.</span>
        </div>
      </div>

      <!-- Threads Tab -->
      <div *ngIf="tab === 'threads'">
        <app-thread-layout
          [api]="api"
          title="My Threads"
          [canClose]="false"
          [canResolve]="true"
          [canReopen]="false">
        </app-thread-layout>
      </div>
    </div>
  `,
})
export class ContractorSupportComponent {
  clientId?: string;
  tab: 'raise' | 'threads' = 'raise';

  constructor(public api: ContractorThreadApiService, private auth: AuthService) {
    const user = this.auth.getUser();
    this.clientId = user?.clientId ? String(user.clientId) : undefined;
  }
}
