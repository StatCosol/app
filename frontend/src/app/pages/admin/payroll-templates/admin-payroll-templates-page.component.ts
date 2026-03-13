import { Component } from '@angular/core';
import { AdminPayrollTemplatesComponent } from './admin-payroll-templates.component';

@Component({
  standalone: true,
  selector: 'app-admin-payroll-templates-page',
  imports: [AdminPayrollTemplatesComponent],
  template: `<app-admin-payroll-templates></app-admin-payroll-templates>`,
})
export class AdminPayrollTemplatesPageComponent {}

