import { Component } from '@angular/core';
import { PayrollSetupComponent } from './payroll-setup.component';

@Component({
  standalone: true,
  selector: 'app-payroll-setup-tabs-page',
  imports: [PayrollSetupComponent],
  template: `<app-payroll-setup></app-payroll-setup>`,
})
export class PayrollSetupTabsPageComponent {}
