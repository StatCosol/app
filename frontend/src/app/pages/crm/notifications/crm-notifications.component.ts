import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PageHeaderComponent } from '../../../shared/ui';
import { InboxComponent } from '../../../shared/notifications/inbox/inbox.component';

@Component({
  selector: 'app-crm-notifications',
  standalone: true,
  imports: [CommonModule, InboxComponent, PageHeaderComponent],
  template: `
    <main class="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <ui-page-header title="CRM · Notifications" description="" icon="bell"></ui-page-header>
      <div class="card">
        <app-notification-inbox></app-notification-inbox>
      </div>
    </main>
  `,
})
export class CrmNotificationsComponent {}
