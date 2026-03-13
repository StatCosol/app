import { Component } from '@angular/core';
import { AdminNotificationsComponent } from './admin-notifications.component';

@Component({
  standalone: true,
  selector: 'app-admin-helpdesk-center-page',
  imports: [AdminNotificationsComponent],
  template: `<app-admin-notifications></app-admin-notifications>`,
})
export class AdminHelpdeskCenterPageComponent {}
