import { Component } from '@angular/core';
import { ClientPayrollComponent } from './client-payroll.component';

@Component({
  standalone: true,
  selector: 'app-client-payroll-monitoring-page',
  imports: [ClientPayrollComponent],
  template: `<app-client-payroll></app-client-payroll>`,
})
export class ClientPayrollMonitoringPageComponent {}
