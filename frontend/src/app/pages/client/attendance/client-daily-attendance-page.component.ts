import { Component } from '@angular/core';

import { ClientDailyAttendanceComponent } from './client-daily-attendance.component';

@Component({
  selector: 'app-client-daily-attendance-page',
  standalone: true,
  imports: [ClientDailyAttendanceComponent],
  template: `<app-client-daily-attendance></app-client-daily-attendance>`,
})
export class ClientDailyAttendancePage {}
