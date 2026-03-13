import { Component } from '@angular/core';
import { EssAttendanceComponent } from './ess-attendance.component';

@Component({
  standalone: true,
  selector: 'app-ess-attendance-page',
  imports: [EssAttendanceComponent],
  template: `<app-ess-attendance></app-ess-attendance>`,
})
export class EssAttendancePageComponent {}
