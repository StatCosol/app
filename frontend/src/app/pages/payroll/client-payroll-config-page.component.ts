import { Component } from '@angular/core';
import { ClientPayrollConfigComponent } from './client-payroll-config.component';

@Component({
  standalone: true,
  imports: [ClientPayrollConfigComponent],
  template: `<app-client-payroll-config></app-client-payroll-config>`,
})
export class ClientPayrollConfigPageComponent {}
