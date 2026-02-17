
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { InboxComponent } from '../../../shared/notifications/inbox/inbox.component';
import { PageHeaderComponent } from '../../../shared/ui';

@Component({
  selector: 'app-admin-notifications',
  standalone: true,
  imports: [CommonModule, InboxComponent, PageHeaderComponent],
  template: `
    <div class="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <ui-page-header
        title="Admin Notifications"
        description="System notifications and alerts"
        icon="bell">
      </ui-page-header>
      <div class="card">
        <app-notification-inbox [adminAll]="true"></app-notification-inbox>
      </div>
    </div>
  `,
})
export class AdminNotificationsComponent {}
