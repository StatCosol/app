import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ThreadLayoutComponent } from '../../shared/thread';
import { ClientThreadApiService } from '../../core/client-thread-api.service';
import { CreateQueryComponent } from '../../shared/notifications/create-query/create-query.component';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-client-support',
  standalone: true,
  imports: [CommonModule, ThreadLayoutComponent, CreateQueryComponent],
  template: `
    <div class="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <!-- Tabs -->
      <div class="flex items-center gap-1 mb-6 bg-gray-100 rounded-xl p-1 w-fit">
        <button (click)="tab='raise'"
          class="px-5 py-2.5 rounded-lg text-sm transition-all"
          [class]="tab === 'raise' ? 'bg-white shadow-sm text-gray-900 font-semibold' : 'text-gray-500 hover:text-gray-700'">
          Raise Query
        </button>
        <button (click)="tab='threads'"
          class="px-5 py-2.5 rounded-lg text-sm transition-all"
          [class]="tab === 'threads' ? 'bg-white shadow-sm text-gray-900 font-semibold' : 'text-gray-500 hover:text-gray-700'">
          My Threads
        </button>
      </div>

      <div *ngIf="tab === 'raise'" class="card p-6">
        <h3 class="text-lg font-semibold text-gray-900 mb-2">Submit a New Query</h3>
        <app-create-query [clientId]="clientId"></app-create-query>
      </div>

      <div *ngIf="tab === 'threads'">
        <app-thread-layout
          [api]="api"
          title="My Queries"
          [canClose]="false"
          [canResolve]="true"
          [canReopen]="false">
        </app-thread-layout>
      </div>
    </div>
  `,
})
export class ClientSupportComponent {
  clientId?: string;
  tab: 'raise' | 'threads' = 'raise';

  constructor(public api: ClientThreadApiService, private auth: AuthService) {
    const user = this.auth.getUser();
    this.clientId = user?.clientId ? String(user.clientId) : undefined;
  }
}
