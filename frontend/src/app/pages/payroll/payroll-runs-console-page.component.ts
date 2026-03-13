import { Component } from '@angular/core';
import { PayrollRunsComponent } from './payroll-runs.component';

@Component({
  standalone: true,
  selector: 'app-payroll-runs-console-page',
  imports: [PayrollRunsComponent],
  template: `<app-payroll-runs></app-payroll-runs>`,
})
export class PayrollRunsConsolePageComponent {}
