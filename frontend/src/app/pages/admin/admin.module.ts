import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { AdminNotificationsComponent } from './notifications/admin-notifications.component';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    AdminNotificationsComponent, // Standalone component import
  ],
})
export class AdminModule {}
