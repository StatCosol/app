import { Component } from '@angular/core';
import { ClientAttendanceComponent } from './client-attendance.component';

@Component({
  standalone: true,
  selector: 'app-client-attendance-review-page',
  imports: [ClientAttendanceComponent],
  template: `<app-client-attendance></app-client-attendance>`,
})
export class ClientAttendanceReviewPageComponent {}
