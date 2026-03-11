import { Component } from '@angular/core';
import { PayrollFnfComponent } from './payroll-fnf.component';

@Component({
  standalone: true,
  selector: 'app-payroll-ff-lifecycle-page',
  imports: [PayrollFnfComponent],
  template: `<app-payroll-fnf></app-payroll-fnf>`,
})
export class PayrollFfLifecyclePageComponent {}
