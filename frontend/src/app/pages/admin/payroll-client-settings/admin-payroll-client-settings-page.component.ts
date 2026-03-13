import { Component } from '@angular/core';
import { AdminPayrollClientSettingsComponent } from './admin-payroll-client-settings.component';

@Component({
  standalone: true,
  selector: 'app-admin-payroll-client-settings-page',
  imports: [AdminPayrollClientSettingsComponent],
  template: `<app-admin-payroll-client-settings></app-admin-payroll-client-settings>`,
})
export class AdminPayrollClientSettingsPageComponent {}

