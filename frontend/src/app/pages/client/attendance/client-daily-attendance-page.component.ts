import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ClientDailyAttendanceComponent } from './client-daily-attendance.component';

@Component({
  selector: 'app-client-daily-attendance-page',
  standalone: true,
  imports: [CommonModule, ClientDailyAttendanceComponent],
  template: `<app-client-daily-attendance></app-client-daily-attendance>`,
})
export class ClientDailyAttendancePage {}
